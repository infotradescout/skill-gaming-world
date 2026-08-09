class_name BlueprintService
extends RefCounted

const RULES_VERSION := "BAY13_BLUEPRINT_RULES_V1"
const BLUEPRINT_FILE := "user://bay13-blueprint-v1.json"
const MAX_MASS_KG := 120.0
const MAX_PARTS := 64
const MAX_SIZE := Vector3(3.8, 2.4, 3.8)

const FORBIDDEN_VALUE_FIELDS := [
	"cash",
	"entry_fee",
	"legal_play",
	"paid",
	"payout",
	"price",
	"prize",
	"purchase",
	"redeem",
	"wager",
]

const CATALOG := {
	"chassis_compact": {
		"category": "chassis", "mass": 44.0, "draw": 0.0, "supply": 0.0,
		"size": [2.3, 0.45, 1.55], "active_weapon": false,
	},
	"chassis_armored": {
		"category": "chassis", "mass": 54.0, "draw": 0.0, "supply": 0.0,
		"size": [2.55, 0.52, 1.72], "active_weapon": false,
	},
	"battery_compact": {
		"category": "battery", "mass": 10.0, "draw": 0.0, "supply": 45.0,
		"size": [0.58, 0.25, 0.38], "active_weapon": false,
	},
	"battery_competition": {
		"category": "battery", "mass": 14.0, "draw": 0.0, "supply": 90.0,
		"size": [0.68, 0.28, 0.42], "active_weapon": false,
	},
	"wheel_drive": {
		"category": "wheel", "mass": 3.0, "draw": 10.0, "supply": 0.0,
		"size": [0.42, 0.42, 0.22], "active_weapon": false,
	},
	"front_wedge": {
		"category": "front", "mass": 16.0, "draw": 0.0, "supply": 0.0,
		"size": [1.6, 0.2, 0.7], "active_weapon": false,
	},
	"front_forks": {
		"category": "front", "mass": 14.0, "draw": 0.0, "supply": 0.0,
		"size": [1.45, 0.18, 0.75], "active_weapon": false,
	},
	"front_plow": {
		"category": "front", "mass": 19.0, "draw": 0.0, "supply": 0.0,
		"size": [1.75, 0.34, 0.68], "active_weapon": false,
	},
	"weapon_ram": {
		"category": "weapon", "mass": 8.0, "draw": 8.0, "supply": 0.0,
		"size": [0.7, 0.24, 0.52], "active_weapon": true,
	},
	"weapon_spinner": {
		"category": "weapon", "mass": 25.0, "draw": 32.0, "supply": 0.0,
		"size": [0.3, 1.0, 1.0], "active_weapon": true,
	},
	"weapon_hammer": {
		"category": "weapon", "mass": 22.0, "draw": 24.0, "supply": 0.0,
		"size": [0.28, 1.15, 1.55], "active_weapon": true,
	},
}

static func default_blueprint(machine: String) -> Dictionary:
	match machine.to_upper():
		"RIPPER", "KEELCUTTER":
			return build_blueprint({
				"name": "Keelcutter",
				"chassis": "chassis_compact",
				"battery": "battery_competition",
				"front": "front_forks",
				"weapon": "weapon_spinner",
				"paint": "cutter-teal",
			})
		"MAUL", "PILEBREAKER":
			return build_blueprint({
				"name": "Pilebreaker",
				"chassis": "chassis_armored",
				"battery": "battery_competition",
				"front": "front_wedge",
				"weapon": "weapon_hammer",
				"paint": "forge-orange",
			})
		_:
			return build_blueprint({
				"name": "Yard Mule",
				"chassis": "chassis_armored",
				"battery": "battery_competition",
				"front": "front_wedge",
				"weapon": "weapon_ram",
				"paint": "yard-yellow",
			})

static func build_blueprint(selection: Dictionary) -> Dictionary:
	var parts: Array = [
		_part("root", str(selection.get("chassis", "chassis_compact")), ""),
		_part("battery", str(selection.get("battery", "battery_competition")), "root"),
		_part("wheel-fl", "wheel_drive", "root", [-0.9, -0.2, -0.62]),
		_part("wheel-fr", "wheel_drive", "root", [0.9, -0.2, -0.62]),
		_part("wheel-rl", "wheel_drive", "root", [-0.9, -0.2, 0.62]),
		_part("wheel-rr", "wheel_drive", "root", [0.9, -0.2, 0.62]),
		_part("front", str(selection.get("front", "front_wedge")), "root", [0.0, -0.08, -1.02]),
	]
	var weapon := str(selection.get("weapon", "weapon_ram"))
	if not weapon.is_empty():
		parts.append(_part("weapon", weapon, "root", [0.0, 0.36, -0.55]))
	return {
		"blueprint_version": 1,
		"rules_version": RULES_VERSION,
		"name": str(selection.get("name", "Untitled Machine")),
		"paint": str(selection.get("paint", "yard-yellow")),
		"parts": parts,
	}

