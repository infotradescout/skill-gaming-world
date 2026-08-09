class_name ArenaBuilder
extends RefCounted

const STEEL := Color("#263039")
const DARK_STEEL := Color("#111820")
const SHIP_PLATE := Color("#35424a")
const SAFETY_YELLOW := Color("#d3a63f")
const CUTTING_ORANGE := Color("#d77632")
const DOCK_TEAL := Color("#4fa99d")
const COLD_LIGHT := Color("#b8d9dd")

static func build(parent: Node3D) -> Dictionary:
	_build_environment(parent)
	_build_combat_floor(parent)
	_build_enclosure(parent)
	_build_landmarks(parent)
	_build_story_details(parent)
	return {
		"size": Vector2(24.0, 16.0),
		"spawn_player": Vector3(-5.4, 0.8, 0.0),
		"spawn_training": Vector3(5.4, 0.8, 0.0),
		"camera_anchor": Vector3(0.0, 13.0, 15.5),
	}

static func _build_environment(parent: Node3D) -> void:
	var world := WorldEnvironment.new()
	world.name = "Bay13World"
	var environment := Environment.new()
	environment.background_mode = Environment.BG_COLOR
	environment.background_color = Color("#071018")
	environment.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	environment.ambient_light_color = Color("#76929a")
	environment.ambient_light_energy = 0.46
	environment.reflected_light_source = Environment.REFLECTION_SOURCE_DISABLED
	world.environment = environment
	parent.add_child(world)

	var moon := DirectionalLight3D.new()
	moon.name = "ColdDockLight"
	moon.light_color = COLD_LIGHT
	moon.light_energy = 1.35
	moon.rotation_degrees = Vector3(-53.0, -31.0, 0.0)
	moon.shadow_enabled = true
	parent.add_child(moon)

	for light_data in [
		[Vector3(-7.5, 7.8, -4.8), Color("#ffd59a")],
		[Vector3(7.5, 7.8, -4.8), Color("#d7f6f3")],
		[Vector3(-7.5, 7.8, 4.8), Color("#ffd59a")],
		[Vector3(7.5, 7.8, 4.8), Color("#d7f6f3")],
	]:
		var spot := OmniLight3D.new()
		spot.position = light_data[0]
		spot.light_color = light_data[1]
		spot.light_energy = 8.0
		spot.omni_range = 14.0
		spot.shadow_enabled = true
		parent.add_child(spot)

static func _build_combat_floor(parent: Node3D) -> void:
	_box(parent, "ShipTransferPlatform", Vector3(24.0, 0.45, 16.0), Vector3(0.0, -0.23, 0.0), STEEL, true, 0.82, 0.58)
	_box(parent, "PlatformApron", Vector3(29.0, 0.32, 21.0), Vector3(0.0, -0.48, 0.0), DARK_STEEL, true, 0.7, 0.72)

	# Radial transfer rails and replaceable plate seams remain flush and fair.
	for x in range(-10, 11, 4):
		_box(parent, "FloorSeamX%d" % x, Vector3(0.035, 0.018, 15.6), Vector3(float(x), 0.015, 0.0), Color("#66737a"), false, 0.92, 0.34)
	for z in range(-6, 7, 3):
		_box(parent, "FloorSeamZ%d" % z, Vector3(23.6, 0.018, 0.035), Vector3(0.0, 0.017, float(z)), Color("#66737a"), false, 0.92, 0.34)

	var center := _cylinder(parent, "BearingRing", 2.45, 0.025, Vector3(0.0, 0.035, 0.0), Color("#59656c"), false)
	center.mesh.radial_segments = 64
	var center_inner := _cylinder(parent, "BearingCenter", 1.75, 0.03, Vector3(0.0, 0.052, 0.0), DARK_STEEL, false)
	center_inner.mesh.radial_segments = 64
	_label(parent, "BAY 13", Vector3(0.0, 0.085, 0.0), Vector3(-90.0, 0.0, 0.0), Color("#d9b765"), 0.012, 64)

	_spawn_ring(parent, Vector3(-5.4, 0.04, 0.0), Color("#e0b547"), "YARD MULE")
	_spawn_ring(parent, Vector3(5.4, 0.04, 0.0), Color("#53aea4"), "TRAINING")
	_spawn_ring(parent, Vector3(0.0, 0.04, 4.8), Color("#c96d38"), "CREW 03")

	for corner in [Vector3(-9.8, 0.045, -5.8), Vector3(9.8, 0.045, -5.8), Vector3(-9.8, 0.045, 5.8), Vector3(9.8, 0.045, 5.8)]:
		var bay := _box(parent, "InactiveHazardBay", Vector3(2.0, 0.025, 1.2), corner, Color("#3c4245"), false)
		bay.set_meta("gameplay_tag", "interactive later")
		bay.set_meta("active", false)

