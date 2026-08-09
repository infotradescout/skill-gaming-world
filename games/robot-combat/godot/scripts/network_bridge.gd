class_name Bay13NetworkBridge
extends Node

signal control_intent_received(peer_id: int, intent: Dictionary)
signal server_snapshot_received(snapshot: Dictionary)
signal smoke_completed(role: String)
signal smoke_failed(role: String, message: String)

const PROTOCOL_VERSION := "BAY13_WEBSOCKET_AUTHORITY_V1"

var role := "offline"
var peer: WebSocketMultiplayerPeer
var _deadline_ms := 0
var _connection_seen_ms := 0
var _last_sequence_by_peer := {}

func start_server(port: int) -> Error:
	role = "server"
	peer = WebSocketMultiplayerPeer.new()
	var error := peer.create_server(port, "127.0.0.1")
	if error != OK:
		return error
	multiplayer.multiplayer_peer = peer
	multiplayer.peer_connected.connect(_on_peer_connected)
	multiplayer.peer_disconnected.connect(_on_peer_disconnected)
	_deadline_ms = Time.get_ticks_msec() + 12000
	print("NETWORK_SERVER_LISTENING:%d:%s" % [port, PROTOCOL_VERSION])
	return OK

func start_client(url: String) -> Error:
	role = "client"
	peer = WebSocketMultiplayerPeer.new()
	var error := peer.create_client(url)
	if error != OK:
		return error
	multiplayer.multiplayer_peer = peer
	multiplayer.connected_to_server.connect(_on_connected_to_server)
	multiplayer.connection_failed.connect(_on_connection_failed)
	multiplayer.server_disconnected.connect(_on_server_disconnected)
	_deadline_ms = Time.get_ticks_msec() + 12000
	print("NETWORK_CLIENT_CONNECTING:%s:%s" % [url, PROTOCOL_VERSION])
	return OK

func submit_local_intent(intent: Dictionary) -> void:
	if role == "client" and multiplayer.multiplayer_peer != null:
		submit_control_intent.rpc_id(1, intent)

func publish_authoritative_snapshot(snapshot: Dictionary) -> void:
	if role == "server" and multiplayer.multiplayer_peer != null:
		receive_server_snapshot.rpc(snapshot)

@rpc("any_peer", "call_remote", "unreliable_ordered", 0)
func submit_control_intent(intent: Dictionary) -> void:
	if role != "server" or not multiplayer.is_server():
		return
	var sender := multiplayer.get_remote_sender_id()
	var sequence := int(intent.get("sequence", 0))
	var prior := int(_last_sequence_by_peer.get(sender, 0))
	if sequence != prior + 1:
		return
	_last_sequence_by_peer[sender] = sequence
	# Only time-ordered control intent crosses this boundary. Position, collision,
	# damage, score, and result values are never accepted from a client.
	control_intent_received.emit(sender, {
		"sequence": sequence,
		"throttle": clampf(float(intent.get("throttle", 0.0)), -1.0, 1.0),
		"steer": clampf(float(intent.get("steer", 0.0)), -1.0, 1.0),
		"weapon": bool(intent.get("weapon", false)),
	})

@rpc("authority", "call_remote", "unreliable_ordered", 1)
func receive_server_snapshot(snapshot: Dictionary) -> void:
	if role == "client":
		server_snapshot_received.emit(snapshot)

func _process(_delta: float) -> void:
	var now := Time.get_ticks_msec()
	if _deadline_ms > 0 and now >= _deadline_ms:
		_deadline_ms = 0
		smoke_failed.emit(role, "WebSocket handshake exceeded the wall-clock deadline.")
		return
	if _connection_seen_ms > 0:
		var grace := 1000 if role == "server" else 500
		if now - _connection_seen_ms >= grace:
			_connection_seen_ms = 0
			_deadline_ms = 0
			smoke_completed.emit(role)

func _on_peer_connected(peer_id: int) -> void:
	print("NETWORK_SERVER_PEER_CONNECTED:%d" % peer_id)
	_connection_seen_ms = Time.get_ticks_msec()

func _on_peer_disconnected(peer_id: int) -> void:
	_last_sequence_by_peer.erase(peer_id)

func _on_connected_to_server() -> void:
	print("NETWORK_CLIENT_CONNECTED")
	_connection_seen_ms = Time.get_ticks_msec()

func _on_connection_failed() -> void:
	_deadline_ms = 0
	smoke_failed.emit(role, "WebSocket client connection failed.")

func _on_server_disconnected() -> void:
	if _connection_seen_ms == 0 and _deadline_ms > 0:
		_deadline_ms = 0
		smoke_failed.emit(role, "Server disconnected before handshake proof completed.")