static func _part(instance_id: String, catalog_id: String, parent: String, position: Array = [0.0, 0.0, 0.0]) -> Dictionary:
	return {
		"instance_id": instance_id,
		"catalog_id": catalog_id,
		"parent": parent,
		"position": position,
		"rotation": [0.0, 0.0, 0.0],
	}

static func validate_blueprint(blueprint: Dictionary) -> Dictionary:
	var reasons: Array[String] = []
	var parts_value: Variant = blueprint.get("parts", [])
	if not parts_value is Array:
		reasons.append("Parts must be a data-only list.")
		parts_value = []
	var parts: Array = parts_value
	if parts.size() > MAX_PARTS:
		reasons.append("The build exceeds the 64-part limit.")
	if parts.is_empty():
		reasons.append("The build needs one approved chassis.")

	var mass := 0.0
	var power_draw := 0.0
	var power_supply := 0.0
	var chassis_count := 0
	var battery_count := 0
	var powered_wheels := 0
	var active_weapons := 0
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
			reasons.append("Part '%s' is not in the approved catalog." % catalog_id)
			continue
		var catalog: Dictionary = CATALOG[catalog_id]
		var category := str(catalog.category)
		mass += float(catalog.mass)
		power_draw += float(catalog.draw)
		power_supply += float(catalog.supply)
		match category:
			"chassis": chassis_count += 1
			"battery": battery_count += 1
			"wheel": powered_wheels += 1
			"weapon":
				if bool(catalog.active_weapon):
					active_weapons += 1
		var position := _array_to_vector3(part.get("position", [0.0, 0.0, 0.0]))
		var size := _array_to_vector3(catalog.size)
		if abs(position.x) + size.x * 0.5 > MAX_SIZE.x * 0.5 \
			or abs(position.y) + size.y * 0.5 > MAX_SIZE.y * 0.5 \
			or abs(position.z) + size.z * 0.5 > MAX_SIZE.z * 0.5:
			reasons.append("Part '%s' sits outside the 3.8 × 3.8 × 2.4 meter build envelope." % instance_id)
		if category in ["front", "weapon", "wheel"]:
			var cell := "%0.3f:%0.3f:%0.3f" % [position.x, position.y, position.z]
			if occupied.has(cell):
				reasons.append("Solid external parts overlap at one placement point.")
			occupied[cell] = instance_id

	if chassis_count != 1:
		reasons.append("A legal build requires exactly one chassis.")
	if battery_count < 1:
		reasons.append("A legal build needs at least one battery.")
	if powered_wheels < 2:
		reasons.append("A legal build needs at least two powered wheels.")
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

	return {
		"valid": reasons.is_empty(),
		"reasons": reasons,
		"mass_kg": snappedf(mass, 0.1),
		"power_draw": snappedf(power_draw, 0.1),
		"power_supply": snappedf(power_supply, 0.1),
		"part_count": parts.size(),
		"powered_wheels": powered_wheels,
		"active_weapons": active_weapons,
	}

static func server_rebuild(blueprint: Dictionary) -> Dictionary:
	var validation := validate_blueprint(blueprint)
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
			"server_mass_kg": float(catalog.mass),
			"server_power_draw": float(catalog.draw),
			"server_power_supply": float(catalog.supply),
		})
	var rebuilt := {
		"blueprint_version": 1,
		"rules_version": RULES_VERSION,
		"name": str(blueprint.get("name", "Untitled Machine")),
		"paint": str(blueprint.get("paint", "yard-yellow")),
		"parts": normalized_parts,
		"server_totals": {
			"mass_kg": validation.mass_kg,
			"power_draw": validation.power_draw,
			"power_supply": validation.power_supply,
			"part_count": validation.part_count,
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
		return {"accepted": false, "error": "The blueprint save could not be opened."}
	file.store_string(JSON.stringify(rebuilt.blueprint))
	return rebuilt

static func load_blueprint() -> Dictionary:
	if not FileAccess.file_exists(BLUEPRINT_FILE):
		return {"accepted": false, "error": "No saved blueprint exists on this device."}
	var file := FileAccess.open(BLUEPRINT_FILE, FileAccess.READ)
	if file == null:
		return {"accepted": false, "error": "The blueprint save could not be read."}
	var parsed: Variant = JSON.parse_string(file.get_as_text())
	if not parsed is Dictionary:
		return {"accepted": false, "error": "The saved blueprint is invalid."}
	return server_rebuild(parsed)

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
