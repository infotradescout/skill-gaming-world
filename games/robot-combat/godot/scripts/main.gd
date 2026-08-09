extends Node3D

const ArenaBuilderScript := preload("res://scripts/arena_builder.gd")
const BlueprintServiceScript := preload("res://scripts/blueprint_service.gd")
const MatchControllerScript := preload("res://scripts/match_controller.gd")
const NetworkBridgeScript := preload("res://scripts/network_bridge.gd")

const MACHINE_COPY := {
	"RAMMER": {
		"title": "YARD MULE",
		"line": "Fast wedge pusher · control and wall pressure",
		"paint": Color("#caa03f"),
	},
	"RIPPER": {
		"title": "KEELCUTTER",
		"line": "Guarded vertical spinner · timing and recoil",
		"paint": Color("#3e918a"),
	},
	"MAUL": {
		"title": "PILEBREAKER",
		"line": "Overhead hammer · aim, strike, and recovery",
		"paint": Color("#b75f35"),
	},
}

var arena: Dictionary
var match_controller: MatchController
var camera: Camera3D
var selected_machine := "RAMMER"
var selected_rebuild := {}

var ui_root: Control
var menu_overlay: Control
var garage_overlay: Control
var result_overlay: Control
var hud: Control
var mobile_controls: Control
var machine_summary: Label
var hud_title: Label
var hud_clock: Label
var hud_player_health: Label
var hud_training_health: Label
var hud_status: Label
var result_title: Label
var result_copy: Label

var garage_chassis: OptionButton
var garage_wheels: OptionButton
var garage_front: OptionButton
var garage_weapon: OptionButton
var garage_paint: OptionButton
var garage_totals: Label
var garage_validation: Label

var virtual_throttle := 0.0
var virtual_steer := 0.0
var virtual_weapon := false

func _ready() -> void:
	var args := OS.get_cmdline_user_args()
	if "--network-server" in args or "--network-client" in args:
		_start_network_smoke(args)
		return

	arena = ArenaBuilderScript.build(self)
	match_controller = MatchControllerScript.new()
	match_controller.name = "AuthoritativeMatch"
	match_controller.match_started.connect(_on_match_started)
	match_controller.hud_changed.connect(_on_hud_changed)
	match_controller.match_finished.connect(_on_match_finished)
	add_child(match_controller)
	_build_camera()
	_build_interface()
	_select_machine("RAMMER")

func _process(delta: float) -> void:
	if is_instance_valid(match_controller) and is_instance_valid(match_controller.player_robot) and match_controller.match_active:
		var robot := match_controller.player_robot
		var desired := robot.global_position + robot.global_transform.basis.z * 7.8 + Vector3.UP * 5.2
		camera.global_position = camera.global_position.lerp(desired, clampf(delta * 4.2, 0.0, 1.0))
		camera.look_at(robot.global_position + Vector3.UP * 0.55, Vector3.UP)
		robot.set_virtual_input(virtual_throttle, virtual_steer, virtual_weapon)

func _unhandled_key_input(event: InputEvent) -> void:
	if not event is InputEventKey or not event.pressed or event.echo:
		return
	match event.keycode:
		KEY_R:
			if is_instance_valid(match_controller) and match_controller.match_active:
				match_controller.reset_match()
		KEY_G:
			_open_garage()
		KEY_ESCAPE:
			if garage_overlay.visible:
				_show_menu()
			elif result_overlay.visible:
				_show_menu()

func _build_camera() -> void:
	camera = Camera3D.new()
	camera.name = "BroadcastFollowCamera"
	camera.fov = 67.0
	camera.near = 0.08
	camera.far = 180.0
	camera.position = arena.camera_anchor
	camera.current = true
	add_child(camera)
	camera.look_at(Vector3(0.0, 0.4, 0.0), Vector3.UP)

func _build_interface() -> void:
	var layer := CanvasLayer.new()
	layer.name = "Bay13Interface"
	add_child(layer)
	ui_root = Control.new()
	ui_root.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	ui_root.theme = _game_theme()
	layer.add_child(ui_root)

	menu_overlay = _full_overlay(Color(0.015, 0.025, 0.033, 0.9))
	ui_root.add_child(menu_overlay)
	_build_menu(menu_overlay)

	garage_overlay = _full_overlay(Color(0.012, 0.021, 0.028, 0.94))
	garage_overlay.visible = false
	ui_root.add_child(garage_overlay)
	_build_garage(garage_overlay)

	result_overlay = _full_overlay(Color(0.012, 0.02, 0.027, 0.82))
	result_overlay.visible = false
	ui_root.add_child(result_overlay)
	_build_result(result_overlay)

	hud = _build_hud()
	hud.visible = false
	ui_root.add_child(hud)
	mobile_controls = _build_mobile_controls()
	mobile_controls.visible = false
	ui_root.add_child(mobile_controls)