static func _build_enclosure(parent: Node3D) -> void:
	# Lower ship-hull armor carries visible impact truth. Invisible upper collision
	# keeps every robot inside the same server-owned combat volume.
	for wall in [
		[Vector3(24.6, 1.25, 0.55), Vector3(0.0, 0.62, -8.15)],
		[Vector3(24.6, 1.25, 0.55), Vector3(0.0, 0.62, 8.15)],
		[Vector3(0.55, 1.25, 16.0), Vector3(-12.15, 0.62, 0.0)],
		[Vector3(0.55, 1.25, 16.0), Vector3(12.15, 0.62, 0.0)],
	]:
		_box(parent, "HullArmor", wall[0], wall[1], SHIP_PLATE, true, 0.9, 0.42)

	var glass_material := _material(Color(0.32, 0.62, 0.64, 0.17), 0.1, 0.2, true)
	for panel in [
		[Vector3(23.8, 2.25, 0.12), Vector3(0.0, 2.25, -8.08)],
		[Vector3(23.8, 2.25, 0.12), Vector3(0.0, 2.25, 8.08)],
		[Vector3(0.12, 2.25, 15.4), Vector3(-12.08, 2.25, 0.0)],
		[Vector3(0.12, 2.25, 15.4), Vector3(12.08, 2.25, 0.0)],
	]:
		_box_with_material(parent, "FramedPolycarbonate", panel[0], panel[1], glass_material, false)

	for x in [-12.25, 12.25]:
		for z in [-8.25, -4.1, 0.0, 4.1, 8.25]:
			_box(parent, "ShipRib", Vector3(0.32, 3.8, 0.32), Vector3(x, 1.9, z), DARK_STEEL, false)
	for z in [-8.25, 8.25]:
		for x in range(-12, 13, 4):
			_box(parent, "ShipRib", Vector3(0.32, 3.8, 0.32), Vector3(float(x), 1.9, z), DARK_STEEL, false)

	# Continuous server collision is deliberately simpler than the visual frames.
	_static_collision(parent, "NorthSafetyBoundary", Vector3(25.0, 4.4, 0.35), Vector3(0.0, 2.0, -8.25))
	_static_collision(parent, "SouthSafetyBoundary", Vector3(25.0, 4.4, 0.35), Vector3(0.0, 2.0, 8.25))
	_static_collision(parent, "WestSafetyBoundary", Vector3(0.35, 4.4, 16.0), Vector3(-12.25, 2.0, 0.0))
	_static_collision(parent, "EastSafetyBoundary", Vector3(0.35, 4.4, 16.0), Vector3(12.25, 2.0, 0.0))

	for x in [-9.0, -3.0, 3.0, 9.0]:
		_box(parent, "OverheadTruss", Vector3(0.22, 0.22, 18.5), Vector3(x, 7.1, 0.0), DARK_STEEL, false)
	_box(parent, "OverheadTrussNorth", Vector3(23.0, 0.22, 0.22), Vector3(0.0, 7.1, -6.2), DARK_STEEL, false)
	_box(parent, "OverheadTrussSouth", Vector3(23.0, 0.22, 0.22), Vector3(0.0, 7.1, 6.2), DARK_STEEL, false)

