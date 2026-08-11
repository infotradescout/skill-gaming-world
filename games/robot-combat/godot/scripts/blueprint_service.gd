class_name BlueprintService
extends RefCounted

const RULES_VERSION := "ROBOT_COMBAT_WORKSHOP_RULES_V1"
const BLUEPRINT_FILE := "user://robot-combat-last-valid.json"
const MAX_MASS_KG := 120.0
const MAX_PARTS := 64
const MAX_SIZE := Vector3(3.8, 2.4, 3.8)

const FORBIDDEN_VALUE_FIELDS := [
	"cash", "entry_fee", "legal_play", "paid", "payout", "price", "prize",
	"purchase", "redeem", "wager",
]

# The catalog is prototype content, not final product canon. The important
# property is that every physical consequence comes from the same data record
# used by the workshop preview and the arena rebuild.
const CATALOG := {
	"chassis_compact": {
		"category": "chassis", "label": "Compact frame", "mass": 44.0, "draw": 0.0, "supply": 0.0,
		"size": [2.3, 0.45, 1.55], "armor": 0.86,
	},
	"chassis_armored": {
		"category": "chassis", "label": "Armored frame", "mass": 54.0, "draw": 0.0, "supply": 0.0,
		"size": [2.55, 0.52, 1.72], "armor": 1.08,
	},
	"battery_compact": {
		"category": "battery", "label": "Compact battery", "mass": 10.0, "draw": 0.0, "supply": 45.0,
		"size": [0.58, 0.25, 0.38],
	},
	"battery_competition": {
		"category": "battery", "label": "Competition battery", "mass": 14.0, "draw": 0.0, "supply": 90.0,
		"size": [0.68, 0.28, 0.42],
	},
	"wheel_drive": {
		"category": "wheel", "label": "Drive wheels", "mass": 3.0, "draw": 10.0, "supply": 0.0,
		"size": [0.42, 0.42, 0.22], "traction": 1.0,
	},
	"wheel_grip": {
		"category": "wheel", "label": "Wide-grip wheels", "mass": 4.0, "draw": 12.0, "supply": 0.0,
		"size": [0.48, 0.48, 0.26], "traction": 1.25,
	},
	"front_wedge": {
		"category": "front", "label": "Low wedge", "mass": 16.0, "draw": 0.0, "supply": 0.0,
		"size": [1.6, 0.2, 0.7], "armor": 1.14,
	},
	"front_forks": {
		"category": "front", "label": "Twin forks", "mass": 14.0, "draw": 0.0, "supply": 0.0,
		"size": [1.45, 0.18, 0.75], "armor": 0.94,
	},
	"front_plow": {
		"category": "front", "label": "Heavy plow", "mass": 19.0, "draw": 0.0, "supply": 0.0,
		"size": [1.75, 0.34, 0.68], "armor": 1.34,
	},
	"weapon_ram": {
		"category": "weapon", "label": "Ram drive", "mass": 8.0, "draw": 8.0, "supply": 0.0,
		"size": [0.7, 0.24, 0.52], "active_weapon": true, "damage": 9.0,
	},
	"weapon_spinner": {
		"category": "weapon", "label": "Vertical spinner", "mass": 25.0, "draw": 32.0, "supply": 0.0,
		"size": [0.3, 1.0, 1.0], "active_weapon": true, "damage": 16.0,
	},
	"weapon_hammer": {
		"category": "weapon", "label": "Overhead hammer", "mass": 22.0, "draw": 24.0, "supply": 0.0,
		"size": [0.28, 1.15, 1.55], "active_weapon": true, "damage": 20.0,
	},
}

static func default_blueprint(machine: String) -> Dictionary:
	match machine.to_upper():
		"RIPPER", "KEELCUTTER":
			return build_blueprint({
				"name": "Keelcutter starter",
				"chassis": "chassis_compact", "wheels": "wheel_grip", "wheel_count": 4,
				"battery": "battery_competition", "front": "front_forks", "weapon": "weapon_spinner",
				"paint": "cutter-teal",
			})
		"MAUL", "PILEBREAKER":
			return build_blueprint({
				"name": "Pilebreaker starter",
				"chassis": "chassis_armored", "wheels": "wheel_drive", "wheel_count": 2,
				"battery": "battery_competition", "front": "front_plow", "weapon": "weapon_hammer",
				"paint": "forge-orange",
			})
		_:
			return build_blueprint({
				"name": "Yard Mule starter",
				"chassis": "chassis_armored", "wheels": "wheel_drive", "wheel_count": 4,
				"battery": "battery_competition", "front": "front_wedge", "weapon": "weapon_ram",
				"paint": "yard-yellow",
			})