func _build_menu(overlay: Control) -> void:
	var center := CenterContainer.new()
	center.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	overlay.add_child(center)
	var panel := PanelContainer.new()
	panel.custom_minimum_size = Vector2(910, 650)
	panel.add_theme_stylebox_override("panel", _panel_style(Color("#111a21"), Color("#42515a"), 28))
	center.add_child(panel)
	var margin := MarginContainer.new()
	_set_margins(margin, 44)
	panel.add_child(margin)
	var stack := VBoxContainer.new()
	stack.add_theme_constant_override("separation", 18)
	margin.add_child(stack)

	var kicker := _label("SKILL GAMING WORLD · FREE SIDE", 18, Color("#dfbd67"))
	kicker.add_theme_constant_override("outline_size", 5)
	stack.add_child(kicker)
	var title := _label("BAY 13: THE SCRAPYARD", 48, Color("#f1f3ee"))
	stack.add_child(title)
	var intro := _label("Bay 13 broke ships for forty years. When the contracts died, the builders stayed. Build it yourself, bring it through the gate, and leave with whatever still runs.", 20, Color("#b9c4c7"))
	intro.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	intro.custom_minimum_size.y = 66
	stack.add_child(intro)

	var divider := HSeparator.new()
	stack.add_child(divider)
	stack.add_child(_label("CHOOSE A STARTER MACHINE", 17, Color("#8ea0a8")))
	var choices := HBoxContainer.new()
	choices.add_theme_constant_override("separation", 12)
	stack.add_child(choices)
	for key in ["RAMMER", "RIPPER", "MAUL"]:
		var copy: Dictionary = MACHINE_COPY[key]
		var button := _button("%s\n%s" % [copy.title, copy.line], 17)
		button.custom_minimum_size = Vector2(252, 102)
		button.pressed.connect(_select_machine.bind(key))
		choices.add_child(button)

	machine_summary = _label("", 20, Color("#e8d28e"))
	machine_summary.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	machine_summary.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	machine_summary.custom_minimum_size.y = 54
	stack.add_child(machine_summary)

	var actions := HBoxContainer.new()
	actions.alignment = BoxContainer.ALIGNMENT_CENTER
	actions.add_theme_constant_override("separation", 12)
	stack.add_child(actions)
	var start := _button("ENTER TRAINING MATCH", 20, true)
	start.custom_minimum_size = Vector2(330, 62)
	start.pressed.connect(_start_match)
	actions.add_child(start)
	var garage := _button("OPEN GARAGE", 18)
	garage.custom_minimum_size = Vector2(220, 62)
	garage.pressed.connect(_open_garage)
	actions.add_child(garage)

	var boundary := _label("FREE · NO ENTRY FEE · NO WAGER · NO CASH OR REDEEMABLE VALUE · NO BOUGHT PERFORMANCE", 15, Color("#70c7ad"))
	boundary.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	stack.add_child(boundary)
	var controls := _label("Drive: WASD / arrows / gamepad · Weapon: Space / A · Reset: R · Garage: G", 15, Color("#84939a"))
	controls.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	stack.add_child(controls)

