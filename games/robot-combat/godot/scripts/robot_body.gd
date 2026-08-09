class_name RobotBody
extends RigidBody3D

signal health_changed(current: float, maximum: float)
signal knocked_out(machine: RobotBody)

const DRIVE_FORCE := 76.0
const TURN_TORQUE := 48.0
const MAX_SPEED := 12.0
const MAX_ANGULAR_SPEED := 4.2

var machine_key := "RAMMER"
var machine_name := "Yard Mule"
var player_controlled := false
var health := 100.0
var max_health := 100.0
var weapon_active := false
var server_enabled := true
var ai_throttle := 0.0
var ai_steer := 0.0
var ai_weapon := false
var _weapon_root: Node3D
var _hammer_phase := 0.0
var _ram_cooldown := 0.0
var virtual_throttle := 0.0
var virtual_steer := 0.0
var virtual_weapon := false
var blueprint_hash := "STARTER"

func configure(next_machine_key: String, paint: Color, is_player: bool) -> void:
	machine_key = next_machine_key.to_upper()
	player_controlled = is_player
	match machine_key:
		"RIPPER":
			machine_name = "Keelcutter"
			mass = 109.0
			max_health = 92.0
		"MAUL":
			machine_name = "Pilebreaker"
			mass = 118.0
			max_health = 108.0
		_:
			machine_key = "RAMMER"
			machine_name = "Yard Mule"
			mass = 104.0
			max_health = 115.0
	health = max_health
	continuous_cd = true
	contact_monitor = true
	max_contacts_reported = 12
	linear_damp = 1.45
	angular_damp = 2.8
	_build_visuals(paint)

func _physics_process(delta: float) -> void:
	_ram_cooldown = maxf(0.0, _ram_cooldown - delta)
	if not server_enabled:
		return
	if player_controlled:
		weapon_active = virtual_weapon or Input.is_key_pressed(KEY_SPACE) or Input.is_joy_button_pressed(0, JOY_BUTTON_A)
	else:
		weapon_active = ai_weapon

func _process(delta: float) -> void:
	if not is_instance_valid(_weapon_root):
		return
	match machine_key:
		"RIPPER":
			if weapon_active:
				_weapon_root.rotate_z(delta * 21.0)
		"MAUL":
			if weapon_active:
				_hammer_phase = minf(_hammer_phase + delta * 7.0, 1.0)
			else:
				_hammer_phase = maxf(_hammer_phase - delta * 4.5, 0.0)
			_weapon_root.rotation.x = lerpf(-0.75, 0.75, sin(_hammer_phase * PI))

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
	state.apply_central_force(forward * throttle * DRIVE_FORCE)
	state.apply_torque(Vector3.UP * steer * TURN_TORQUE)

	# The one-body assembly is intentionally stable and bounded. Weapons use
	# server states, while the chassis remains the sole movement authority.
	var upright_axis := state.transform.basis.y.cross(Vector3.UP)
	state.apply_torque(upright_axis * 34.0)
	if state.linear_velocity.length() > MAX_SPEED:
		state.linear_velocity = state.linear_velocity.normalized() * MAX_SPEED
	if state.angular_velocity.length() > MAX_ANGULAR_SPEED:
		state.angular_velocity = state.angular_velocity.normalized() * MAX_ANGULAR_SPEED

	if machine_key == "RAMMER" and weapon_active and _ram_cooldown <= 0.0:
		state.apply_central_impulse(forward * 22.0)
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
	if rebuilt.has("server_totals"):
		mass = float(rebuilt.server_totals.get("mass_kg", mass))
	blueprint_hash = hash_value

func server_apply_damage(amount: float) -> void:
	if not server_enabled or health <= 0.0 or amount <= 0.0:
		return
	health = maxf(0.0, health - amount)
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
	weapon_active = false
	set_ai_intent(0.0, 0.0, false)
	health_changed.emit(health, max_health)
	freeze = false

func authoritative_snapshot() -> Dictionary:
	return {
		"machine": machine_key,
		"position": [global_position.x, global_position.y, global_position.z],
		"rotation_y": global_rotation.y,
		"linear_velocity": [linear_velocity.x, linear_velocity.y, linear_velocity.z],
		"health": health,
		"weapon_active": weapon_active,
		"blueprint_hash": blueprint_hash,
	}

func _digital_axis(negative_key: Key, positive_key: Key) -> float:
	return float(Input.is_key_pressed(positive_key)) - float(Input.is_key_pressed(negative_key))