static func build_blueprint(selection: Dictionary) -> Dictionary:
	var wheel_catalog := str(selection.get("wheels", "wheel_drive"))
	if not CATALOG.has(wheel_catalog) or str(CATALOG[wheel_catalog].get("category", "")) != "wheel":
		wheel_catalog = "wheel_drive"
	var wheel_count := int(selection.get("wheel_count", 4))
	var front_offset := clampf(float(selection.get("front_offset", 0.0)), -0.36, 0.36)
	var weapon_offset := clampf(float(selection.get("weapon_offset", 0.0)), -0.36, 0.36)
	var parts: Array = [
		_part("root", str(selection.get("chassis", "chassis_compact")), "", [0.0, 0.0, 0.0]),
		_part("battery", str(selection.get("battery", "battery_competition")), "root", [0.0, 0.38, 0.12]),
	]
	var wheel_positions := [
		["wheel-fl", [-0.9, -0.2, -0.62]],
		["wheel-fr", [0.9, -0.2, -0.62]],
		["wheel-rl", [-0.9, -0.2, 0.62]],
		["wheel-rr", [0.9, -0.2, 0.62]],
	]
	if wheel_count <= 2:
		wheel_positions = wheel_positions.slice(0, 2)
	for wheel_data in wheel_positions:
		parts.append(_part(str(wheel_data[0]), wheel_catalog, "root", wheel_data[1]))
	parts.append(_part("front", str(selection.get("front", "front_wedge")), "root", [0.0, -0.08, -1.02 + front_offset]))
	parts.append(_part("weapon", str(selection.get("weapon", "weapon_ram")), "root", [0.0, 0.36, -0.55 + weapon_offset]))
	return {
		"blueprint_version": 2,
		"rules_version": RULES_VERSION,
		"name": str(selection.get("name", "Untitled machine")),
		"paint": str(selection.get("paint", "yard-yellow")),
		"parts": parts,
	}

