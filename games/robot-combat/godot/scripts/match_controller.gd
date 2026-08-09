class_name MatchController
extends Node3D

signal match_started(player_machine: String, training_machine: String)
signal hud_changed(snapshot: Dictionary)
signal match_finished(result: Dictionary)

const MATCH_LENGTH_SECONDS := 180.0
const DAMAGE_INTERVAL := 0.22
const RobotBodyScript := preload("res://scripts/robot_body.gd")

var player_robot: RobotBody
var training_robot: RobotBody
var match_active := false
var time_remaining := MATCH_LENGTH_SECONDS
var last_result := {}
var _damage_clock := 0.0
var _player_spawn := Transform3D.IDENTITY
var _training_spawn := Transform3D.IDENTITY
var _player_machine := "RAMMER"
var _player_paint := Color("#c99f3d")
var _rebuilt_blueprint := {}

func begin_match(machine: String, paint: Color, player_spawn: Vector3, training_spawn: Vector3, rebuilt_blueprint: Dictionary = {}) -> void:
	_clear_robots()
	_player_machine = machine.to_upper()
	_player_paint = paint
	_rebuilt_blueprint = rebuilt_blueprint
	_player_spawn = Transform3D(Basis(Vector3.UP, -PI * 0.5), player_spawn)
	_training_spawn = Transform3D(Basis(Vector3.UP, PI * 0.5), training_spawn)
	player_robot = _spawn_robot(_player_machine, paint, true, _player_spawn)
	if rebuilt_blueprint.get("accepted", false):
		player_robot.apply_authoritative_blueprint(rebuilt_blueprint.blueprint, str(rebuilt_blueprint.blueprint_hash))
	var training_machine := _training_machine_for(_player_machine)
	training_robot = _spawn_robot(training_machine, _training_color(training_machine), false, _training_spawn)
	time_remaining = MATCH_LENGTH_SECONDS
	_damage_clock = 0.0
	last_result = {}
	match_active = true
	match_started.emit(player_robot.machine_name, training_robot.machine_name)
	_emit_hud()

func reset_match() -> void:
	begin_match(_player_machine, _player_paint, _player_spawn.origin, _training_spawn.origin, _rebuilt_blueprint)

func stop_match() -> void:
	match_active = false
	if is_instance_valid(player_robot):
		player_robot.freeze = true
	if is_instance_valid(training_robot):
		training_robot.freeze = true

func _physics_process(delta: float) -> void:
	if not match_active or not is_instance_valid(player_robot) or not is_instance_valid(training_robot):
		return
	time_remaining = maxf(0.0, time_remaining - delta)
	_update_training_intent()
	_damage_clock += delta
	if _damage_clock >= DAMAGE_INTERVAL:
		_damage_clock = 0.0
		_server_resolve_contact_damage()
	_server_resolve_boundaries()
	if time_remaining <= 0.0 and match_active:
		_finish_by_clock()
	_emit_hud()

func authoritative_snapshot() -> Dictionary:
	return {
		"server_authoritative": true,
		"rules_version": "BAY13_MATCH_RULES_V1",
		"clock_seconds": time_remaining,
		"active": match_active,
		"player": player_robot.authoritative_snapshot() if is_instance_valid(player_robot) else {},
		"training": training_robot.authoritative_snapshot() if is_instance_valid(training_robot) else {},
		"result": last_result,
	}

func _spawn_robot(machine: String, paint: Color, player_controlled: bool, spawn_transform: Transform3D) -> RobotBody:
	var robot: RobotBody = RobotBodyScript.new()
	robot.name = "PlayerRobot" if player_controlled else "TrainingRobot"
	robot.configure(machine, paint, player_controlled)
	robot.transform = spawn_transform
	robot.knocked_out.connect(_on_robot_knocked_out)
	add_child(robot)
	return robot

func _clear_robots() -> void:
	for robot in [player_robot, training_robot]:
		if is_instance_valid(robot):
			robot.queue_free()
	player_robot = null
	training_robot = null

func _update_training_intent() -> void:
	var offset := player_robot.global_position - training_robot.global_position
	offset.y = 0.0
	if offset.length() < 0.1:
		training_robot.set_ai_intent(0.0, 0.0, true)
		return
	var local_target := training_robot.global_transform.basis.inverse() * offset.normalized()
	var steer := clampf(-local_target.x * 2.2, -1.0, 1.0)
	var facing := clampf(-local_target.z, -1.0, 1.0)
	var throttle := 0.82 if facing > 0.15 else 0.38
	training_robot.set_ai_intent(throttle, steer, offset.length() < 3.0)

func _server_resolve_contact_damage() -> void:
	var distance := player_robot.global_position.distance_to(training_robot.global_position)
	if distance > 2.65:
		return
	var relative_speed := (player_robot.linear_velocity - training_robot.linear_velocity).length()
	if relative_speed > 2.2:
		var impact_damage := clampf((relative_speed - 2.0) * 0.42, 0.0, 4.5)
		player_robot.server_apply_damage(impact_damage)
		training_robot.server_apply_damage(impact_damage)
	if player_robot.weapon_active:
		training_robot.server_apply_damage(_weapon_damage(player_robot.machine_key, relative_speed))
	if training_robot.weapon_active:
		player_robot.server_apply_damage(_weapon_damage(training_robot.machine_key, relative_speed))

func _weapon_damage(machine: String, relative_speed: float) -> float:
	match machine:
		"RIPPER": return 3.4 + relative_speed * 0.18
		"MAUL": return 6.4 + relative_speed * 0.1
		_: return 2.2 + relative_speed * 0.24

func _server_resolve_boundaries() -> void:
	for robot in [player_robot, training_robot]:
		if not is_instance_valid(robot):
			continue
		var p: Vector3 = robot.global_position
		if p.y < -2.0 or absf(p.x) > 13.2 or absf(p.z) > 9.2:
			_finish_match(training_robot if robot == player_robot else player_robot, "ARENA_OUT")
			return

func _on_robot_knocked_out(robot: RobotBody) -> void:
	if not match_active:
		return
	_finish_match(training_robot if robot == player_robot else player_robot, "KNOCKOUT")

func _finish_by_clock() -> void:
	if player_robot.health > training_robot.health:
		_finish_match(player_robot, "JUDGES_DECISION")
	elif training_robot.health > player_robot.health:
		_finish_match(training_robot, "JUDGES_DECISION")
	else:
		_finish_match(null, "DRAW")

func _finish_match(winner: RobotBody, reason: String) -> void:
	if not match_active:
		return
	match_active = false
	player_robot.set_ai_intent(0.0, 0.0, false)
	training_robot.set_ai_intent(0.0, 0.0, false)
	player_robot.weapon_active = false
	training_robot.weapon_active = false
	last_result = {
		"winner": winner.machine_name if is_instance_valid(winner) else "Draw",
		"reason": reason,
		"player_health": snappedf(player_robot.health, 0.1),
		"training_health": snappedf(training_robot.health, 0.1),
		"elapsed_seconds": snappedf(MATCH_LENGTH_SECONDS - time_remaining, 0.1),
	}
	_emit_hud()
	match_finished.emit(last_result)

func _emit_hud() -> void:
	hud_changed.emit(authoritative_snapshot())

func _training_machine_for(player_machine: String) -> String:
	match player_machine:
		"RAMMER": return "RIPPER"
		"RIPPER": return "MAUL"
		_: return "RAMMER"

func _training_color(machine: String) -> Color:
	match machine:
		"RIPPER": return Color("#3d928c")
		"MAUL": return Color("#b55c32")
		_: return Color("#c39a38")