func _build_garage(overlay: Control) -> void:
	var center := CenterContainer.new()
	center.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	overlay.add_child(center)
	var panel := PanelContainer.new()
	panel.custom_minimum_size = Vector2(820, 680)
	panel.add_theme_stylebox_override("panel", _panel_style(Color("#101920"), Color("#56636a"), 24))
	center.add_child(panel)
	var margin := MarginContainer.new()
	_set_margins(margin, 36)
	panel.add_child(margin)
	var stack := VBoxContainer.new()
	stack.add_theme_constant_override("separation", 12)
	margin.add_child(stack)
	stack.add_child(_label("BAY 13 GARAGE", 40, Color("#f0d17b")))
	var copy := _label("Combine approved parts. Bay 13 recalculates mass, power, attachment paths, size, and blueprint identity before the machine reaches the floor.", 18, Color("#b6c1c5"))
	copy.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	copy.custom_minimum_size.y = 56
	stack.add_child(copy)

	var form := GridContainer.new()
	form.columns = 2
	form.add_theme_constant_override("h_separation", 24)
	form.add_theme_constant_override("v_separation", 10)
	stack.add_child(form)
	garage_chassis = _option_row(form, "Chassis", ["Compact frame", "Armored frame"])
	garage_wheels = _option_row(form, "Powered wheels", ["Four drive wheels", "Two drive wheels"])
	garage_front = _option_row(form, "Front armor", ["Low wedge", "Twin forks", "Heavy plow"])
	garage_weapon = _option_row(form, "Weapon", ["Ram drive", "Vertical spinner", "Overhead hammer"])
	garage_paint = _option_row(form, "Paint", ["Yard yellow", "Cutter teal", "Forge orange", "Cold steel"])
	for option in [garage_chassis, garage_wheels, garage_front, garage_weapon, garage_paint]:
		option.item_selected.connect(_update_garage_validation)

	garage_totals = _label("", 22, Color("#f0d17b"))
	stack.add_child(garage_totals)
	garage_validation = _label("", 17, Color("#76d0b1"))
	garage_validation.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	garage_validation.custom_minimum_size.y = 74
	stack.add_child(garage_validation)

	var actions := HBoxContainer.new()
	actions.alignment = BoxContainer.ALIGNMENT_CENTER
	actions.add_theme_constant_override("separation", 10)
	stack.add_child(actions)
	var save := _button("SAVE VALID BLUEPRINT", 17, true)
	save.pressed.connect(_save_garage_blueprint)
	actions.add_child(save)
	var load := _button("LOAD SAVED", 17)
	load.pressed.connect(_load_garage_blueprint)
	actions.add_child(load)
	var test := _button("TEST IN ARENA", 17)
	test.pressed.connect(_test_garage_blueprint)
	actions.add_child(test)
	var back := _button("BACK", 17)
	back.pressed.connect(_show_menu)
	actions.add_child(back)
	stack.add_child(_label("Blueprints contain approved part data only. Player scripts, hidden collision, client-declared weight, damage, score, and results are rejected.", 14, Color("#7f8e94")))
	_update_garage_validation()

func _build_result(overlay: Control) -> void:
	var center := CenterContainer.new()
	center.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	overlay.add_child(center)
	var panel := PanelContainer.new()
	panel.custom_minimum_size = Vector2(590, 360)
	panel.add_theme_stylebox_override("panel", _panel_style(Color("#111a20"), Color("#c29d48"), 24))
	center.add_child(panel)
	var margin := MarginContainer.new()
	_set_margins(margin, 38)
	panel.add_child(margin)
	var stack := VBoxContainer.new()
	stack.alignment = BoxContainer.ALIGNMENT_CENTER
	stack.add_theme_constant_override("separation", 18)
	margin.add_child(stack)
	result_title = _label("MATCH COMPLETE", 38, Color("#f0d17b"))
	result_title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	stack.add_child(result_title)
	result_copy = _label("", 20, Color("#d1d8d8"))
	result_copy.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	result_copy.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	stack.add_child(result_copy)
	var actions := HBoxContainer.new()
	actions.alignment = BoxContainer.ALIGNMENT_CENTER
	actions.add_theme_constant_override("separation", 12)
	stack.add_child(actions)
	var again := _button("REBUILD MATCH", 18, true)
	again.pressed.connect(_start_match)
	actions.add_child(again)
	var garage := _button("GARAGE", 18)
	garage.pressed.connect(_open_garage)
	actions.add_child(garage)
	var menu := _button("MACHINE SELECT", 18)
	menu.pressed.connect(_show_menu)
	actions.add_child(menu)

func _build_hud() -> Control:
	var margin := MarginContainer.new()
	margin.set_anchors_preset(Control.PRESET_TOP_WIDE)
	margin.offset_left = 20
	margin.offset_top = 18
	margin.offset_right = -20
	margin.offset_bottom = 150
	var panel := PanelContainer.new()
	panel.add_theme_stylebox_override("panel", _panel_style(Color(0.035, 0.06, 0.075, 0.9), Color("#46545b"), 14))
	margin.add_child(panel)
	var inside := MarginContainer.new()
	_set_margins(inside, 15)
	panel.add_child(inside)
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 34)
	inside.add_child(row)
	hud_title = _label("BAY 13", 21, Color("#efce73"))
	hud_title.custom_minimum_size.x = 300
	row.add_child(hud_title)
	hud_player_health = _label("PLAYER 100", 19, Color("#77d1b4"))
	row.add_child(hud_player_health)
	hud_clock = _label("03:00", 32, Color.WHITE)
	hud_clock.custom_minimum_size.x = 120
	hud_clock.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	row.add_child(hud_clock)
	hud_training_health = _label("TRAINING 100", 19, Color("#e89766"))
	row.add_child(hud_training_health)
	hud_status = _label("SERVER MATCH", 16, Color("#90a1a8"))
	hud_status.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	hud_status.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	row.add_child(hud_status)
	return margin

