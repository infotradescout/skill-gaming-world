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
	check(BlueprintServiceScript.validate_blueprint(rammer).valid, "Rammer teaching fixture is arena-valid")
	check(BlueprintServiceScript.validate_blueprint(ripper).valid, "Ripper teaching fixture is arena-valid")
	check(BlueprintServiceScript.validate_blueprint(maul).valid, "Maul teaching fixture is arena-valid")

	var rammer_inspection := BlueprintServiceScript.inspect_blueprint(rammer)
	check(rammer_inspection.connections == 7, "Inspection counts every connected part")
	check(str(rammer_inspection.force_path).contains("chassis"), "Inspection explains the force path")
	check(float(rammer_inspection.mass_kg) > 0.0 and float(rammer_inspection.power_supply) >= float(rammer_inspection.power_draw), "Inspection calculates server physics totals")

	var changed_front := rammer.duplicate(true)
	changed_front.parts[6].catalog_id = "front_plow"
	var changed_inspection := BlueprintServiceScript.inspect_blueprint(changed_front)
	check(float(changed_inspection.mass_kg) > float(rammer_inspection.mass_kg), "Replacing a front assembly changes mass")

	var shifted_weapon := rammer.duplicate(true)
	shifted_weapon.parts[7].position[2] = -0.2
	var shifted_inspection := BlueprintServiceScript.inspect_blueprint(shifted_weapon)
	check(not is_equal_approx(float(shifted_inspection.balance_z), float(rammer_inspection.balance_z)), "Repositioning the weapon changes balance")

	var underpowered := ripper.duplicate(true)
	underpowered.parts[1].catalog_id = "battery_compact"
	var underpowered_result := BlueprintServiceScript.validate_blueprint(underpowered)
	check(not underpowered_result.valid and _has_reason(underpowered_result, "underpowered"), "An underpowered draft is rejected with a reason")

	var disconnected := rammer.duplicate(true)
	disconnected.parts[6].parent = "missing-rail"
	var disconnected_result := BlueprintServiceScript.validate_blueprint(disconnected)
	check(not disconnected_result.valid and _has_reason(disconnected_result, "disconnected"), "A disconnected part is rejected with a reason")

	var overweight := rammer.duplicate(true)
	for index in 3:
		overweight.parts.append({
			"instance_id": "extra-plow-%d" % index,
			"catalog_id": "front_plow",
			"parent": "root",
			"position": [float(index) * 0.3, 0.7, 0.4],
			"rotation": [0.0, 0.0, 0.0],
		})
	var overweight_result := BlueprintServiceScript.validate_blueprint(overweight)
	check(not overweight_result.valid and _has_reason(overweight_result, "overweight"), "An overweight draft is rejected with a class-limit reason")

	var rebuilt_a := BlueprintServiceScript.server_rebuild(rammer)
	var rebuilt_b := BlueprintServiceScript.server_rebuild(rammer.duplicate(true))
	check(rebuilt_a.accepted and rebuilt_b.accepted, "Valid builds are rebuilt by the server boundary")
	check(rebuilt_a.blueprint_hash == rebuilt_b.blueprint_hash and str(rebuilt_a.blueprint_hash).length() == 64, "Identical builds receive deterministic identity")
	check(rebuilt_a.blueprint.server_metrics.has("force_path"), "The authoritative rebuild carries consequence metrics")

	var saved := BlueprintServiceScript.save_blueprint(rammer)
	var loaded := BlueprintServiceScript.load_blueprint()
	check(saved.accepted and loaded.accepted and loaded.blueprint_hash == saved.blueprint_hash, "The last-valid revision survives a save/load cycle")

	var value_fields_denied := true
	for field in BlueprintServiceScript.FORBIDDEN_VALUE_FIELDS:
		var value_blueprint := rammer.duplicate(true)
		value_blueprint[field] = 1
		if BlueprintServiceScript.validate_blueprint(value_blueprint).valid:
			value_fields_denied = false
	check(value_fields_denied, "Free-side value-bearing fields remain denied")

	if checks != 16:
		failures.append("Expected 16 checks but executed %d." % checks)
	if failures.is_empty():
		print("ROBOT_COMBAT_WORKSHOP_ASSERTIONS:%d:PASS" % checks)
		quit(0)
	else:
		for failure in failures:
			printerr("ROBOT_COMBAT_TEST_FAILURE:%s" % failure)
		printerr("ROBOT_COMBAT_WORKSHOP_ASSERTIONS:%d:FAIL" % checks)
		quit(1)

func check(condition: bool, label: String) -> void:
	checks += 1
	if condition:
		print("ROBOT_COMBAT_TEST_PASS:%02d:%s" % [checks, label])
	else:
		failures.append("%02d:%s" % [checks, label])

func _has_reason(result: Dictionary, fragment: String) -> bool:
	for reason in result.get("reasons", []):
		if str(reason).to_lower().contains(fragment.to_lower()):
			return true
	return false
