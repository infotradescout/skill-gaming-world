extends SceneTree

const BlueprintServiceScript := preload("res://scripts/blueprint_service.gd")

var checks := 0
var failures: Array[String] = []

func _initialize() -> void:
	call_deferred("_run")

func _run() -> void:
	var rammer := BlueprintServiceScript.default_blueprint("RAMMER")
	var ripper := BlueprintServiceScript.default_blueprint("RIPPER")
	var maul := BlueprintServiceScript.default_blueprint("MAUL")
	var rammer_validation := BlueprintServiceScript.validate_blueprint(rammer)
	var ripper_validation := BlueprintServiceScript.validate_blueprint(ripper)
	var maul_validation := BlueprintServiceScript.validate_blueprint(maul)

	check(rammer_validation.valid, "Yard Mule starter blueprint is legal") # 1
	check(ripper_validation.valid, "Keelcutter starter blueprint is legal") # 2
	check(maul_validation.valid, "Pilebreaker starter blueprint is legal") # 3
	check(rammer.name == "Yard Mule", "Rammer uses its Bay 13 identity") # 4
	check(ripper.name == "Keelcutter", "Ripper uses its Bay 13 identity") # 5
	check(maul.name == "Pilebreaker", "Maul uses its Bay 13 identity") # 6
	check(is_equal_approx(rammer_validation.mass_kg, 104.0), "Yard Mule mass is server calculated") # 7
	check(is_equal_approx(ripper_validation.mass_kg, 109.0), "Keelcutter mass is server calculated") # 8
	check(is_equal_approx(maul_validation.mass_kg, 118.0), "Pilebreaker mass is server calculated") # 9
	check(rammer_validation.power_supply >= rammer_validation.power_draw, "Starter power budget is legal") # 10

	var rebuilt_a := BlueprintServiceScript.server_rebuild(ripper)
	var rebuilt_b := BlueprintServiceScript.server_rebuild(ripper.duplicate(true))
	check(rebuilt_a.accepted and rebuilt_b.accepted, "Valid blueprints rebuild on the server") # 11
	check(rebuilt_a.blueprint_hash == rebuilt_b.blueprint_hash, "Identical blueprints reconstruct deterministically") # 12
	check(str(rebuilt_a.blueprint_hash).length() == 64, "Blueprint identity is a SHA-256 hash") # 13
	var forged_totals := ripper.duplicate(true)
	forged_totals.declared_mass_kg = 1.0
	forged_totals.declared_power = 99999
	var forged_rebuild := BlueprintServiceScript.server_rebuild(forged_totals)
	check(forged_rebuild.accepted and forged_rebuild.blueprint.server_totals.mass_kg == 109.0, "Client-declared physics totals are ignored") # 14

	var overweight := maul.duplicate(true)
	for index in 3:
		overweight.parts.append({
			"instance_id": "extra-armor-%d" % index,
			"catalog_id": "front_plow",
			"parent": "root",
			"position": [float(index) * 0.3, 0.7, 0.4],
			"rotation": [0.0, 0.0, 0.0],
		})
	var overweight_result := BlueprintServiceScript.validate_blueprint(overweight)
	check(not overweight_result.valid, "Overweight blueprint is denied") # 15
	check(_has_reason(overweight_result, "overweight"), "Overweight denial explains the 120 kg class") # 16

	var disconnected := rammer.duplicate(true)
	disconnected.parts[6].parent = "missing-rail"
	var disconnected_result := BlueprintServiceScript.validate_blueprint(disconnected)
	check(not disconnected_result.valid and _has_reason(disconnected_result, "disconnected"), "Disconnected part is denied with a reason") # 17

	var underpowered := ripper.duplicate(true)
	underpowered.parts[1].catalog_id = "battery_compact"
	var underpowered_result := BlueprintServiceScript.validate_blueprint(underpowered)
	check(not underpowered_result.valid and _has_reason(underpowered_result, "underpowered"), "Insufficient power is denied with a reason") # 18

	var no_battery := rammer.duplicate(true)
	no_battery.parts.remove_at(1)
	var no_battery_result := BlueprintServiceScript.validate_blueprint(no_battery)
	check(not no_battery_result.valid and _has_reason(no_battery_result, "battery"), "Missing battery is denied") # 19

	var two_few_wheels := rammer.duplicate(true)
	for index in [5, 4, 3]:
		two_few_wheels.parts.remove_at(index)
	var wheel_result := BlueprintServiceScript.validate_blueprint(two_few_wheels)
	check(not wheel_result.valid and _has_reason(wheel_result, "powered wheels"), "Fewer than two powered wheels is denied") # 20

	var too_many_parts := rammer.duplicate(true)
	for index in 65:
		too_many_parts.parts.append({
			"instance_id": "battery-extra-%d" % index,
			"catalog_id": "battery_compact",
			"parent": "root",
			"position": [0.0, 0.0, 0.0],
			"rotation": [0.0, 0.0, 0.0],
		})
	var part_limit_result := BlueprintServiceScript.validate_blueprint(too_many_parts)
	check(not part_limit_result.valid and _has_reason(part_limit_result, "64-part"), "Part-count overflow is denied") # 21

	var outside := rammer.duplicate(true)
	outside.parts[7].position = [8.0, 0.0, 0.0]
	var outside_result := BlueprintServiceScript.validate_blueprint(outside)
	check(not outside_result.valid and _has_reason(outside_result, "envelope"), "Out-of-envelope placement is denied") # 22

	var overlap := rammer.duplicate(true)
	overlap.parts[7].position = overlap.parts[6].position
	var overlap_result := BlueprintServiceScript.validate_blueprint(overlap)
	check(not overlap_result.valid and _has_reason(overlap_result, "overlap"), "External solid overlap is denied") # 23

	var unknown := rammer.duplicate(true)
	unknown.parts[7].catalog_id = "unapproved-rocket"
	var unknown_result := BlueprintServiceScript.validate_blueprint(unknown)
	check(not unknown_result.valid and _has_reason(unknown_result, "approved catalog"), "Unknown catalog part is denied") # 24

	var duplicate_id := rammer.duplicate(true)
	duplicate_id.parts[7].instance_id = "front"
	var duplicate_result := BlueprintServiceScript.validate_blueprint(duplicate_id)
	check(not duplicate_result.valid and _has_reason(duplicate_result, "unique instance"), "Duplicate part identity is denied") # 25

	var second_chassis := rammer.duplicate(true)
	second_chassis.parts.append({
		"instance_id": "second-root",
		"catalog_id": "chassis_compact",
		"parent": "root",
		"position": [0.0, 0.0, 0.0],
		"rotation": [0.0, 0.0, 0.0],
	})
	var chassis_result := BlueprintServiceScript.validate_blueprint(second_chassis)
	check(not chassis_result.valid and _has_reason(chassis_result, "exactly one chassis"), "Multiple chassis roots are denied") # 26

	var three_weapons := rammer.duplicate(true)
	for index in 2:
		three_weapons.parts.append({
			"instance_id": "extra-weapon-%d" % index,
			"catalog_id": "weapon_ram",
			"parent": "root",
			"position": [float(index) + 0.2, 0.8, 0.0],
			"rotation": [0.0, 0.0, 0.0],
		})
	var weapon_result := BlueprintServiceScript.validate_blueprint(three_weapons)
	check(not weapon_result.valid and _has_reason(weapon_result, "two active weapons"), "More than two active weapons is denied") # 27

	var all_value_fields_denied := true
	for field in BlueprintServiceScript.FORBIDDEN_VALUE_FIELDS:
		var value_blueprint := rammer.duplicate(true)
		value_blueprint[field] = 1
		if BlueprintServiceScript.validate_blueprint(value_blueprint).valid:
			all_value_fields_denied = false
	check(all_value_fields_denied, "Every money, prize, wager, redemption, and Legal Play field is denied") # 28
	check(_names_are_original([rammer.name, ripper.name, maul.name]), "Starter names remain original and unaffiliated") # 29
	check(_is_data_only(rammer), "Blueprint contains data and no executable object") # 30

	var saved := BlueprintServiceScript.save_blueprint(rammer)
	check(saved.accepted, "Valid blueprint saves locally") # 31
	var loaded := BlueprintServiceScript.load_blueprint()
	check(loaded.accepted and loaded.blueprint_hash == saved.blueprint_hash, "Saved blueprint loads as the exact server rebuild") # 32

	if checks != 32:
		failures.append("Test harness expected 32 checks but executed %d." % checks)
	if failures.is_empty():
		print("BAY13_RUNTIME_ASSERTIONS:32:PASS")
		quit(0)
	else:
		for failure in failures:
			printerr("BAY13_TEST_FAILURE:%s" % failure)
		printerr("BAY13_RUNTIME_ASSERTIONS:%d:FAIL" % checks)
		quit(1)

func check(condition: bool, label: String) -> void:
	checks += 1
	if condition:
		print("BAY13_TEST_PASS:%02d:%s" % [checks, label])
	else:
		failures.append("%02d:%s" % [checks, label])

func _has_reason(result: Dictionary, fragment: String) -> bool:
	for reason in result.get("reasons", []):
		if str(reason).to_lower().contains(fragment.to_lower()):
			return true
	return false

func _names_are_original(names: Array) -> bool:
	var protected_term := "battle" + "bots"
	for name in names:
		if str(name).to_lower().contains(protected_term):
			return false
	return names == ["Yard Mule", "Keelcutter", "Pilebreaker"]

func _is_data_only(value: Variant) -> bool:
	if value is Dictionary:
		for child in value.values():
			if not _is_data_only(child):
				return false
		return true
	if value is Array:
		for child in value:
			if not _is_data_only(child):
				return false
		return true
	return value is String or value is int or value is float or value is bool or value == null