func _build_mobile_controls() -> Control:
	var root := Control.new()
	root.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	root.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var drive := GridContainer.new()
	drive.columns = 3
	drive.set_anchors_preset(Control.PRESET_BOTTOM_LEFT)
	drive.offset_left = 24
	drive.offset_top = -200
	drive.offset_right = 258
	drive.offset_bottom = -76
	drive.mouse_filter = Control.MOUSE_FILTER_STOP
	root.add_child(drive)
	_drive_button(drive, "", 0, 0)
	_drive_button(drive, "▲", 1, 0)
	_drive_button(drive, "", 0, 0)
	_drive_button(drive, "◀", 0, 1)
	_drive_button(drive, "▼", -1, 0)
	_drive_button(drive, "▶", 0, -1)
	var weapon := _button("WEAPON", 18, true)
	weapon.set_anchors_preset(Control.PRESET_BOTTOM_RIGHT)
	weapon.offset_left = -230
	weapon.offset_top = -145
	weapon.offset_right = -40
	weapon.offset_bottom = -53
	weapon.custom_minimum_size = Vector2(190, 92)
	weapon.mouse_filter = Control.MOUSE_FILTER_STOP
	weapon.button_down.connect(_set_virtual_weapon.bind(true))
	weapon.button_up.connect(_set_virtual_weapon.bind(false))
	root.add_child(weapon)
	return root

func _drive_button(parent: GridContainer, text: String, throttle: float, steer: float) -> void:
	var button := _button(text, 24)
	button.custom_minimum_size = Vector2(78, 62)
	button.disabled = text.is_empty()
	button.button_down.connect(_set_virtual_drive.bind(throttle, steer))
	button.button_up.connect(_set_virtual_drive.bind(0.0, 0.0))
	parent.add_child(button)

func _select_machine(key: String) -> void:
	selected_machine = key
	selected_rebuild = BlueprintServiceScript.server_rebuild(BlueprintServiceScript.default_blueprint(key))
	var copy: Dictionary = MACHINE_COPY[key]
	machine_summary.text = "%s selected — %s" % [copy.title, copy.line]

func _start_match() -> void:
	if not selected_rebuild.get("accepted", false):
		selected_rebuild = BlueprintServiceScript.server_rebuild(BlueprintServiceScript.default_blueprint(selected_machine))
	if not selected_rebuild.get("accepted", false):
		garage_validation.text = "The server rejected this build. Correct the garage findings first."
		_open_garage()
		return
	selected_machine = _machine_from_blueprint(selected_rebuild.blueprint)
	var paint := _paint_color(str(selected_rebuild.blueprint.get("paint", "yard-yellow")))
	menu_overlay.visible = false
	garage_overlay.visible = false
	result_overlay.visible = false
	hud.visible = true
	mobile_controls.visible = true
	virtual_throttle = 0.0
	virtual_steer = 0.0
	virtual_weapon = false
	match_controller.begin_match(selected_machine, paint, arena.spawn_player, arena.spawn_training, selected_rebuild)

func _open_garage() -> void:
	if is_instance_valid(match_controller):
		match_controller.stop_match()
	menu_overlay.visible = false
	result_overlay.visible = false
	hud.visible = false
	mobile_controls.visible = false
	garage_overlay.visible = true
	_update_garage_validation()

func _show_menu() -> void:
	if is_instance_valid(match_controller):
		match_controller.stop_match()
	garage_overlay.visible = false
	result_overlay.visible = false
	hud.visible = false
	mobile_controls.visible = false
	menu_overlay.visible = true
	camera.position = arena.camera_anchor
	camera.look_at(Vector3(0.0, 0.4, 0.0), Vector3.UP)

