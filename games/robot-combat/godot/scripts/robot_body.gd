class_name RobotBody
extends RigidBody3D

signal health_changed(current: float, maximum: float)
signal knocked_out(machine: RobotBody)

const BlueprintServiceScript := preload("res://scripts/blueprint_service.gd")
const RobotAssemblyScript := preload("res://scripts/robot_assembly.gd")

var machine_key := "RAMMER"
var machine_name := "Untitled machine"
var player_controlled := false
var health := 100.0
var max_health := 100.0
var weapon_active := false
var server_enabled := true
var ai_throttle := 0.0
var ai_steer := 0.0
var ai_weapon := false
var virtual_throttle := 0.0
var virtual_steer := 0.0
var virtual_weapon := false
var blueprint_hash := "UNSAVED"
var blueprint_data: Dictionary = {}
var build_metrics: Dictionary = {}
var damage_log: Array[String] = []
var weapon_kind := "weapon_ram"
var weapon_damage := 9.0
var drive_force := 76.0
var max_speed := 12.0
var _ram_cooldown := 0.0
var assembly: RobotAssembly

func configure(next_machine_key: String, paint: Color, is_player: bool, initial_blueprint: Dictionary = {}) -> void:
	machine_key = next_machine_key.to_upper()
	player_controlled = is_player
	blueprint_data = initial_blueprint.duplicate(true)
	if blueprint_data.is_empty():
		blueprint_data = BlueprintServiceScript.default_blueprint(machine_key)
	machine_name = str(blueprint_data.get("name", "Untitled machine"))
	var inspection := BlueprintServiceScript.inspect_blueprint(blueprint_data)
	build_metrics = inspection.duplicate(true)
	if not inspection.valid:
		# Runtime spawns are only expected to receive server-valid builds. Keeping
		# a safe default here prevents an invalid preview from becoming a physics
		# authority if a caller makes a mistake.
		blueprint_data = BlueprintServiceScript.default_blueprint("RAMMER")
		inspection = BlueprintServiceScript.inspect_blueprint(blueprint_data)
		build_metrics = inspection.duplicate(true)
		machine_name = str(blueprint_data.get("name", "Yard Mule starter"))
	_apply_build_stats()
	health = max_health
	continuous_cd = true
	contact_monitor = true
	max_contacts_reported = 12
	linear_damp = 1.45
	angular_damp = 2.8
	_rebuild_visuals(paint)

func _apply_build_stats() -> void:
	var metrics := build_metrics
	mass = float(metrics.get("mass_kg", 104.0))
	var armor_value := float(metrics.get("armor", 70.0))
	max_health = clampf(84.0 + armor_value * 0.2, 96.0, 124.0)
	drive_force = 58.0 + float(metrics.get("traction", 4.0)) * 13.0
	max_speed = clampf(8.8 + (120.0 - mass) * 0.035, 8.0, 12.6)
	weapon_damage = 9.0
	weapon_kind = "weapon_ram"
	for value in blueprint_data.get("parts", []):
		if not value is Dictionary:
			continue
		var catalog_id := str(value.get("catalog_id", ""))
		if BlueprintServiceScript.CATALOG.has(catalog_id):
			var catalog: Dictionary = BlueprintServiceScript.CATALOG[catalog_id]
			if str(catalog.get("category", "")) == "weapon":
				weapon_kind = catalog_id
				weapon_damage = float(catalog.get("damage", weapon_damage))

func _physics_process(_delta: float) -> void:
	_ram_cooldown = maxf(0.0, _ram_cooldown - _delta)
	if not server_enabled:
		return
	if player_controlled:
		weapon_active = virtual_weapon or Input.is_key_pressed(KEY_SPACE) or Input.is_joy_button_pressed(0, JOY_BUTTON_A)
	else:
		weapon_active = ai_weapon
	if assembly != null:
		assembly.set_weapon_active(weapon_active)

func _integrate_forces(state: PhysicsDirectBodyState3D) -> void:
	if not server_enabled or health <= 0.0:
		return
	var throttle := ai_throttle
	var steer := ai_steer
	if player_controlled:
		throttle = _digital_axis(KEY_S, KEY_W) + _digital_axis(KEY_DOWN, KEY_UP)
		steer = _digital_axis(KEY_D, KEY_A) + _digital_axis(KEY_RIGHT, KEY_LEFT)
		if absf(virtual_throttle) > absf(throttle):
			throttle = virtual_throttle
		if absf(virtual_steer) > absf(steer):
			steer = virtual_steer
		if Input.get_connected_joypads().size() > 0:
			var joy_throttle := -Input.get_joy_axis(0, JOY_AXIS_LEFT_Y)
			var joy_steer := -Input.get_joy_axis(0, JOY_AXIS_LEFT_X)
			if absf(joy_throttle) > 0.18:
				throttle = joy_throttle
			if absf(joy_steer) > 0.18:
				steer = joy_steer

	var forward := -state.transform.basis.z
	forward.y = 0.0
	forward = forward.normalized()
	state.apply_central_force(forward * throttle * drive_force)
	state.apply_torque(Vector3.UP * steer * 48.0)

	# A stable upright assist keeps the prototype readable while preserving the
	# important build consequences: mass, traction, balance, reach and recoil.
	var upright_axis := state.transform.basis.y.cross(Vector3.UP)
	var balance_penalty := absf(float(build_metrics.get("balance_x", 0.0))) * 18.0
	state.apply_torque(upright_axis * maxf(22.0, 36.0 - balance_penalty))
	if state.linear_velocity.length() > max_speed:
		state.linear_velocity = state.linear_velocity.normalized() * max_speed
	if state.angular_velocity.length() > 4.2:
		state.angular_velocity = state.angular_velocity.normalized() * 4.2

	if weapon_kind == "weapon_ram" and weapon_active and _ram_cooldown <= 0.0:
		state.apply_central_impulse(forward * (17.0 + drive_force * 0.08))
		_ram_cooldown = 1.1