static func inspect_blueprint(blueprint: Dictionary) -> Dictionary:
	var reasons: Array[String] = []
	var warnings: Array[String] = []
	var parts_value: Variant = blueprint.get("parts", [])
	if not parts_value is Array:
		reasons.append("Parts must be a data-only list.")
		parts_value = []
	var parts: Array = parts_value
	if parts.size() > MAX_PARTS:
		reasons.append("The build exceeds the 64-part limit.")
	if parts.is_empty():
		reasons.append("The build needs one connected chassis.")

	var mass := 0.0
	var power_draw := 0.0
	var power_supply := 0.0
	var weighted_x := 0.0
	var weighted_z := 0.0
	var min_x := INF
	var max_x := -INF
	var min_z := INF
	var max_z := -INF
	var chassis_count := 0
	var battery_count := 0
	var powered_wheels := 0
	var active_weapons := 0
	var traction := 0.0
	var armor := 0.0
	var instances := {}
	var occupied := {}

	for value in parts:
		if not value is Dictionary:
			reasons.append("Every placed part must be a data record.")
			continue
		var part: Dictionary = value
		var instance_id := str(part.get("instance_id", ""))
		var catalog_id := str(part.get("catalog_id", ""))
		if instance_id.is_empty() or instances.has(instance_id):
			reasons.append("Every placed part needs a unique instance ID.")
			continue
		instances[instance_id] = part
		if not CATALOG.has(catalog_id):
			reasons.append("Part '%s' is not in the approved catalog." % instance_id)
			continue
		var catalog: Dictionary = CATALOG[catalog_id]
		var category := str(catalog.get("category", ""))
		var part_mass := float(catalog.get("mass", 0.0))
		mass += part_mass
		power_draw += float(catalog.get("draw", 0.0))
		power_supply += float(catalog.get("supply", 0.0))
		var position := _array_to_vector3(part.get("position", [0.0, 0.0, 0.0]))
		var size := _array_to_vector3(catalog.get("size", [1.0, 1.0, 1.0]))
		weighted_x += position.x * part_mass
		weighted_z += position.z * part_mass
		min_x = minf(min_x, position.x - size.x * 0.5)
		max_x = maxf(max_x, position.x + size.x * 0.5)
		min_z = minf(min_z, position.z - size.z * 0.5)
		max_z = maxf(max_z, position.z + size.z * 0.5)
		var outside_envelope: bool = absf(position.x) + size.x * 0.5 > MAX_SIZE.x * 0.5 or absf(position.y) + size.y * 0.5 > MAX_SIZE.y * 0.5 or absf(position.z) + size.z * 0.5 > MAX_SIZE.z * 0.5
		if outside_envelope:
			reasons.append("Part '%s' sits outside the 3.8 × 3.8 × 2.4 meter build envelope." % instance_id)
		if category in ["front", "weapon", "wheel"]:
			var cell := "%0.3f:%0.3f:%0.3f" % [position.x, position.y, position.z]
			if occupied.has(cell):
				reasons.append("Solid external parts overlap at one placement point.")
			occupied[cell] = instance_id
		match category:
			"chassis":
				chassis_count += 1
				armor += float(catalog.get("armor", 1.0)) * part_mass
			"battery":
				battery_count += 1
			"wheel":
				powered_wheels += 1
				traction += float(catalog.get("traction", 1.0))
			"front":
				armor += float(catalog.get("armor", 1.0)) * part_mass
			"weapon":
				if bool(catalog.get("active_weapon", false)):
					active_weapons += 1

	if chassis_count != 1:
		reasons.append("A legal build requires exactly one chassis.")
	if battery_count < 1:
		reasons.append("A legal build needs at least one battery.")
	if powered_wheels < 2:
		reasons.append("A legal build needs at least two powered wheels.")
	if active_weapons < 1:
		reasons.append("An arena-ready build needs one active weapon; the test bay can still inspect a push-only draft.")
	if active_weapons > 2:
		reasons.append("A build may use no more than two active weapons.")
	if mass > MAX_MASS_KG:
		reasons.append("The build is overweight: %0.1f kg exceeds the 120.0 kg class." % mass)
	if power_draw > power_supply:
		reasons.append("The build is underpowered: %0.1f power required, %0.1f available." % [power_draw, power_supply])

	for instance_id in instances:
		if instance_id == "root":
			continue
		if not _connects_to_root(instance_id, instances):
			reasons.append("Part '%s' is disconnected from the chassis." % instance_id)

	var forbidden := _find_forbidden_fields(blueprint)
	for field in forbidden:
		reasons.append("Value-bearing field '%s' is forbidden in Free play." % field)

	if mass <= 0.0:
		min_x = 0.0
		max_x = 0.0
		min_z = 0.0
		max_z = 0.0
	var balance_x := weighted_x / maxf(mass, 1.0)
	var balance_z := weighted_z / maxf(mass, 1.0)
	var footprint := Vector2(max_x - min_x, max_z - min_z)
	var clearance := clampf(0.34 - absf(balance_x) * 0.16 + (powered_wheels - 2) * 0.025, 0.08, 0.42)
	var connection_count: int = maxi(0, instances.size() - 1)
	if absf(balance_x) > 0.3 or absf(balance_z) > 0.3:
		warnings.append("Center of mass is offset; expect slower recovery after a glancing hit.")
	if powered_wheels == 2:
		warnings.append("Two-wheel drive saves mass but gives up grip during a turn or recovery.")
	if footprint.x > 3.4 or footprint.y > 3.4:
		warnings.append("The footprint is close to the arena clearance envelope.")

	var weapon_label := "unarmed"
	for value in parts:
		if value is Dictionary and CATALOG.has(str(value.get("catalog_id", ""))) and str(CATALOG[str(value.get("catalog_id", ""))].get("category", "")) == "weapon":
			weapon_label = str(CATALOG[str(value.get("catalog_id", ""))].get("label", "weapon"))
	var force_path := ""
	if weapon_label == "Ram drive":
		force_path = "Front contact → chassis → drive wheels; reward a straight approach."
	elif weapon_label == "Vertical spinner":
		force_path = "Spinner bite → weapon mount; recoil exposes a light or offset frame."
	else:
		force_path = "Hammer strike → top mount; committed timing leaves a recovery window."

	return {
		"valid": reasons.is_empty(),
		"reasons": reasons,
		"warnings": warnings,
		"mass_kg": snappedf(mass, 0.1),
		"power_draw": snappedf(power_draw, 0.1),
		"power_supply": snappedf(power_supply, 0.1),
		"part_count": parts.size(),
		"powered_wheels": powered_wheels,
		"active_weapons": active_weapons,
		"balance_x": snappedf(balance_x, 0.01),
		"balance_z": snappedf(balance_z, 0.01),
		"footprint": footprint,
		"clearance": snappedf(clearance, 0.01),
		"connections": connection_count,
		"traction": snappedf(traction, 0.01),
		"armor": snappedf(armor, 0.1),
		"force_path": force_path,
		"weapon_label": weapon_label,
	}

static func validate_blueprint(blueprint: Dictionary) -> Dictionary:
	return inspect_blueprint(blueprint)

