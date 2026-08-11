class_name RobotCombatRemoteMatchBridge
extends Node

signal snapshot_received(snapshot: Dictionary)
signal status_changed(message: String)
signal failed(message: String)

const POLL_SECONDS := 0.9

var match_id := ""
var player_slot := "A"
var _origin := ""
var _request: HTTPRequest
var _poll_timer: Timer
var _request_in_flight := false

func configure(next_match_id: String, next_player_slot: String) -> void:
	match_id = next_match_id.strip_edges()
	player_slot = "B" if next_player_slot == "B" else "A"

func start() -> void:
	if match_id.is_empty():
		failed.emit("No match id was supplied to the 3D authority mirror.")
		return
	_origin = _browser_origin()
	_request = HTTPRequest.new()
	_request.name = "RobotCombatAuthorityRequest"
	_request.timeout = 8.0
	_request.request_completed.connect(_on_request_completed)
	add_child(_request)
	_poll_timer = Timer.new()
	_poll_timer.name = "RobotCombatAuthorityPoll"
	_poll_timer.wait_time = POLL_SECONDS
	_poll_timer.one_shot = false
	_poll_timer.timeout.connect(_poll)
	add_child(_poll_timer)
	status_changed.emit("Connecting to the authenticated match authority…")
	_poll()
	_poll_timer.start()

func stop() -> void:
	if is_instance_valid(_poll_timer):
		_poll_timer.stop()
	if is_instance_valid(_request):
		_request.cancel_request()
	_request_in_flight = false

static func browser_query_value(key: String) -> String:
	if not OS.has_feature("web"):
		return ""
	var window := JavaScriptBridge.get_interface("window")
	var search := str(window.location.search).trim_prefix("?")
	for pair in search.split("&"):
		var values := pair.split("=", true, 1)
		if values.size() == 2 and str(values[0]) == key:
			return str(values[1]).strip_edges()
	return ""

func _poll() -> void:
	if _request_in_flight or not is_instance_valid(_request):
		return
	_request_in_flight = true
	var url := "%s/api/robot-combat/matches/%s" % [_origin, match_id]
	var error := _request.request(url, PackedStringArray(["Accept: application/json", "Cache-Control: no-cache"]))
	if error != OK:
		_request_in_flight = false
		status_changed.emit("The authority request could not start; retrying…")

func _on_request_completed(result: int, response_code: int, _headers: PackedStringArray, body: PackedByteArray) -> void:
	_request_in_flight = false
	if result != HTTPRequest.RESULT_SUCCESS:
		status_changed.emit("The authority is not reachable yet; retrying…")
		return
	var body_text := body.get_string_from_utf8()
	var payload: Variant = JSON.parse_string(body_text)
	if response_code < 200 or response_code >= 300:
		var message := "The authority returned HTTP %d." % response_code
		if payload is Dictionary and payload.get("error") is Dictionary:
			message = str(payload.error.get("message", message))
		if response_code == 401 or response_code == 403:
			failed.emit("The 3D mirror is not authenticated for this match. Open it from the signed-in authority arena.")
		else:
			status_changed.emit("%s Retrying…" % message)
		return
	if not payload is Dictionary or not payload.get("match") is Dictionary:
		status_changed.emit("The authority returned no match snapshot; retrying…")
		return
	status_changed.emit("Live authority snapshot received.")
	snapshot_received.emit(payload.match)

func _browser_origin() -> String:
	if OS.has_feature("web"):
		var window := JavaScriptBridge.get_interface("window")
		var origin := str(window.location.origin)
		if not origin.is_empty():
			return origin
	return "http://127.0.0.1:3000"