func set_ai_intent(throttle: float, steer: float, use_weapon: bool) -> void:
	ai_throttle = clampf(throttle, -1.0, 1.0)
	ai_steer = clampf(steer, -1.0, 1.0)
	ai_weapon = use_weapon

func set_virtual_input(throttle: float, steer: float, use_weapon: bool) -> void:
	virtual_throttle = clampf(throttle, -1.0, 1.0)
	virtual_steer = clampf(steer, -1.0, 1.0)
	virtual_weapon = use_weapon

func apply_authoritative_blueprint(rebuilt: Dictionary, hash_value: String) -> void:
	var authoritative: Dictionary = rebuilt.get("blueprint", rebuilt)
	if authoritative.is_empty():
		return
	blueprint_data = authoritative.duplicate(true)
	machine_name = str(blueprint_data.get("name", machine_name))
	blueprint_hash = hash_value
	if rebuilt.has("validation"):
		build_metrics = rebuilt.validation.duplicate(true)
	elif authoritative.has("server_totals"):
		build_metrics = BlueprintServiceScript.inspect_blueprint(authoritative)
	_apply_build_stats()
	_rebuild_visuals(_paint_from_key(str(blueprint_data.get("paint", "yard-yellow"))))
	health = max_health

func server_apply_damage(amount: float, cause := "") -> void:
	if not server_enabled or health <= 0.0 or amount <= 0.0:
		return
	health = maxf(0.0, health - amount)
	if not cause.is_empty():
		damage_log.append("%s (%0.1f)" % [cause, amount])
	health_changed.emit(health, max_health)
	if health <= 0.0:
		weapon_active = false
		set_ai_intent(0.0, 0.0, false)
		knocked_out.emit(self)

func server_reset(spawn_transform: Transform3D) -> void:
	freeze = true
	global_transform = spawn_transform
	linear_velocity = Vector3.ZERO
	angular_velocity = Vector3.ZERO
	health = max_health
	damage_log.clear()
	weapon_active = false
	set_ai_intent(0.0, 0.0, false)
	health_changed.emit(health, max_health)
	freeze = false

func authoritative_snapshot() -> Dictionary:
	return {
		"machine": machine_key,
		"name": machine_name,
		"position": [global_position.x, global_position.y, global_position.z],
		"rotation_y": global_rotation.y,
		"linear_velocity": [linear_velocity.x, linear_velocity.y, linear_velocity.z],
		"health": health,
		"weapon_active": weapon_active,
		"blueprint_hash": blueprint_hash,
		"mass_kg": mass,
	}

func _rebuild_visuals(paint: Color) -> void:
	for child in get_children():
		child.free()
	var collision := CollisionShape3D.new()
	collision.name = "AuthoritativeCollision"
	var shape := BoxShape3D.new()
	shape.size = _chassis_size() + Vector3(0.18, 0.2, 0.18)
	collision.shape = shape
	collision.position.y = 0.42
	add_child(collision)
	var new_assembly: RobotAssembly = RobotAssemblyScript.new()
	new_assembly.name = "BuiltMachineAssembly"
	add_child(new_assembly)
	new_assembly.build(blueprint_data, paint, machine_name)
	assembly = new_assembly

func _chassis_size() -> Vector3:
	for value in blueprint_data.get("parts", []):
		if not value is Dictionary:
			continue
		var catalog_id := str(value.get("catalog_id", ""))
		if BlueprintServiceScript.CATALOG.has(catalog_id):
			var catalog: Dictionary = BlueprintServiceScript.CATALOG[catalog_id]
			if str(catalog.get("category", "")) == "chassis":
				var size: Array = catalog.get("size", [2.3, 0.45, 1.55])
				return Vector3(float(size[0]), float(size[1]), float(size[2]))
	return Vector3(2.3, 0.45, 1.55)

func _digital_axis(negative_key: Key, positive_key: Key) -> float:
	return float(Input.is_key_pressed(positive_key)) - float(Input.is_key_pressed(negative_key))

func _paint_from_key(key: String) -> Color:
	match key:
		"cutter-teal": return Color("3e918a")
		"forge-orange": return Color("b75f35")
		"cold-steel": return Color("65737a")
		_: return Color("caa03f")
