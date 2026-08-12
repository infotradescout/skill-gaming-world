class_name RobotAssembly
extends Node3D

const BlueprintServiceScript := preload("res://scripts/blueprint_service.gd")

var blueprint: Dictionary = {}
var paint_color := Color("caa03f")
var weapon_kind := ""
var weapon_root: Node3D
var hammer_arm: Node3D
var spinner: Node3D
var weapon_active := false
var hammer_phase := 0.0

func build(next_blueprint: Dictionary, next_paint: Color, display_name := "") -> void:
	blueprint = next_blueprint.duplicate(true)
	paint_color = next_paint
	weapon_kind = ""
	weapon_root = null
	hammer_arm = null
	spinner = null
	for child in get_children():
		child.free()

	for value in blueprint.get("parts", []):
		if not value is Dictionary:
			continue
		var part: Dictionary = value
		var catalog_id := str(part.get("catalog_id", ""))
		if not BlueprintServiceScript.CATALOG.has(catalog_id):
			continue
		var catalog: Dictionary = BlueprintServiceScript.CATALOG[catalog_id]
		var category := str(catalog.get("category", ""))
		var position := _vector_from_array(part.get("position", [0.0, 0.0, 0.0]))
		match category:
			"chassis": _build_chassis(catalog, position)
			"battery": _build_battery(catalog, position)
			"wheel": _build_wheel(catalog, position, str(part.get("instance_id", "wheel")))
			"front": _build_front(catalog_id, catalog, position)
			"weapon": _build_weapon(catalog_id, catalog, position)

	if not display_name.is_empty():
		var label := Label3D.new()
		label.name = "BuildLabel"
		label.text = display_name.to_upper()
		label.position = Vector3(0.0, 1.16, 0.74)
		label.rotation_degrees = Vector3(0.0, 180.0, 0.0)
		label.font_size = 32
		label.pixel_size = 0.004
		label.modulate = Color("f5e2aa")
		label.outline_size = 7
		label.outline_modulate = Color("12191d")
		add_child(label)

func set_weapon_active(active: bool) -> void:
	weapon_active = active

func _process(delta: float) -> void:
	if spinner != null and weapon_active:
		spinner.rotate_z(delta * 22.0)
	if hammer_arm != null:
		if weapon_active:
			hammer_phase = minf(hammer_phase + delta * 7.0, 1.0)
		else:
			hammer_phase = maxf(hammer_phase - delta * 4.5, 0.0)
		hammer_arm.rotation.x = lerpf(-0.75, 0.75, sin(hammer_phase * PI))

func _build_chassis(catalog: Dictionary, position: Vector3) -> void:
	var size := _vector_from_array(catalog.get("size", [2.3, 0.45, 1.55]))
	_add_box("Chassis", size, position + Vector3(0.0, 0.38, 0.0), paint_color, 0.75)
	_add_box("ArmorDeck", Vector3(size.x * 0.82, 0.16, size.z * 0.75), position + Vector3(0.0, 0.72, 0.05), paint_color.lightened(0.12), 0.8)
	_add_box("RearBumper", Vector3(size.x * 0.94, 0.28, 0.18), position + Vector3(0.0, 0.42, size.z * 0.48), Color("222a30"), 0.86)

func _build_battery(catalog: Dictionary, position: Vector3) -> void:
	var size := _vector_from_array(catalog.get("size", [0.58, 0.25, 0.38]))
	_add_box("BatteryCore", size, position + Vector3(0.0, 0.58, 0.12), Color("4b6a75"), 0.52)
	var indicator := _add_box("BatteryIndicator", Vector3(size.x * 0.62, 0.03, 0.04), position + Vector3(0.0, 0.73, -0.08), Color("7dd6a3"), 0.2)
	var indicator_material := indicator.mesh.material as StandardMaterial3D
	indicator_material.emission_enabled = true
	indicator_material.emission = Color("30694d")

