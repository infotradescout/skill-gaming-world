extends SceneTree

var checks := 0
var failures: Array[String] = []

func _initialize() -> void:
	call_deferred("_run")

func _run() -> void:
	var packed: PackedScene = load("res://scenes/main.tscn")
	var game = packed.instantiate()
	root.add_child(game)
	await process_frame
	await process_frame

	check(game.phase == game.Phase.WORKSHOP, "Runtime opens in the Robot Combat workshop")
	check(game.workshop_panel.visible and game.inspection_panel.visible, "Workshop and inspection are first-class visible surfaces")
	check(game.revisions.size() >= 1 and not game.last_valid_rebuild.is_empty(), "A starter creates a preserved last-valid revision")
	check(game.preview_assembly != null and game.preview_assembly.get_child_count() > 0, "Preview is assembled from physical parts")

	var original_hash := str(game.last_valid_rebuild.get("blueprint_hash", ""))
	game.part_buttons["battery"].select(0)
	game._on_part_selected(0, "battery")
	await process_frame
	check(game.save_revision_button.disabled, "An invalid draft cannot be saved")
	check(str(game.last_valid_rebuild.get("blueprint_hash", "")) == original_hash, "Invalid draft does not overwrite last-valid revision")

	game._load_last_valid()
	await process_frame
	check(not game.save_revision_button.disabled and not game.test_bay_button.disabled, "Loading last-valid restores an arena-ready build")

	game._save_revision()
	await process_frame
	check(game.revisions.size() >= 2, "Saving creates a named revision instead of a transient menu state")

	game._start_test_bay()
	await process_frame
	await physics_frame
	check(game.phase == game.Phase.TEST_BAY and game.match_controller.match_active, "Private test bay starts from the workshop")
	check(game.match_controller.player_robot.assembly != null and game.match_controller.player_robot.blueprint_hash.length() == 64, "Arena robot carries the saved build assembly and identity")
	check(game.match_controller.player_robot.machine_name == "Yard Mule starter", "Arena HUD carries the builder's saved machine name")

	var before_position: Vector3 = game.match_controller.player_robot.global_position
	game._set_virtual_drive(1.0, 0.0)
	game._set_virtual_weapon(true)
	for _frame in 12:
		await physics_frame
	var after_position: Vector3 = game.match_controller.player_robot.global_position
	check(before_position.distance_to(after_position) > 0.01, "Test bay accepts real drive input")
	check(game.match_controller.time_remaining < game.match_controller.MATCH_LENGTH_SECONDS, "Local authority advances the session clock")

	game.match_controller.training_robot.server_apply_damage(1000.0, "scene proof")
	await process_frame
	await process_frame
	check(game.phase == game.Phase.REPORT and game.report_overlay.visible, "A completed fight opens a consequence report")
	check(game.report_damage_label.text.contains("INCOMING DAMAGE"), "Report contains readable damage evidence")

	game._load_last_valid_from_report()
	await process_frame
	check(game.phase == game.Phase.WORKSHOP and game.workshop_panel.visible, "Report returns to rebuild without ending the loop")

	if checks != 16:
		failures.append("Expected 16 checks but executed %d." % checks)
	if failures.is_empty():
		print("ROBOT_COMBAT_SCENE_ASSERTIONS:%d:PASS" % checks)
		quit(0)
	else:
		for failure in failures:
			printerr("ROBOT_COMBAT_SCENE_FAILURE:%s" % failure)
		printerr("ROBOT_COMBAT_SCENE_ASSERTIONS:%d:FAIL" % checks)
		quit(1)

func check(condition: bool, label: String) -> void:
	checks += 1
	if condition:
		print("ROBOT_COMBAT_SCENE_PASS:%02d:%s" % [checks, label])
	else:
		failures.append("%02d:%s" % [checks, label])