static func server_rebuild(blueprint: Dictionary) -> Dictionary:
	var validation := inspect_blueprint(blueprint)
	if not validation.valid:
		return {"accepted": false, "validation": validation}
	var normalized_parts: Array = []
	for value in blueprint.parts:
		var part: Dictionary = value
		var catalog: Dictionary = CATALOG[str(part.catalog_id)]
		normalized_parts.append({
			"instance_id": str(part.instance_id),
			"catalog_id": str(part.catalog_id),
			"parent": str(part.get("parent", "")),
			"position": part.get("position", [0.0, 0.0, 0.0]),
			"rotation": part.get("rotation", [0.0, 0.0, 0.0]),
			"server_mass_kg": float(catalog.get("mass", 0.0)),
			"server_power_draw": float(catalog.get("draw", 0.0)),
			"server_power_supply": float(catalog.get("supply", 0.0)),
		})
	var rebuilt := {
		"blueprint_version": 2,
		"rules_version": RULES_VERSION,
		"name": str(blueprint.get("name", "Untitled machine")),
		"paint": str(blueprint.get("paint", "yard-yellow")),
		"parts": normalized_parts,
		"server_totals": {
			"mass_kg": validation.mass_kg,
			"power_draw": validation.power_draw,
			"power_supply": validation.power_supply,
			"part_count": validation.part_count,
		},
		"server_metrics": {
			"balance_x": validation.balance_x,
			"balance_z": validation.balance_z,
			"clearance": validation.clearance,
			"connections": validation.connections,
			"traction": validation.traction,
			"armor": validation.armor,
			"force_path": validation.force_path,
			"weapon_label": validation.weapon_label,
		},
	}
	return {
		"accepted": true,
		"validation": validation,
		"blueprint": rebuilt,
		"blueprint_hash": _sha256(_canonical_json(rebuilt)),
	}

static func save_blueprint(blueprint: Dictionary) -> Dictionary:
	var rebuilt := server_rebuild(blueprint)
	if not rebuilt.accepted:
		return rebuilt
	var file := FileAccess.open(BLUEPRINT_FILE, FileAccess.WRITE)
	if file == null:
		return {"accepted": false, "error": "The last-valid revision could not be opened for writing."}
	file.store_string(JSON.stringify(rebuilt.blueprint))
	return rebuilt

static func load_blueprint() -> Dictionary:
	if not FileAccess.file_exists(BLUEPRINT_FILE):
		return {"accepted": false, "error": "No last-valid revision exists on this device."}
	var file := FileAccess.open(BLUEPRINT_FILE, FileAccess.READ)
	if file == null:
		return {"accepted": false, "error": "The last-valid revision could not be read."}
	var parsed: Variant = JSON.parse_string(file.get_as_text())
	if not parsed is Dictionary:
		return {"accepted": false, "error": "The saved revision is invalid."}
	return server_rebuild(parsed)

static func _part(instance_id: String, catalog_id: String, parent: String, position: Array) -> Dictionary:
	return {
		"instance_id": instance_id,
		"catalog_id": catalog_id,
		"parent": parent,
		"position": position,
		"rotation": [0.0, 0.0, 0.0],
	}

static func _connects_to_root(instance_id: String, instances: Dictionary) -> bool:
	var cursor := instance_id
	var visited := {}
	while cursor != "root":
		if visited.has(cursor) or not instances.has(cursor):
			return false
		visited[cursor] = true
		var part: Dictionary = instances[cursor]
		cursor = str(part.get("parent", ""))
		if cursor.is_empty():
			return false
	return instances.has("root")

static func _find_forbidden_fields(value: Variant, path := "") -> Array[String]:
	var found: Array[String] = []
	if value is Dictionary:
		for key_value in value.keys():
			var key := str(key_value).to_lower()
			var next_path := key if path.is_empty() else "%s.%s" % [path, key]
			for forbidden in FORBIDDEN_VALUE_FIELDS:
				if key == forbidden or key.contains(forbidden):
					found.append(next_path)
			found.append_array(_find_forbidden_fields(value[key_value], next_path))
	elif value is Array:
		for index in value.size():
			found.append_array(_find_forbidden_fields(value[index], "%s[%d]" % [path, index]))
	return found

static func _array_to_vector3(value: Variant) -> Vector3:
	if value is Array and value.size() >= 3:
		return Vector3(float(value[0]), float(value[1]), float(value[2]))
	return Vector3.ZERO

static func _canonical_json(value: Variant) -> String:
	if value is Dictionary:
		var keys: Array = value.keys()
		keys.sort()
		var pairs: Array[String] = []
		for key in keys:
			pairs.append("%s:%s" % [JSON.stringify(str(key)), _canonical_json(value[key])])
		return "{%s}" % ",".join(pairs)
	if value is Array:
		var entries: Array[String] = []
		for entry in value:
			entries.append(_canonical_json(entry))
		return "[%s]" % ",".join(entries)
	return JSON.stringify(value)

static func _sha256(value: String) -> String:
	var context := HashingContext.new()
	context.start(HashingContext.HASH_SHA256)
	context.update(value.to_utf8_buffer())
	return context.finish().hex_encode()