func _garage_blueprint() -> Dictionary:
	var chassis := "chassis_compact" if garage_chassis.selected == 0 else "chassis_armored"
	var front_ids := ["front_wedge", "front_forks", "front_plow"]
	var weapon_ids := ["weapon_ram", "weapon_spinner", "weapon_hammer"]
	var paints := ["yard-yellow", "cutter-teal", "forge-orange", "cold-steel"]
	var names := ["Garage Rammer", "Garage Keelcutter", "Garage Pilebreaker"]
	var blueprint := BlueprintServiceScript.build_blueprint({
		"name": names[garage_weapon.selected],
		"chassis": chassis,
		"battery": "battery_competition",
		"front": front_ids[garage_front.selected],
		"weapon": weapon_ids[garage_weapon.selected],
		"paint": paints[garage_paint.selected],
	})
	if garage_wheels.selected == 1:
		var kept: Array = []
		for part in blueprint.parts:
			if str(part.instance_id) not in ["wheel-rl", "wheel-rr"]:
				kept.append(part)
		blueprint.parts = kept
	return blueprint

func _update_garage_validation(_index := 0) -> void:
	if not is_instance_valid(garage_totals):
		return
	var validation := BlueprintServiceScript.validate_blueprint(_garage_blueprint())
	garage_totals.text = "%0.1f / 120.0 kg    ·    Power %0.1f / %0.1f    ·    %d / 64 parts" % [validation.mass_kg, validation.power_draw, validation.power_supply, validation.part_count]
	if validation.valid:
		garage_validation.modulate = Color("#76d0b1")
		garage_validation.text = "VALID — Server rebuild ready. Mass, power, connections, size, and part limits pass."
	else:
		garage_validation.modulate = Color("#e68d76")
		garage_validation.text = "REJECTED — %s" % " ".join(validation.reasons)

func _save_garage_blueprint() -> void:
	var result := BlueprintServiceScript.save_blueprint(_garage_blueprint())
	if result.get("accepted", false):
		selected_rebuild = result
		garage_validation.modulate = Color("#76d0b1")
		garage_validation.text = "SAVED — Blueprint %s is stored on this device." % str(result.blueprint_hash).left(12)
	else:
		garage_validation.modulate = Color("#e68d76")
		garage_validation.text = "REJECTED — %s" % _result_error(result)

func _load_garage_blueprint() -> void:
	var result := BlueprintServiceScript.load_blueprint()
	if result.get("accepted", false):
		selected_rebuild = result
		selected_machine = _machine_from_blueprint(result.blueprint)
		garage_validation.modulate = Color("#76d0b1")
		garage_validation.text = "LOADED — Exact server blueprint %s is ready for the arena." % str(result.blueprint_hash).left(12)
	else:
		garage_validation.modulate = Color("#e68d76")
		garage_validation.text = "LOAD FAILED — %s" % _result_error(result)

func _test_garage_blueprint() -> void:
	var result := BlueprintServiceScript.server_rebuild(_garage_blueprint())
	if not result.get("accepted", false):
		garage_validation.modulate = Color("#e68d76")
		garage_validation.text = "REJECTED — %s" % _result_error(result)
		return
	selected_rebuild = result
	_start_match()

func _on_match_started(player_machine: String, training_machine: String) -> void:
	hud_title.text = "%s  VS  %s" % [player_machine.to_upper(), training_machine.to_upper()]
	hud_status.text = "LOCAL SERVER · BLUEPRINT %s" % str(selected_rebuild.get("blueprint_hash", "STARTER")).left(10)

func _on_hud_changed(snapshot: Dictionary) -> void:
	if not snapshot.has("player") or snapshot.player.is_empty():
		return
	var minutes := int(snapshot.clock_seconds) / 60
	var seconds := int(snapshot.clock_seconds) % 60
	hud_clock.text = "%02d:%02d" % [minutes, seconds]
	hud_player_health.text = "PLAYER  %03d" % int(ceil(float(snapshot.player.health)))
	hud_training_health.text = "TRAINING  %03d" % int(ceil(float(snapshot.training.health)))

func _on_match_finished(result: Dictionary) -> void:
	hud.visible = false
	mobile_controls.visible = false
	result_overlay.visible = true
	result_title.text = "%s" % str(result.winner).to_upper()
	result_copy.text = "%s · Player %0.1f integrity · Training %0.1f integrity · %0.1f seconds" % [str(result.reason).replace("_", " "), result.player_health, result.training_health, result.elapsed_seconds]

func _set_virtual_drive(throttle: float, steer: float) -> void:
	virtual_throttle = throttle
	virtual_steer = steer