static func _build_landmarks(parent: Node3D) -> void:
	# Cutting Hall: warm, ordered fabrication space rather than a trash pile.
	_box(parent, "CuttingHall", Vector3(10.0, 5.0, 3.5), Vector3(-7.0, 2.1, -11.0), Color("#38291f"), false)
	_box(parent, "CuttingHallDoor", Vector3(4.8, 3.0, 0.2), Vector3(-7.0, 1.5, -9.2), Color("#8a4c2d"), false)
	_label(parent, "CUTTING HALL", Vector3(-7.0, 4.15, -9.05), Vector3.ZERO, Color("#f0b56c"), 0.009, 54)

	# Crane Row: inactive recovery hardware outside the fair floor.
	for x in [3.5, 7.5, 11.0]:
		_box(parent, "CraneColumn", Vector3(0.42, 6.8, 0.42), Vector3(x, 3.4, -11.0), Color("#33414a"), false)
	_box(parent, "CraneRail", Vector3(9.0, 0.42, 0.55), Vector3(7.5, 6.55, -11.0), SAFETY_YELLOW, false)
	_box(parent, "RecoveryMagnet", Vector3(2.0, 0.28, 1.15), Vector3(7.5, 4.2, -9.65), Color("#343c42"), false)
	_label(parent, "CRANE ROW", Vector3(7.5, 5.5, -9.35), Vector3.ZERO, Color("#9ecbc8"), 0.009, 52)

	# Crow's Nest sits over the long wall with a visible dock bell and siren.
	_box(parent, "CrowsNest", Vector3(5.0, 2.2, 2.4), Vector3(0.0, 5.15, 10.0), Color("#202b32"), false)
	var windows := _material(Color(0.7, 0.9, 0.92, 0.35), 0.15, 0.12, true)
	_box_with_material(parent, "CrowsNestWindow", Vector3(4.2, 1.05, 0.08), Vector3(0.0, 5.35, 8.76), windows, false)
	_label(parent, "CROW'S NEST", Vector3(0.0, 6.45, 8.7), Vector3.ZERO, Color("#d6e8e5"), 0.008, 50)

	# Three heavy freight gates make the build-and-bring-it-through story legible.
	for index in 3:
		var x := -7.0 + index * 7.0
		_box(parent, "CrewBay%d" % (index + 1), Vector3(5.5, 3.6, 2.5), Vector3(x, 1.55, 11.2), Color("#20272c"), false)
		_box(parent, "FreightGate%d" % (index + 1), Vector3(4.5, 2.6, 0.24), Vector3(x, 1.3, 9.85), Color("#4b5559"), false)
		_label(parent, "CREW %02d" % (index + 1), Vector3(x, 2.95, 9.68), Vector3.ZERO, SAFETY_YELLOW, 0.007, 44)

static func _build_story_details(parent: Node3D) -> void:
	# Organized exterior containers and a vessel skeleton establish the working coast.
	for item in [
		[Vector3(-15.8, 0.8, -5.5), Color("#73513c")],
		[Vector3(-15.8, 0.8, -1.8), Color("#385e63")],
		[Vector3(15.8, 0.8, -5.5), Color("#6d653f")],
		[Vector3(15.8, 2.4, -5.5), Color("#3e5666")],
	]:
		_box(parent, "DockContainer", Vector3(2.6, 1.5, 3.2), item[0], item[1], false)

	for rib in range(-4, 5):
		var x := float(rib) * 1.25
		_box(parent, "VesselSkeletonRib", Vector3(0.18, 4.2, 0.18), Vector3(x, 1.6, -17.0), Color("#4e5557"), false)
		var arch := _box(parent, "VesselSkeletonTop", Vector3(0.18, 0.18, 4.0), Vector3(x, 3.55, -17.0), Color("#4e5557"), false)
		arch.rotation_degrees.z = -20.0 if rib < 0 else 20.0

	_box(parent, "WallOfWrecks", Vector3(9.0, 3.4, 0.4), Vector3(-16.0, 1.5, 4.8), Color("#242b2f"), false)
	_label(parent, "WALL OF WRECKS", Vector3(-15.75, 2.9, 4.55), Vector3(0.0, 90.0, 0.0), Color("#bd9e5b"), 0.007, 44)
	for y in [0.8, 1.55, 2.3]:
		for z in [2.8, 4.2, 5.6, 7.0]:
			_cylinder(parent, "FictionalWreck", 0.38, 0.2, Vector3(-15.72, y, z), Color("#604337"), false).rotation_degrees.z = 90.0

