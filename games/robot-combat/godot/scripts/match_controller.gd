class_name MatchController
extends Node3D

signal match_started(player_machine: String, training_machine: String)
signal hud_changed(snapshot: Dictionary)
signal match_finished(result: Dictionary)

const MATCH_LENGTH_SECONDS := 180.0
const DAMAGE_INTERVAL := 0.22
const RobotBodyScript := preload("res://scripts/robot_body.gd")
const BlueprintServiceScript := preload("res://scripts/blueprint_service.gd")

var player_robot: RobotBody
var training_robot: RobotBody
var match_active := false
var time_remaining := MATCH_LENGTH_SECONDS
var last_result := {}
var _damage_clock := 0.0
var _player_spawn := Transform3D.IDENTITY
var _training_spawn := Transform3D.IDENTITY
var _player_machine := "RAMMER"
var _player_paint := Color("c99f3d")
var _rebuilt_blueprint := {}

func begin_match(machine: String, paint: Color, player_spawn: Vector3, training_spawn: Vector3, rebuilt_blueprint: Dictionary = {}) -> void:
	_clear_robots()
	_player_machine = machine.to_upper()
	_player_paint = paint
	_rebuilt_blueprint = rebuilt_blueprint
	_player_spawn = Transform3D(Basis(Vector3.UP, -PI * 0.5), player_spawn)
	_training_spawn = Transform3D(Basis(Vector3.UP, PI * 0.5), training_spawn)
	var player_build: Dictionary = rebuilt_blueprint.get("blueprint", BlueprintServiceScript.default_blueprint(_player_machine))
	player_robot = _spawn_robot(_player_machine, paint, true, _player_spawn, player_build, rebuilt_blueprint)
	var training_machine := _training_machine_for(_player_machine)
	var training_build := BlueprintServiceScript.default_blueprint(training_machine)
	var training_rebuilt := BlueprintServiceScript.server_rebuild(training_build)
	training_robot = _spawn_robot(training_machine, _training_color(training_machine), false, _training_spawn, training_build, training_rebuilt)
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
		"rules_version": "ROBOT_COMBAT_LOCAL_RULES_V1",
		"clock_seconds": time_remaining,
		"active": match_active,
		"player": player_robot.authoritative_snapshot() if is_instance_valid(player_robot) else {},
		"training": training_robot.authoritative_snapshot() if is_instance_valid(training_robot) else {},
		"result": last_result,
	}

func _spawn_robot(machine: String, paint: Color, player_controlled: bool, spawn_transform: Transform3D, blueprint: Dictionary, rebuilt: Dictionary) -> RobotBody:
	var robot: RobotBody = RobotBodyScript.new()
	robot.name = "PlayerRobot" if player_controlled else "TrainingRobot"
	robot.configure(machine, paint, player_controlled, blueprint)
	robot.transform = spawn_transform
	robot.knocked_out.connect(_on_robot_knocked_out)
	add_child(robot)
	if rebuilt.get("accepted", false):
		robot.apply_authoritative_blueprint(rebuilt, str(rebuilt.get("blueprint_hash", "UNSIGNED")))
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
	training_robot.set_ai_intent(throttle, steer, offset.length() < 3.2)

func _server_resolve_contact_damage() -> void:
	var distance := player_robot.global_position.distance_to(training_robot.global_position)
	if distance > 2.9:
		return
	var relative_speed := (player_robot.linear_velocity - training_robot.linear_velocity).length()
	if relative_speed > 1.8:
		var impact_damage := clampf((relative_speed - 1.5) * 0.46, 0.0, 5.2)
		player_robot.server_apply_damage(impact_damage, "contact shock from %s" % training_robot.machine_name)
		training_robot.server_apply_damage(impact_damage * 0.9, "contact shock from %s" % player_robot.machine_name)
	if player_robot.weapon_active:
		training_robot.server_apply_damage(_weapon_damage(player_robot, relative_speed), _weapon_cause(player_robot))
	if training_robot.weapon_active:
		player_robot.server_apply_damage(_weapon_damage(training_robot, relative_speed), _weapon_cause(training_robot))

func _weapon_damage(robot: RobotBody, relative_speed: float) -> float:
	var reach := 1.0
	if robot.build_metrics.has("clearance"):
		reach += (0.42 - float(robot.build_metrics.clearance)) * 0.7
	match robot.weapon_kind:
		"weapon_spinner": return robot.weapon_damage * 0.28 + relative_speed * 0.24 * reach
		"weapon_hammer": return robot.weapon_damage * 0.36 + relative_speed * 0.12 * reach
		_: return robot.weapon_damage * 0.2 + relative_speed * 0.26 * reach

func _weapon_cause(robot: RobotBody) -> String:
	return "%s from %s" % [str(robot.build_metrics.get("weapon_label", "weapon")).to_lower(), robot.machine_name]

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
		"player_damage_log": player_robot.damage_log.duplicate(),
		"training_damage_log": training_robot.damage_log.duplicate(),
		"player_metrics": player_robot.build_metrics.duplicate(true),
		"rebuild_questions": _rebuild_questions(),
	}
	_emit_hud()
	match_finished.emit(last_result)

func _rebuild_questions() -> Array[String]:
	var questions: Array[String] = []
	var balance_x := absf(float(player_robot.build_metrics.get("balance_x", 0.0)))
	var balance_z := absf(float(player_robot.build_metrics.get("balance_z", 0.0)))
	if balance_x > 0.18 or balance_z > 0.18:
		questions.append("Move the heavy front or weapon mount closer to the center of mass.")
	if float(player_robot.build_metrics.get("traction", 0.0)) < 3.5:
		questions.append("Try four wheels or wide-grip wheels before adding more weapon mass.")
	if player_robot.damage_log.is_empty():
		questions.append("Review your approach: the report recorded no incoming damage before the session ended.")
	else:
		questions.append("Read the incoming damage entries, then change one physical choice and test again.")
	return questions

func _emit_hud() -> void:
	hud_changed.emit(authoritative_snapshot())

func _training_machine_for(player_machine: String) -> String:
	match player_machine:
		"RAMMER": return "RIPPER"
		"RIPPER": return "MAUL"
		_: return "RAMMER"

func _training_color(machine: String) -> Color:
	match machine:
		"RIPPER": return Color("3d928c")
		"MAUL": return Color("b55c32")
		_: return Color("c39a38")