func _build_visuals(paint: Color) -> void:
	var collision := CollisionShape3D.new()
	var shape := BoxShape3D.new()
	shape.size = Vector3(2.35, 0.58, 1.55)
	collision.shape = shape
	collision.position.y = 0.12
	add_child(collision)

	_add_box("Chassis", Vector3(2.35, 0.55, 1.52), Vector3(0.0, 0.12, 0.0), paint, 0.72)
	_add_box("ArmorDeck", Vector3(1.85, 0.18, 1.12), Vector3(0.0, 0.48, 0.05), paint.lightened(0.12), 0.78)
	_add_box("RearBumper", Vector3(2.4, 0.32, 0.22), Vector3(0.0, 0.2, 0.84), Color("#222a30"), 0.85)

	for wheel_data in [
		[Vector3(-1.15, 0.02, -0.52), -90.0],
		[Vector3(1.15, 0.02, -0.52), 90.0],
		[Vector3(-1.15, 0.02, 0.52), -90.0],
		[Vector3(1.15, 0.02, 0.52), 90.0],
	]:
		_add_wheel(wheel_data[0], wheel_data[1])

	match machine_key:
		"RIPPER": _build_spinner(paint)
		"MAUL": _build_hammer(paint)
		_: _build_rammer(paint)

	var crew_label := Label3D.new()
	crew_label.text = machine_name.to_upper()
	crew_label.position = Vector3(0.0, 0.56, 0.77)
	crew_label.rotation_degrees = Vector3(0.0, 180.0, 0.0)
	crew_label.font_size = 36
	crew_label.pixel_size = 0.004
	crew_label.modulate = Color("#f5e2aa")
	crew_label.outline_size = 6
	crew_label.outline_modulate = Color("#12191d")
	add_child(crew_label)

func _build_rammer(paint: Color) -> void:
	var wedge := _add_box("LowWedge", Vector3(2.15, 0.18, 0.95), Vector3(0.0, -0.08, -1.05), paint.lightened(0.08), 0.82)
	wedge.rotation_degrees.x = -10.0
	_weapon_root = Node3D.new()
	_weapon_root.name = "RamState"
	add_child(_weapon_root)

func _build_spinner(paint: Color) -> void:
	for x in [-0.72, 0.72]:
		var fork := _add_box("FrontFork", Vector3(0.34, 0.16, 1.15), Vector3(x, -0.08, -1.05), paint.lightened(0.1), 0.8)
		fork.rotation_degrees.x = -7.0
	_weapon_root = Node3D.new()
	_weapon_root.name = "SpinnerAuthority"
	_weapon_root.position = Vector3(0.0, 0.48, -0.72)
	add_child(_weapon_root)
	var disc := MeshInstance3D.new()
	var mesh := CylinderMesh.new()
	mesh.top_radius = 0.72
	mesh.bottom_radius = 0.72
	mesh.height = 0.2
	mesh.radial_segments = 20
	mesh.material = _material(Color("#b8c1c3"), 0.92)
	disc.mesh = mesh
	disc.rotation_degrees.x = 90.0
	_weapon_root.add_child(disc)

func _build_hammer(paint: Color) -> void:
	var wedge := _add_box("HammerWedge", Vector3(1.8, 0.2, 0.75), Vector3(0.0, -0.05, -1.0), paint.lightened(0.06), 0.82)
	wedge.rotation_degrees.x = -8.0
	_weapon_root = Node3D.new()
	_weapon_root.name = "HammerAuthority"
	_weapon_root.position = Vector3(0.0, 0.62, -0.15)
	_weapon_root.rotation.x = -0.75
	add_child(_weapon_root)
	var arm := MeshInstance3D.new()
	var arm_mesh := BoxMesh.new()
	arm_mesh.size = Vector3(0.24, 0.24, 1.7)
	arm_mesh.material = _material(Color("#3c4549"), 0.88)
	arm.mesh = arm_mesh
	arm.position.z = -0.65
	_weapon_root.add_child(arm)
	var head := MeshInstance3D.new()
	var head_mesh := BoxMesh.new()
	head_mesh.size = Vector3(0.85, 0.52, 0.48)
	head_mesh.material = _material(Color("#a97942"), 0.85)
	head.mesh = head_mesh
	head.position.z = -1.48
	_weapon_root.add_child(head)

func _add_wheel(position: Vector3, yaw: float) -> void:
	var wheel := MeshInstance3D.new()
	var mesh := CylinderMesh.new()
	mesh.top_radius = 0.36
	mesh.bottom_radius = 0.36
	mesh.height = 0.24
	mesh.radial_segments = 18
	mesh.material = _material(Color("#111519"), 0.05, 0.92)
	wheel.mesh = mesh
	wheel.position = position
	wheel.rotation_degrees.z = yaw
	add_child(wheel)

func _add_box(node_name: String, size: Vector3, position: Vector3, color: Color, metallic: float) -> MeshInstance3D:
	var mesh_instance := MeshInstance3D.new()
	mesh_instance.name = node_name
	var mesh := BoxMesh.new()
	mesh.size = size
	mesh.material = _material(color, metallic)
	mesh_instance.mesh = mesh
	mesh_instance.position = position
	add_child(mesh_instance)
	return mesh_instance

func _material(color: Color, metallic: float, roughness := 0.48) -> StandardMaterial3D:
	var material := StandardMaterial3D.new()
	material.albedo_color = color
	material.metallic = metallic
	material.roughness = roughness
	return material