static func _spawn_ring(parent: Node3D, position: Vector3, color: Color, label_text: String) -> void:
	var outer := _cylinder(parent, "SpawnRing", 1.42, 0.024, position, color, false)
	outer.mesh.radial_segments = 48
	var inner := _cylinder(parent, "SpawnRingInner", 1.06, 0.03, position + Vector3(0.0, 0.012, 0.0), DARK_STEEL, false)
	inner.mesh.radial_segments = 48
	_label(parent, label_text, position + Vector3(0.0, 0.05, 0.0), Vector3(-90.0, 0.0, 0.0), color, 0.0055, 40)

static func _box(parent: Node3D, node_name: String, size: Vector3, position: Vector3, color: Color, collision := false, metallic := 0.72, roughness := 0.58) -> MeshInstance3D:
	return _box_with_material(parent, node_name, size, position, _material(color, metallic, roughness), collision)

static func _box_with_material(parent: Node3D, node_name: String, size: Vector3, position: Vector3, material: StandardMaterial3D, collision: bool) -> MeshInstance3D:
	var mesh_instance := MeshInstance3D.new()
	mesh_instance.name = node_name
	var mesh := BoxMesh.new()
	mesh.size = size
	mesh.material = material
	mesh_instance.mesh = mesh
	mesh_instance.position = position
	parent.add_child(mesh_instance)
	if collision:
		_static_collision(parent, "%sCollision" % node_name, size, position)
	return mesh_instance

static func _cylinder(parent: Node3D, node_name: String, radius: float, height: float, position: Vector3, color: Color, collision: bool) -> MeshInstance3D:
	var mesh_instance := MeshInstance3D.new()
	mesh_instance.name = node_name
	var mesh := CylinderMesh.new()
	mesh.top_radius = radius
	mesh.bottom_radius = radius
	mesh.height = height
	mesh.material = _material(color, 0.78, 0.46)
	mesh_instance.mesh = mesh
	mesh_instance.position = position
	parent.add_child(mesh_instance)
	if collision:
		var shape := CylinderShape3D.new()
		shape.radius = radius
		shape.height = height
		_static_shape(parent, "%sCollision" % node_name, shape, position)
	return mesh_instance

static func _static_collision(parent: Node3D, node_name: String, size: Vector3, position: Vector3) -> void:
	var shape := BoxShape3D.new()
	shape.size = size
	_static_shape(parent, node_name, shape, position)

static func _static_shape(parent: Node3D, node_name: String, shape: Shape3D, position: Vector3) -> void:
	var body := StaticBody3D.new()
	body.name = node_name
	body.position = position
	var collision := CollisionShape3D.new()
	collision.shape = shape
	body.add_child(collision)
	parent.add_child(body)

static func _label(parent: Node3D, text: String, position: Vector3, rotation: Vector3, color: Color, pixel_size: float, font_size: int) -> void:
	var label := Label3D.new()
	label.text = text
	label.position = position
	label.rotation_degrees = rotation
	label.modulate = color
	label.outline_modulate = Color("#081014")
	label.outline_size = 8
	label.pixel_size = pixel_size
	label.font_size = font_size
	parent.add_child(label)

static func _material(color: Color, metallic := 0.0, roughness := 0.65, transparent := false) -> StandardMaterial3D:
	var material := StandardMaterial3D.new()
	material.albedo_color = color
	material.metallic = metallic
	material.roughness = roughness
	if transparent:
		material.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
		material.cull_mode = BaseMaterial3D.CULL_DISABLED
	return material