func _set_virtual_weapon(active: bool) -> void:
	virtual_weapon = active

func _machine_from_blueprint(rebuilt: Dictionary) -> String:
	for part in rebuilt.parts:
		match str(part.catalog_id):
			"weapon_spinner": return "RIPPER"
			"weapon_hammer": return "MAUL"
	return "RAMMER"

func _paint_color(key: String) -> Color:
	match key:
		"cutter-teal": return Color("#3e918a")
		"forge-orange": return Color("#b75f35")
		"cold-steel": return Color("#65737a")
		_: return Color("#caa03f")

func _result_error(result: Dictionary) -> String:
	if result.has("validation") and result.validation.has("reasons"):
		return " ".join(result.validation.reasons)
	return str(result.get("error", "Unknown blueprint error."))

func _option_row(form: GridContainer, label_text: String, options: Array) -> OptionButton:
	form.add_child(_label(label_text, 18, Color("#b9c5c8")))
	var option := OptionButton.new()
	option.custom_minimum_size = Vector2(380, 46)
	for entry in options:
		option.add_item(str(entry))
	form.add_child(option)
	return option

func _full_overlay(color: Color) -> ColorRect:
	var overlay := ColorRect.new()
	overlay.color = color
	overlay.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	return overlay

func _label(text: String, size: int, color: Color) -> Label:
	var label := Label.new()
	label.text = text
	label.add_theme_font_size_override("font_size", size)
	label.add_theme_color_override("font_color", color)
	return label

func _button(text: String, size: int, primary := false) -> Button:
	var button := Button.new()
	button.text = text
	button.add_theme_font_size_override("font_size", size)
	button.add_theme_stylebox_override("normal", _panel_style(Color("#1c2830") if not primary else Color("#c8a044"), Color("#59676f") if not primary else Color("#f2d888"), 10))
	button.add_theme_stylebox_override("hover", _panel_style(Color("#293740") if not primary else Color("#e0bb5d"), Color("#d2b568"), 10))
	button.add_theme_stylebox_override("pressed", _panel_style(Color("#0d151a") if not primary else Color("#a47d2f"), Color("#e0bd64"), 10))
	button.add_theme_color_override("font_color", Color("#eff2ee") if not primary else Color("#17130b"))
	return button

func _panel_style(background: Color, border: Color, radius: int) -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = background
	style.border_color = border
	style.set_border_width_all(1)
	style.corner_radius_top_left = radius
	style.corner_radius_top_right = radius
	style.corner_radius_bottom_left = radius
	style.corner_radius_bottom_right = radius
	style.content_margin_left = 12
	style.content_margin_right = 12
	style.content_margin_top = 10
	style.content_margin_bottom = 10
	return style

func _set_margins(margin: MarginContainer, amount: int) -> void:
	margin.add_theme_constant_override("margin_left", amount)
	margin.add_theme_constant_override("margin_right", amount)
	margin.add_theme_constant_override("margin_top", amount)
	margin.add_theme_constant_override("margin_bottom", amount)

func _game_theme() -> Theme:
	var theme := Theme.new()
	theme.set_color("font_color", "Label", Color("#e7ecea"))
	theme.set_color("font_color", "Button", Color("#e7ecea"))
	theme.set_color("font_color", "OptionButton", Color("#e7ecea"))
	theme.set_font_size("font_size", "Label", 18)
	theme.set_font_size("font_size", "Button", 18)
	return theme

func _start_network_smoke(args: PackedStringArray) -> void:
	var port := 9247
	for arg in args:
		if arg.begins_with("--port="):
			port = int(arg.trim_prefix("--port="))
	var bridge: Bay13NetworkBridge = NetworkBridgeScript.new()
	bridge.smoke_completed.connect(_network_smoke_completed)
	bridge.smoke_failed.connect(_network_smoke_failed)
	add_child(bridge)
	var error := OK
	if "--network-server" in args:
		error = bridge.start_server(port)
	else:
		error = bridge.start_client("ws://127.0.0.1:%d" % port)
	if error != OK:
		_network_smoke_failed(bridge.role, "WebSocket setup returned error %d." % error)

func _network_smoke_completed(role: String) -> void:
	print("NETWORK_%s_HANDSHAKE_COMPLETE" % role.to_upper())
	get_tree().quit(0)

func _network_smoke_failed(role: String, message: String) -> void:
	printerr("NETWORK_%s_FAILED:%s" % [role.to_upper(), message])
	get_tree().quit(2)
