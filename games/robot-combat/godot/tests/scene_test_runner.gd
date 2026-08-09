extends SceneTree

var checks := 0
var failures: Array[String] = []

func _initialize() -> void:
	call_deferred("_run")

func _run() -> void:
	var packed: PackedScene = load("res://scenes/main.tscn")
	var game := packed.instantiate()
	root.add_child(game)
	await process_frame
	await physics_frame

	check(game.arena.size == Vector2(24.0, 16.0), "Arena exposes the locked 24 by 16 meter combat floor") # 1
	check(game.has_node("ShipTransferPlatform"), "Ship-transfer platform is present") # 2
	check(game.has_node("NorthSafetyBoundary") and game.has_node("SouthSafetyBoundary"), "Visible arena has continuous safety boundaries") # 3
	check(game.has_node("AuthoritativeMatch"), "One authoritative match controller owns the fight") # 4

	game._select_machine("RAMMER")
	game._start_match()
	await physics_frame
	var controller = game.match_controller
	check(controller.match_active, "Training match starts from the player menu") # 5
	check(controller.player_robot.machine_name == "Yard Mule" and controller.training_robot.machine_name == "Keelcutter", "Yard Mule and training opponent spawn from approved starters") # 6
	check(controller.player_robot.global_position.y > 0.0 and controller.training_robot.global_position.y > 0.0, "Both machines spawn upright above the combat floor") # 7
	check(controller.player_robot.blueprint_hash.length() == 64, "Arena robot carries the exact approved blueprint hash") # 8

	game._set_virtual_drive(1.0, 0.0)
	game._set_virtual_weapon(true)
	for _frame in 12:
		await physics_frame
	check(controller.player_robot.weapon_active, "Rammer action is server-owned and executable") # 9
	check(controller.time_remaining < controller.MATCH_LENGTH_SECONDS, "Authoritative match clock advances") # 10

	var before_damage: float = controller.training_robot.health
	controller.training_robot.server_apply_damage(7.0)
	check(controller.training_robot.health == before_damage - 7.0, "Server damage changes integrity without client totals") # 11
	controller.reset_match()
	await physics_frame
	check(controller.player_robot.health == controller.player_robot.max_health and absf(controller.time_remaining - controller.MATCH_LENGTH_SECONDS) < 0.1, "Reset rebuilds both robots and the match clock") # 12

	if checks != 12:
		failures.append("Scene harness expected 12 checks but executed %d." % checks)
	if failures.is_empty():
		print("BAY13_SCENE_ASSERTIONS:12:PASS")
		quit(0)
	else:
		for failure in failures:
			printerr("BAY13_SCENE_FAILURE:%s" % failure)
		printerr("BAY13_SCENE_ASSERTIONS:%d:FAIL" % checks)
		quit(1)

func check(condition: bool, label: String) -> void:
	checks += 1
	if condition:
		print("BAY13_SCENE_PASS:%02d:%s" % [checks, label])
	else:
		failures.append("%02d:%s" % [checks, label])