func _build_wheel(catalog: Dictionary, position: Vector3, instance_id: String) -> void:
	var size := _vector_from_array(catalog.get("size", [0.42, 0.42, 0.22]))
	var wheel := MeshInstance3D.new()
	wheel.name = instance_id
	var mesh := CylinderMesh.new()
	mesh.top_radius = size.x * 0.5
	mesh.bottom_radius = size.x * 0.5
	mesh.height = size.z
	mesh.radial_segments = 18
	mesh.material = _material(Color("111519"), 0.08, 0.9)
	wheel.mesh = mesh
	wheel.position = position + Vector3(0.0, 0.34, 0.0)
	wheel.rotation_degrees.z = 90.0
	add_child(wheel)

func _build_front(catalog_id: String, catalog: Dictionary, position: Vector3) -> void:
	var size := _vector_from_array(catalog.get("size", [1.6, 0.2, 0.7]))
	if catalog_id == "front_forks":
		for side in [-1.0, 1.0]:
			var fork := _add_box("FrontFork", Vector3(size.x * 0.2, size.y, size.z), position + Vector3(side * size.x * 0.3, 0.25, 0.0), paint_color.lightened(0.1), 0.8)
			fork.rotation_degrees.x = -7.0
	else:
		var plate := _add_box("FrontAssembly", size, position + Vector3(0.0, 0.25, 0.0), paint_color.lightened(0.08), 0.82)
		plate.rotation_degrees.x = -12.0 if catalog_id == "front_wedge" else -5.0

func _build_weapon(catalog_id: String, catalog: Dictionary, position: Vector3) -> void:
	weapon_kind = catalog_id
	weapon_root = Node3D.new()
	weapon_root.name = "WeaponMount"
	weapon_root.position = position + Vector3(0.0, 0.42, 0.0)
	add_child(weapon_root)
	match catalog_id:
		"weapon_spinner":
			spinner = Node3D.new()
			spinner.name = "Spinner"
			weapon_root.add_child(spinner)
			var disc := MeshInstance3D.new()
			var disc_mesh := CylinderMesh.new()
			disc_mesh.top_radius = 0.72
			disc_mesh.bottom_radius = 0.72
			disc_mesh.height = 0.2
			disc_mesh.radial_segments = 20
			disc_mesh.material = _material(Color("b8c1c3"), 0.92, 0.34)
			disc.mesh = disc_mesh
			disc.rotation_degrees.x = 90.0
			spinner.add_child(disc)
		"weapon_hammer":
			hammer_arm = Node3D.new()
			hammer_arm.name = "HammerArm"
			hammer_arm.rotation.x = -0.75
			weapon_root.add_child(hammer_arm)
			_add_box_to(hammer_arm, "HammerHandle", Vector3(0.24, 0.24, 1.7), Vector3(0.0, 0.0, -0.65), Color("3c4549"), 0.88)
			_add_box_to(hammer_arm, "HammerHead", Vector3(0.85, 0.52, 0.48), Vector3(0.0, 0.0, -1.48), Color("a97942"), 0.85)
		"weapon_ram":
			_add_box_to(weapon_root, "RamNose", Vector3(0.9, 0.28, 0.52), Vector3(0.0, 0.0, -0.34), paint_color.lightened(0.15), 0.86)

func _add_box_to(parent: Node3D, node_name: String, size: Vector3, position: Vector3, color: Color, metallic: float) -> MeshInstance3D:
	var mesh_instance := MeshInstance3D.new()
	mesh_instance.name = node_name
	var mesh := BoxMesh.new()
	mesh.size = size
	mesh.material = _material(color, metallic)
	mesh_instance.mesh = mesh
	mesh_instance.position = position
	parent.add_child(mesh_instance)
	return mesh_instance

func _add_box(node_name: String, size: Vector3, position: Vector3, color: Color, metallic: float) -> MeshInstance3D:
	return _add_box_to(self, node_name, size, position, color, metallic)

func _vector_from_array(value: Variant) -> Vector3:
	if value is Array and value.size() >= 3:
		return Vector3(float(value[0]), float(value[1]), float(value[2]))
	return Vector3.ZERO

func _material(color: Color, metallic: float, roughness := 0.48) -> StandardMaterial3D:
	var material := StandardMaterial3D.new()
	material.albedo_color = color
	material.metallic = metallic
	material.roughness = roughness
	return material
