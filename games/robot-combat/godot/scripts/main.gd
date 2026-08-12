extends Node3D

const ArenaBuilderScript := preload("res://scripts/arena_builder.gd")
const BlueprintServiceScript := preload("res://scripts/blueprint_service.gd")
const MatchControllerScript := preload("res://scripts/match_controller.gd")
const NetworkBridgeScript := preload("res://scripts/network_bridge.gd")
const RemoteMatchBridgeScript := preload("res://scripts/remote_match_bridge.gd")
const RobotAssemblyScript := preload("res://scripts/robot_assembly.gd")
const RobotSchematicScript := preload("res://scripts/robot_schematic.gd")

const ACCENT := Color("e6bb57")
const ACCENT_BRIGHT := Color("ffe19a")
const INK := Color("091015")
const PANEL := Color("111c23f2")
const PANEL_SOFT := Color("1a2931e8")
const STEEL := Color("a8b5b9")
const STEEL_BRIGHT := Color("edf1ec")
const MUTED := Color("72848b")
const DANGER := Color("e68d76")
const SUCCESS := Color("76d0b1")

const OPTION_IDS := {
	"chassis": ["chassis_compact", "chassis_armored"],
	"wheels": ["drive_4", "grip_4", "drive_2"],
	"front": ["front_wedge", "front_forks", "front_plow"],
	"weapon": ["weapon_ram", "weapon_spinner", "weapon_hammer"],
	"battery": ["battery_compact", "battery_competition"],
	"paint": ["yard-yellow", "cutter-teal", "forge-orange", "cold-steel"],
}

const OPTION_LABELS := {
	"chassis": ["Compact frame", "Armored frame"],
	"wheels": ["Drive wheels · 4", "Wide-grip wheels · 4", "Drive wheels · 2"],
	"front": ["Low wedge", "Twin forks", "Heavy plow"],
	"weapon": ["Ram drive", "Vertical spinner", "Overhead hammer"],
	"battery": ["Compact battery", "Competition battery"],
	"paint": ["Yard yellow", "Cutter teal", "Forge orange", "Cold steel"],
}

enum Phase { WORKSHOP, TEST_BAY, ARENA, REPORT }

var phase := Phase.WORKSHOP
var arena: Dictionary
var match_controller: MatchController
var camera: Camera3D
var preview_assembly: RobotAssembly
var selected_machine := "RAMMER"
var draft_blueprint: Dictionary = {}
var last_valid_rebuild: Dictionary = {}
var revisions: Array[Dictionary] = []
var revision_counter := 0
var front_mount_offset := 0.0
var weapon_mount_offset := 0.0
var virtual_throttle := 0.0
var virtual_steer := 0.0
var virtual_weapon := false
var remote_runtime_mode := false
var remote_runtime_started := false
var remote_slot := "A"
var remote_bridge: RobotCombatRemoteMatchBridge
var remote_blueprint_hash_a := ""
var remote_blueprint_hash_b := ""

var ui_root: Control
var workshop_panel: PanelContainer
var inspection_panel: PanelContainer
var revisions_panel: PanelContainer
var combat_hud: Control
var report_overlay: Control
var part_buttons: Dictionary = {}
var machine_name_edit: LineEdit
var mount_front_label: Label
var mount_weapon_label: Label
var workshop_status: Label
var inspection_metrics: Label
var inspection_validation: Label
var inspection_force_path: Label
var inspection_schematic: RobotSchematic
var revision_list: ItemList
var revision_status: Label
var save_revision_button: Button
var test_bay_button: Button
var enter_arena_button: Button
var combat_mode_label: Label
var combat_title_label: Label
var combat_clock_label: Label
var combat_player_label: Label
var combat_opponent_label: Label
var combat_event_label: Label
var report_title_label: Label
var report_detail_label: Label
var report_damage_label: Label
var report_question_label: Label

func _ready() -> void:
	var args := OS.get_cmdline_user_args()
	if "--network-server" in args or "--network-client" in args:
		_start_network_smoke(args)
		return
	arena = ArenaBuilderScript.build(self)
	match_controller = MatchControllerScript.new()
	match_controller.name = "LocalRobotCombatAuthority"
	match_controller.match_started.connect(_on_match_started)
	match_controller.hud_changed.connect(_on_hud_changed)
	match_controller.match_finished.connect(_on_match_finished)
	add_child(match_controller)
	_build_camera()
	_build_interface()
	var remote_match_id := RemoteMatchBridgeScript.browser_query_value("matchId")
	if not remote_match_id.is_empty():
		_start_remote_runtime(remote_match_id, RemoteMatchBridgeScript.browser_query_value("slot"))
	else:
		_load_starter("RAMMER", true)
		_show_workshop()
		if "--demo-arena" in args:
			call_deferred("_start_arena")

func _process(delta: float) -> void:
	if phase == Phase.TEST_BAY or phase == Phase.ARENA:
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
			if phase == Phase.TEST_BAY or phase == Phase.ARENA:
				_start_session(phase == Phase.TEST_BAY)
		KEY_G:
			_show_workshop()
		KEY_ESCAPE:
			if phase != Phase.WORKSHOP:
				_show_workshop()

func _build_camera() -> void:
	camera = Camera3D.new()
	camera.name = "RobotCombatCamera"
	camera.fov = 67.0
	camera.near = 0.08
	camera.far = 180.0
	camera.position = arena.camera_anchor
	camera.current = true
	add_child(camera)
	camera.look_at(Vector3(0.0, 0.4, 0.0), Vector3.UP)

func _build_interface() -> void:
	var layer := CanvasLayer.new()
	layer.name = "RobotCombatInterface"
	layer.layer = 20
	add_child(layer)
	ui_root = Control.new()
	ui_root.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	ui_root.theme = _game_theme()
	layer.add_child(ui_root)

	var backdrop := ColorRect.new()
	backdrop.color = Color(0.015, 0.025, 0.033, 0.55)
	backdrop.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	backdrop.mouse_filter = Control.MOUSE_FILTER_IGNORE
	ui_root.add_child(backdrop)
	_build_header()
	_build_workshop()
	_build_combat_hud()
	_build_report()

func _build_header() -> void:
	var header := PanelContainer.new()
	header.position = Vector2(0, 0)
	header.size = Vector2(1440, 76)
	header.add_theme_stylebox_override("panel", _panel_style(Color("081016e8"), Color("2f4149"), 0))
	ui_root.add_child(header)
	var margin := MarginContainer.new()
	_set_margins(margin, 18, 34)
	header.add_child(margin)
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 13)
	margin.add_child(row)
	row.add_child(_label("SKILL GAMING WORLD", 13, MUTED))
	row.add_child(_label("/", 14, Color("4b5d65")))
	row.add_child(_label("ROBOT COMBAT", 17, STEEL_BRIGHT))
	var spacer := Control.new()
	spacer.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	row.add_child(spacer)
	row.add_child(_label("BUILD · TEST · FIGHT · LEARN · REBUILD", 12, ACCENT_BRIGHT))
	row.add_child(_label("FREE PROTOTYPE  /  NO VALUE", 11, SUCCESS))

func _build_workshop() -> void:
	workshop_panel = PanelContainer.new()
	workshop_panel.position = Vector2(32, 100)
	workshop_panel.size = Vector2(520, 666)
	workshop_panel.add_theme_stylebox_override("panel", _panel_style(PANEL, Color("425660"), 14))
	ui_root.add_child(workshop_panel)
	var margin := MarginContainer.new()
	_set_margins(margin, 24, 26)
	workshop_panel.add_child(margin)
	var stack := VBoxContainer.new()
	stack.add_theme_constant_override("separation", 5)
	margin.add_child(stack)
	stack.add_child(_label("WORKSHOP // BUILD YOUR MACHINE", 12, ACCENT))
	stack.add_child(_label("The machine is the player.", 28, STEEL_BRIGHT))
	var copy := _label("Choose parts, move the mounts, and watch the inspection change. A starter is a teaching fixture you can dismantle.", 13, STEEL, true)
	copy.custom_minimum_size.y = 38
	stack.add_child(copy)

	var starter_label := _label("START WITH A TEACHING FIXTURE", 10, MUTED)
	stack.add_child(starter_label)
	var starter_row := HBoxContainer.new()
	starter_row.add_theme_constant_override("separation", 6)
	stack.add_child(starter_row)
	for fixture in [
		["RAMMER", "DRIVE / PUSH"], ["RIPPER", "CONTROL / FACE"], ["MAUL", "TIMING / RECOVER"],
	]:
		var button := _button("%s\n%s" % [fixture[0], fixture[1]], 11, false)
		button.custom_minimum_size = Vector2(148, 48)
		button.pressed.connect(_load_starter.bind(str(fixture[0]), false))
		starter_row.add_child(button)

	var name_row := HBoxContainer.new()
	name_row.add_theme_constant_override("separation", 10)
	stack.add_child(name_row)
	name_row.add_child(_label("MACHINE NAME", 11, MUTED))
	machine_name_edit = LineEdit.new()
	machine_name_edit.placeholder_text = "Untitled machine"
	machine_name_edit.text = "Yard Mule starter"
	machine_name_edit.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	machine_name_edit.custom_minimum_size.y = 34
	machine_name_edit.text_changed.connect(_on_machine_name_changed)
	name_row.add_child(machine_name_edit)

	stack.add_child(_label("STRUCTURE + FUNCTION", 10, MUTED))
	_add_part_row(stack, "chassis", "CHASSIS")
	_add_part_row(stack, "wheels", "WHEELS")
	_add_part_row(stack, "front", "FRONT ASSEMBLY")
	_add_part_row(stack, "weapon", "WEAPON")
	_add_part_row(stack, "battery", "BATTERY")
	_add_part_row(stack, "paint", "PAINT")

	stack.add_child(_label("REPOSITION THE FORCE PATH", 10, MUTED))
	var front_row := HBoxContainer.new()
	front_row.add_theme_constant_override("separation", 5)
	stack.add_child(front_row)
	front_row.add_child(_label("FRONT MOUNT", 11, STEEL))
	var front_minus := _button("−", 14, false)
	front_minus.custom_minimum_size = Vector2(34, 30)
	front_minus.pressed.connect(_nudge_mount.bind("front", -0.12))
	front_row.add_child(front_minus)
	mount_front_label = _label("0.00 m", 11, ACCENT_BRIGHT)
	mount_front_label.custom_minimum_size = Vector2(72, 30)
	mount_front_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	front_row.add_child(mount_front_label)
	var front_plus := _button("+", 14, false)
	front_plus.custom_minimum_size = Vector2(34, 30)
	front_plus.pressed.connect(_nudge_mount.bind("front", 0.12))
	front_row.add_child(front_plus)
	front_row.add_child(_label("forward / back changes bite and balance", 10, MUTED))

	var weapon_row := HBoxContainer.new()
	weapon_row.add_theme_constant_override("separation", 5)
	stack.add_child(weapon_row)
	weapon_row.add_child(_label("WEAPON MOUNT", 11, STEEL))
	var weapon_minus := _button("−", 14, false)
	weapon_minus.custom_minimum_size = Vector2(34, 30)
	weapon_minus.pressed.connect(_nudge_mount.bind("weapon", -0.12))
	weapon_row.add_child(weapon_minus)
	mount_weapon_label = _label("0.00 m", 11, ACCENT_BRIGHT)
	mount_weapon_label.custom_minimum_size = Vector2(72, 30)
	mount_weapon_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	weapon_row.add_child(mount_weapon_label)
	var weapon_plus := _button("+", 14, false)
	weapon_plus.custom_minimum_size = Vector2(34, 30)
	weapon_plus.pressed.connect(_nudge_mount.bind("weapon", 0.12))
	weapon_row.add_child(weapon_plus)
	weapon_row.add_child(_label("recoil and reach follow the mount", 10, MUTED))

	workshop_status = _label("", 12, SUCCESS, true)
	workshop_status.custom_minimum_size.y = 34
	stack.add_child(workshop_status)
	var action_row := HBoxContainer.new()
	action_row.add_theme_constant_override("separation", 7)
	stack.add_child(action_row)
	save_revision_button = _button("SAVE REVISION", 12, true)
	save_revision_button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	save_revision_button.pressed.connect(_save_revision)
	action_row.add_child(save_revision_button)
	test_bay_button = _button("PRIVATE TEST BAY", 12, false)
	test_bay_button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	test_bay_button.pressed.connect(_start_test_bay)
	action_row.add_child(test_bay_button)
	var load_button := _button("LAST VALID", 12, false)
	load_button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	load_button.pressed.connect(_load_last_valid)
	action_row.add_child(load_button)

	var rule_copy := _label("A failed draft stays visible. It cannot replace the last valid revision or enter the arena.", 10, MUTED, true)
	rule_copy.custom_minimum_size.y = 26
	stack.add_child(rule_copy)

	_build_inspection_panel()
	_build_revisions_panel()

func _build_inspection_panel() -> void:
	inspection_panel = PanelContainer.new()
	inspection_panel.position = Vector2(574, 100)
	inspection_panel.size = Vector2(500, 666)
	inspection_panel.add_theme_stylebox_override("panel", _panel_style(PANEL, Color("425660"), 14))
	ui_root.add_child(inspection_panel)
	var margin := MarginContainer.new()
	_set_margins(margin, 24, 26)
	inspection_panel.add_child(margin)
	var stack := VBoxContainer.new()
	stack.add_theme_constant_override("separation", 11)
	margin.add_child(stack)
	stack.add_child(_label("INSPECTION // CONSEQUENCES", 12, ACCENT))
	stack.add_child(_label("What this build will do", 26, STEEL_BRIGHT))
	var preview_copy := _label("The machine on the center pad is assembled from the same blueprint that will enter the arena.", 13, STEEL, true)
	preview_copy.custom_minimum_size.y = 38
	stack.add_child(preview_copy)
	inspection_schematic = RobotSchematicScript.new()
	inspection_schematic.custom_minimum_size.y = 92
	inspection_schematic.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	stack.add_child(inspection_schematic)
	inspection_metrics = _label("", 14, STEEL_BRIGHT, true)
	inspection_metrics.custom_minimum_size.y = 150
	inspection_metrics.add_theme_stylebox_override("normal", _panel_style(PANEL_SOFT, Color("334852"), 8))
	stack.add_child(inspection_metrics)
	stack.add_child(_label("FORCE PATH", 10, MUTED))
	inspection_force_path = _label("", 13, ACCENT_BRIGHT, true)
	inspection_force_path.custom_minimum_size.y = 40
	stack.add_child(inspection_force_path)
	stack.add_child(_label("READINESS", 10, MUTED))
	inspection_validation = _label("", 13, SUCCESS, true)
	inspection_validation.custom_minimum_size.y = 86
	stack.add_child(inspection_validation)
	var arena_action := _button("ENTER ARENA WITH SAVED REVISION", 13, true)
	arena_action.custom_minimum_size.y = 44
	arena_action.pressed.connect(_start_arena)
	enter_arena_button = arena_action
	stack.add_child(arena_action)

func _build_revisions_panel() -> void:
	revisions_panel = PanelContainer.new()
	revisions_panel.position = Vector2(1096, 100)
	revisions_panel.size = Vector2(312, 666)
	revisions_panel.add_theme_stylebox_override("panel", _panel_style(PANEL, Color("425660"), 14))
	ui_root.add_child(revisions_panel)
	var margin := MarginContainer.new()
	_set_margins(margin, 20, 22)
	revisions_panel.add_child(margin)
	var stack := VBoxContainer.new()
	stack.add_theme_constant_override("separation", 10)
	margin.add_child(stack)
	stack.add_child(_label("REVISION HISTORY", 12, ACCENT))
	stack.add_child(_label("Keep the experiment.\nKeep the machine.", 18, STEEL_BRIGHT))
	var copy := _label("Load an earlier valid design after a bad idea, a bad match, or a better question.", 12, STEEL, true)
	copy.custom_minimum_size.y = 46
	stack.add_child(copy)
	revision_list = ItemList.new()
	revision_list.custom_minimum_size = Vector2(0, 300)
	revision_list.size_flags_vertical = Control.SIZE_EXPAND_FILL
	revision_list.add_theme_font_size_override("font_size", 12)
	stack.add_child(revision_list)
	var load_selected := _button("LOAD SELECTED REVISION", 12, false)
	load_selected.pressed.connect(_load_selected_revision)
	stack.add_child(load_selected)
	revision_status = _label("", 11, MUTED, true)
	revision_status.custom_minimum_size.y = 66
	stack.add_child(revision_status)
	var scope := _label("LOCAL PROTOTYPE\nNo wager · no prize · no bought performance\nOnline match authority is a later boundary.", 11, SUCCESS, true)
	stack.add_child(scope)

func _build_combat_hud() -> void:
	combat_hud = Control.new()
	combat_hud.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	combat_hud.mouse_filter = Control.MOUSE_FILTER_IGNORE
	combat_hud.visible = false
	ui_root.add_child(combat_hud)

	var status_panel := PanelContainer.new()
	status_panel.position = Vector2(28, 98)
	status_panel.size = Vector2(430, 170)
	status_panel.add_theme_stylebox_override("panel", _panel_style(PANEL, Color("425660"), 12))
	combat_hud.add_child(status_panel)
	var margin := MarginContainer.new()
	_set_margins(margin, 18, 20)
	status_panel.add_child(margin)
	var stack := VBoxContainer.new()
	stack.add_theme_constant_override("separation", 6)
	margin.add_child(stack)
	combat_mode_label = _label("PRIVATE TEST BAY", 11, ACCENT)
	stack.add_child(combat_mode_label)
	combat_title_label = _label("MACHINE  VS  TRAINING MACHINE", 19, STEEL_BRIGHT)
	stack.add_child(combat_title_label)
	combat_player_label = _label("YOU   100", 14, SUCCESS)
	stack.add_child(combat_player_label)
	combat_opponent_label = _label("OPPONENT   100", 14, DANGER)
	stack.add_child(combat_opponent_label)

	var clock_panel := PanelContainer.new()
	clock_panel.position = Vector2(1190, 98)
	clock_panel.size = Vector2(218, 108)
	clock_panel.add_theme_stylebox_override("panel", _panel_style(PANEL, Color("425660"), 12))
	combat_hud.add_child(clock_panel)
	var clock_margin := MarginContainer.new()
	_set_margins(clock_margin, 16, 18)
	clock_panel.add_child(clock_margin)
	var clock_stack := VBoxContainer.new()
	clock_margin.add_child(clock_stack)
	clock_stack.add_child(_label("SESSION CLOCK", 10, MUTED))
	combat_clock_label = _label("03:00", 30, ACCENT_BRIGHT)
	clock_stack.add_child(combat_clock_label)

	var event_panel := PanelContainer.new()
	event_panel.position = Vector2(28, 704)
	event_panel.size = Vector2(920, 64)
	event_panel.add_theme_stylebox_override("panel", _panel_style(Color("081016e8"), Color("425660"), 8))
	combat_hud.add_child(event_panel)
	var event_margin := MarginContainer.new()
	_set_margins(event_margin, 14, 18)
	event_panel.add_child(event_margin)
	combat_event_label = _label("WASD / ARROWS DRIVE  ·  SPACE WEAPON  ·  R RESET", 12, STEEL_BRIGHT, true)
	event_margin.add_child(combat_event_label)

	var reset := _button("RESET SESSION", 12, false)
	reset.position = Vector2(966, 716)
	reset.size = Vector2(188, 44)
	reset.mouse_filter = Control.MOUSE_FILTER_STOP
	reset.pressed.connect(_reset_session)
	combat_hud.add_child(reset)
	var workshop := _button("RETURN TO WORKSHOP", 12, true)
	workshop.position = Vector2(1166, 716)
	workshop.size = Vector2(242, 44)
	workshop.mouse_filter = Control.MOUSE_FILTER_STOP
	workshop.pressed.connect(_show_workshop)
	combat_hud.add_child(workshop)

func _build_report() -> void:
	report_overlay = Control.new()
	report_overlay.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	report_overlay.visible = false
	ui_root.add_child(report_overlay)
	var dim := ColorRect.new()
	dim.color = Color("071016e8")
	dim.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	report_overlay.add_child(dim)
	var panel := PanelContainer.new()
	panel.position = Vector2(390, 132)
	panel.size = Vector2(660, 550)
	panel.add_theme_stylebox_override("panel", _panel_style(Color("101b22f5"), ACCENT, 14))
	report_overlay.add_child(panel)
	var margin := MarginContainer.new()
	_set_margins(margin, 30, 34)
	panel.add_child(margin)
	var stack := VBoxContainer.new()
	stack.add_theme_constant_override("separation", 10)
	margin.add_child(stack)
	stack.add_child(_label("POST-MATCH REPORT // LEARN SOMETHING", 12, ACCENT))
	report_title_label = _label("SESSION COMPLETE", 32, STEEL_BRIGHT)
	stack.add_child(report_title_label)
	report_detail_label = _label("", 14, STEEL, true)
	report_detail_label.custom_minimum_size.y = 48
	stack.add_child(report_detail_label)
	report_damage_label = _label("", 12, DANGER, true)
	report_damage_label.custom_minimum_size.y = 88
	stack.add_child(report_damage_label)
	stack.add_child(_label("REBUILD QUESTIONS", 10, MUTED))
	report_question_label = _label("", 13, ACCENT_BRIGHT, true)
	report_question_label.custom_minimum_size.y = 90
	stack.add_child(report_question_label)
	var actions := HBoxContainer.new()
	actions.add_theme_constant_override("separation", 8)
	stack.add_child(actions)
	var rebuild := _button("REBUILD LAST VALID", 12, true)
	rebuild.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	rebuild.pressed.connect(_load_last_valid_from_report)
	actions.add_child(rebuild)
	var test := _button("TEST AGAIN", 12, false)
	test.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	test.pressed.connect(_test_again_from_report)
	actions.add_child(test)
	var workshop := _button("WORKSHOP", 12, false)
	workshop.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	workshop.pressed.connect(_show_workshop)
	actions.add_child(workshop)

func _add_part_row(parent: VBoxContainer, id: String, caption: String) -> void:
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 10)
	parent.add_child(row)
	var label := _label(caption, 11, STEEL)
	label.custom_minimum_size = Vector2(132, 32)
	row.add_child(label)
	var option := OptionButton.new()
	option.custom_minimum_size = Vector2(310, 32)
	for entry in OPTION_LABELS[id]:
		option.add_item(str(entry))
	option.item_selected.connect(_on_part_selected.bind(id))
	row.add_child(option)
	part_buttons[id] = option

func _load_starter(machine: String, reset_history: bool) -> void:
	selected_machine = machine.to_upper()
	var starter := BlueprintServiceScript.default_blueprint(selected_machine)
	draft_blueprint = starter.duplicate(true)
	_set_controls_from_blueprint(draft_blueprint)
	var rebuilt := BlueprintServiceScript.server_rebuild(draft_blueprint)
	if rebuilt.get("accepted", false):
		last_valid_rebuild = rebuilt
		if reset_history:
			revisions.clear()
			revision_counter = 0
		_record_revision(rebuilt, "Starter fixture: %s" % selected_machine)
	_refresh_workshop("Starter loaded. Change one part and inspect what moves.")

func _select_machine(key: String) -> void:
	# Compatibility entry point for the old harness; the user-facing path is
	# now the workshop starter row.
	_load_starter(key, false)

func _set_controls_from_blueprint(blueprint: Dictionary) -> void:
	var chosen := {
		"chassis": 0, "wheels": 0, "front": 0, "weapon": 0, "battery": 1, "paint": 0,
	}
	front_mount_offset = 0.0
	weapon_mount_offset = 0.0
	for value in blueprint.get("parts", []):
		if not value is Dictionary:
			continue
		var part: Dictionary = value
		var catalog_id := str(part.get("catalog_id", ""))
		if catalog_id in OPTION_IDS["chassis"]:
			chosen["chassis"] = OPTION_IDS["chassis"].find(catalog_id)
		elif catalog_id in ["wheel_drive", "wheel_grip"]:
			var wheel_count := 0
			for wheel_value in blueprint.get("parts", []):
				if wheel_value is Dictionary and str(wheel_value.get("catalog_id", "")) in ["wheel_drive", "wheel_grip"]:
					wheel_count += 1
			var wheel_key := "drive_4" if catalog_id == "wheel_drive" and wheel_count >= 4 else "grip_4" if wheel_count >= 4 else "drive_2"
			chosen["wheels"] = OPTION_IDS["wheels"].find(wheel_key)
		elif catalog_id in OPTION_IDS["front"]:
			chosen["front"] = OPTION_IDS["front"].find(catalog_id)
			front_mount_offset = float(_vector_from_array(part.get("position", [0.0, 0.0, -1.02])).z) + 1.02
		elif catalog_id in OPTION_IDS["weapon"]:
			chosen["weapon"] = OPTION_IDS["weapon"].find(catalog_id)
			weapon_mount_offset = float(_vector_from_array(part.get("position", [0.0, 0.0, -0.55])).z) + 0.55
		elif catalog_id in OPTION_IDS["battery"]:
			chosen["battery"] = OPTION_IDS["battery"].find(catalog_id)
	var paint := str(blueprint.get("paint", "yard-yellow"))
	chosen["paint"] = OPTION_IDS["paint"].find(paint)
	if chosen["paint"] < 0:
		chosen["paint"] = 0
	for id in part_buttons:
		var button: OptionButton = part_buttons[id]
		button.select(int(chosen[id]))
	machine_name_edit.text = str(blueprint.get("name", "Untitled machine"))
	_update_mount_labels()

func _draft_from_controls() -> Dictionary:
	var chassis_ids: Array = OPTION_IDS["chassis"]
	var wheel_key: String = OPTION_IDS["wheels"][part_buttons["wheels"].selected]
	var wheel_catalog := "wheel_grip" if wheel_key == "grip_4" else "wheel_drive"
	var wheel_count := 2 if wheel_key == "drive_2" else 4
	return BlueprintServiceScript.build_blueprint({
		"name": machine_name_edit.text.strip_edges() if not machine_name_edit.text.strip_edges().is_empty() else "Untitled machine",
		"chassis": chassis_ids[part_buttons["chassis"].selected],
		"wheels": wheel_catalog,
		"wheel_count": wheel_count,
		"front": OPTION_IDS["front"][part_buttons["front"].selected],
		"weapon": OPTION_IDS["weapon"][part_buttons["weapon"].selected],
		"battery": OPTION_IDS["battery"][part_buttons["battery"].selected],
		"paint": OPTION_IDS["paint"][part_buttons["paint"].selected],
		"front_offset": front_mount_offset,
		"weapon_offset": weapon_mount_offset,
	})

func _on_part_selected(_index: int, _id: String) -> void:
	_refresh_workshop("Draft changed. Read the inspection before saving.")

func _on_machine_name_changed(_value: String) -> void:
	_refresh_workshop("Name changed. The build remains unsaved until you save a revision.")

func _nudge_mount(which: String, amount: float) -> void:
	if which == "front":
		front_mount_offset = clampf(front_mount_offset + amount, -0.36, 0.36)
	else:
		weapon_mount_offset = clampf(weapon_mount_offset + amount, -0.36, 0.36)
	_refresh_workshop("Mount repositioned. Balance and force path were recalculated.")

func _update_mount_labels() -> void:
	if is_instance_valid(mount_front_label):
		mount_front_label.text = "%+.2f m" % front_mount_offset
	if is_instance_valid(mount_weapon_label):
		mount_weapon_label.text = "%+.2f m" % weapon_mount_offset

func _refresh_workshop(message := "") -> void:
	if not is_instance_valid(inspection_metrics):
		return
	draft_blueprint = _draft_from_controls()
	var inspection := BlueprintServiceScript.inspect_blueprint(draft_blueprint)
	var footprint: Vector2 = inspection.get("footprint", Vector2.ZERO)
	inspection_metrics.text = "MASS             %5.1f / 120.0 kg\nPOWER            %5.1f / %5.1f\nBALANCE          x %+.2f   z %+.2f\nFOOTPRINT        %4.2f × %4.2f m\nCLEARANCE        %4.2f m\nCONNECTIONS      %2d\nTRACTION         %4.2f\nPARTS            %2d" % [
		float(inspection.mass_kg), float(inspection.power_draw), float(inspection.power_supply),
		float(inspection.balance_x), float(inspection.balance_z), footprint.x, footprint.y,
		float(inspection.clearance), int(inspection.connections), float(inspection.traction), int(inspection.part_count),
	]
	inspection_force_path.text = str(inspection.force_path)
	inspection_schematic.set_blueprint(draft_blueprint, _paint_color(str(draft_blueprint.get("paint", "yard-yellow"))))
	var reasons: Array = inspection.get("reasons", [])
	var warnings: Array = inspection.get("warnings", [])
	if inspection.valid:
		inspection_validation.modulate = SUCCESS
		inspection_validation.text = "READY FOR A SAVED REVISION\n\n%s" % ("\n".join(warnings) if not warnings.is_empty() else "No inspection warnings. Test the machine before you fight.")
		workshop_status.modulate = SUCCESS
	else:
		inspection_validation.modulate = DANGER
		inspection_validation.text = "BLOCKED — CORRECT THESE CONSEQUENCES\n\n%s" % "\n".join(reasons)
		workshop_status.modulate = DANGER
		workshop_status.text = "Draft is preserved but not arena-ready. The last valid revision is still safe."
	if inspection.valid and not message.is_empty():
		workshop_status.modulate = ACCENT_BRIGHT
		workshop_status.text = message
	elif inspection.valid:
		workshop_status.text = "Build is valid. Save it as a revision, then run a private test."
	inspection_force_path.modulate = ACCENT_BRIGHT
	save_revision_button.disabled = not inspection.valid
	test_bay_button.disabled = not inspection.valid
	enter_arena_button.disabled = not inspection.valid or last_valid_rebuild.is_empty()
	mount_front_label.text = "%+.2f m" % front_mount_offset
	mount_weapon_label.text = "%+.2f m" % weapon_mount_offset
	_refresh_preview()

func _refresh_preview() -> void:
	if is_instance_valid(preview_assembly):
		preview_assembly.queue_free()
	preview_assembly = RobotAssemblyScript.new()
	preview_assembly.name = "WorkshopPreviewAssembly"
	preview_assembly.position = Vector3(0.0, 0.55, 0.0)
	preview_assembly.rotation.y = PI
	add_child(preview_assembly)
	preview_assembly.build(draft_blueprint, _paint_color(str(draft_blueprint.get("paint", "yard-yellow"))), str(draft_blueprint.get("name", "Untitled machine")))

func _save_revision() -> void:
	var rebuilt := BlueprintServiceScript.server_rebuild(draft_blueprint)
	if not rebuilt.get("accepted", false):
		_refresh_workshop("Save denied. Read the specific inspection findings.")
		return
	last_valid_rebuild = rebuilt
	BlueprintServiceScript.save_blueprint(rebuilt.blueprint)
	_record_revision(rebuilt, "Saved builder revision")
	workshop_status.modulate = SUCCESS
	workshop_status.text = "REVISION SAVED — %s is now the last valid machine." % str(rebuilt.blueprint.name)
	_refresh_workshop(workshop_status.text)

func _record_revision(rebuilt: Dictionary, note: String) -> void:
	revision_counter += 1
	var record := {
		"revision": revision_counter,
		"note": note,
		"blueprint": rebuilt.blueprint.duplicate(true),
		"hash": str(rebuilt.get("blueprint_hash", "")),
		"mass": float(rebuilt.validation.get("mass_kg", 0.0)),
	}
	revisions.append(record)
	_refresh_revision_list()

func _refresh_revision_list() -> void:
	if not is_instance_valid(revision_list):
		return
	revision_list.clear()
	for record in revisions:
		revision_list.add_item("R%02d  %s\n%0.1f kg  %s" % [int(record.revision), str(record.note), float(record.mass), str(record.hash).left(8)])
	revision_status.text = "%d valid revision(s). Invalid drafts never replace these records." % revisions.size()

func _load_selected_revision() -> void:
	var selected := revision_list.get_selected_items()
	if selected.is_empty():
		revision_status.modulate = DANGER
		revision_status.text = "Select a revision first."
		return
	var record: Dictionary = revisions[int(selected[0])]
	draft_blueprint = record.blueprint.duplicate(true)
	last_valid_rebuild = BlueprintServiceScript.server_rebuild(draft_blueprint)
	_set_controls_from_blueprint(draft_blueprint)
	_refresh_workshop("Loaded R%02d. The exact prior build is back on the pad." % int(record.revision))

func _load_last_valid() -> void:
	if last_valid_rebuild.is_empty():
		return
	draft_blueprint = last_valid_rebuild.blueprint.duplicate(true)
	_set_controls_from_blueprint(draft_blueprint)
	_refresh_workshop("Last valid revision restored. Your failed draft was not destroyed; it was replaced intentionally.")

func _start_test_bay() -> void:
	_start_session(true)

func _start_arena() -> void:
	_start_session(false)

func _start_session(test_mode: bool) -> void:
	var rebuilt := BlueprintServiceScript.server_rebuild(draft_blueprint)
	if not rebuilt.get("accepted", false):
		_show_workshop()
		_refresh_workshop("Arena entry denied. Correct the inspection findings first.")
		return
	last_valid_rebuild = last_valid_rebuild if not last_valid_rebuild.is_empty() else rebuilt
	selected_machine = _machine_key_from_blueprint(rebuilt.blueprint)
	phase = Phase.TEST_BAY if test_mode else Phase.ARENA
	virtual_throttle = 0.0
	virtual_steer = 0.0
	virtual_weapon = false
	workshop_panel.visible = false
	inspection_panel.visible = false
	revisions_panel.visible = false
	report_overlay.visible = false
	combat_hud.visible = true
	camera.position = arena.camera_anchor
	camera.look_at(Vector3(0.0, 0.4, 0.0), Vector3.UP)
	match_controller.begin_match(selected_machine, _paint_color(str(rebuilt.blueprint.get("paint", "yard-yellow"))), arena.spawn_player, arena.spawn_training, rebuilt)
	if test_mode and is_instance_valid(match_controller.training_robot):
		match_controller.training_robot.set_ai_intent(0.0, 0.0, false)
		combat_event_label.text = "PRIVATE TEST BAY  ·  DRIVE, CONTACT, WEAPON, RESET  ·  G ENTERS WORKSHOP"
	else:
		combat_event_label.text = "ARENA RUN  ·  WASD / ARROWS DRIVE  ·  SPACE WEAPON  ·  R RESET"
	combat_mode_label.text = "PRIVATE TEST BAY" if test_mode else "ARENA // LOCAL OPPONENT"

func _start_remote_runtime(match_id: String, requested_slot: String) -> void:
	remote_runtime_mode = true
	remote_slot = "B" if requested_slot == "B" else "A"
	phase = Phase.ARENA
	workshop_panel.visible = false
	inspection_panel.visible = false
	revisions_panel.visible = false
	report_overlay.visible = false
	combat_hud.visible = true
	combat_mode_label.text = "LIVE AUTHORITY MIRROR"
	combat_title_label.text = "CONNECTING TO MATCH %s" % match_id.left(8).to_upper()
	combat_event_label.text = "READ-ONLY 3D RENDERER  ·  BROWSER AUTHORITY OWNS COMMANDS"
	camera.position = arena.camera_anchor
	camera.look_at(Vector3(0.0, 0.4, 0.0), Vector3.UP)
	remote_bridge = RemoteMatchBridgeScript.new()
	remote_bridge.name = "HostedRobotCombatAuthorityMirror"
	remote_bridge.configure(match_id, remote_slot)
	remote_bridge.snapshot_received.connect(_on_remote_snapshot)
	remote_bridge.status_changed.connect(_on_remote_bridge_status)
	remote_bridge.failed.connect(_on_remote_bridge_failed)
	add_child(remote_bridge)
	remote_bridge.start()

func _on_remote_snapshot(snapshot: Dictionary) -> void:
	var players_value: Variant = snapshot.get("players", {})
	var players: Dictionary = players_value if players_value is Dictionary else {}
	var player_a: Variant = players.get("A", {})
	var player_b: Variant = players.get("B", {})
	var rebuilt_a := _remote_rebuild(player_a, "RAMMER")
	var rebuilt_b := _remote_rebuild(player_b, "RIPPER")
	if not remote_runtime_started:
		remote_runtime_started = true
		remote_blueprint_hash_a = str(rebuilt_a.get("blueprint_hash", ""))
		remote_blueprint_hash_b = str(rebuilt_b.get("blueprint_hash", ""))
		match_controller.begin_remote_match(
			_machine_key_from_blueprint(rebuilt_a.blueprint), _remote_paint("A"), arena.spawn_player, rebuilt_a,
			_machine_key_from_blueprint(rebuilt_b.blueprint), _remote_paint("B"), arena.spawn_training, rebuilt_b,
			remote_slot,
		)
	else:
		var hash_a := str(rebuilt_a.get("blueprint_hash", ""))
		var hash_b := str(rebuilt_b.get("blueprint_hash", ""))
		if hash_a != remote_blueprint_hash_a or hash_b != remote_blueprint_hash_b:
			remote_blueprint_hash_a = hash_a
			remote_blueprint_hash_b = hash_b
			match_controller.update_remote_builds(rebuilt_a, rebuilt_b)
	match_controller.apply_remote_snapshot(snapshot)

func _remote_rebuild(player_value: Variant, fallback_machine: String) -> Dictionary:
	if player_value is Dictionary:
		var player: Dictionary = player_value
		var blueprint_value: Variant = player.get("blueprint", {})
		if blueprint_value is Dictionary:
			var adapted := BlueprintServiceScript.web_blueprint_to_godot(blueprint_value)
			var rebuilt := BlueprintServiceScript.server_rebuild(adapted)
			if rebuilt.get("accepted", false):
				return rebuilt
	return BlueprintServiceScript.server_rebuild(BlueprintServiceScript.default_blueprint(fallback_machine))

func _remote_paint(slot: String) -> Color:
	return Color("3e918a") if slot == "B" else Color("caa03f")

func _on_remote_bridge_status(message: String) -> void:
	if is_instance_valid(combat_event_label):
		combat_event_label.text = "LIVE AUTHORITY  ·  %s" % message.to_upper()

func _on_remote_bridge_failed(message: String) -> void:
	if is_instance_valid(combat_mode_label):
		combat_mode_label.text = "LIVE AUTHORITY MIRROR · BLOCKED"
	if is_instance_valid(combat_event_label):
		combat_event_label.text = message.to_upper()

func _reset_session() -> void:
	if phase == Phase.TEST_BAY or phase == Phase.ARENA:
		_start_session(phase == Phase.TEST_BAY)

func _show_workshop() -> void:
	if is_instance_valid(match_controller):
		match_controller.stop_match()
	phase = Phase.WORKSHOP
	combat_hud.visible = false
	report_overlay.visible = false
	workshop_panel.visible = true
	inspection_panel.visible = true
	revisions_panel.visible = true
	camera.position = arena.camera_anchor
	camera.look_at(Vector3(0.0, 0.4, 0.0), Vector3.UP)
	_refresh_workshop()

func _load_last_valid_from_report() -> void:
	_load_last_valid()
	_show_workshop()

func _test_again_from_report() -> void:
	_load_last_valid()
	_start_test_bay()

func _on_match_started(player_machine: String, training_machine: String) -> void:
	combat_title_label.text = "%s  VS  %s" % [player_machine.to_upper(), training_machine.to_upper()]
	combat_event_label.text = "MACHINE LOADED  ·  CONTACT RESOLUTION IS LOCAL AND SERVER-OWNED"

func _on_hud_changed(snapshot: Dictionary) -> void:
	if not snapshot.has("player") or snapshot.player.is_empty():
		return
	var seconds := int(snapshot.clock_seconds)
	combat_clock_label.text = "%02d:%02d" % [seconds / 60, seconds % 60]
	combat_player_label.text = "YOU   %03d INTEGRITY" % int(ceil(float(snapshot.player.health)))
	combat_opponent_label.text = "OPPONENT   %03d INTEGRITY" % int(ceil(float(snapshot.training.health)))

func _on_match_finished(result: Dictionary) -> void:
	if remote_runtime_mode:
		phase = Phase.REPORT
		combat_hud.visible = true
		report_overlay.visible = false
		if is_instance_valid(remote_bridge):
			remote_bridge.stop()
		combat_mode_label.text = "LIVE AUTHORITY MIRROR · MATCH COMPLETE"
		combat_title_label.text = "%s  ·  %s" % [str(result.get("winner", "DRAW")).to_upper(), str(result.get("reason", "SESSION_END")).replace("_", " ")]
		combat_event_label.text = "TERMINAL SNAPSHOT RECEIVED  ·  REBUILD QUESTIONS REMAIN IN THE BROWSER AUTHORITY REPORT"
		return
	phase = Phase.REPORT
	combat_hud.visible = false
	report_overlay.visible = true
	var reason := str(result.get("reason", "SESSION_END")).replace("_", " ")
	report_title_label.text = "%s" % str(result.get("winner", "DRAW")).to_upper()
	report_detail_label.text = "%s  ·  You %0.1f integrity  ·  Opponent %0.1f integrity  ·  %0.1f seconds" % [reason, float(result.get("player_health", 0.0)), float(result.get("training_health", 0.0)), float(result.get("elapsed_seconds", 0.0))]
	var damage_log: Array = result.get("player_damage_log", [])
	report_damage_label.text = "INCOMING DAMAGE RECORDED\n%s" % ("\n".join(damage_log) if not damage_log.is_empty() else "No incoming damage was recorded before the session ended.")
	var questions: Array = result.get("rebuild_questions", [])
	report_question_label.text = "\n".join(questions)

func _set_virtual_drive(throttle: float, steer: float) -> void:
	virtual_throttle = throttle
	virtual_steer = steer

func _set_virtual_weapon(active: bool) -> void:
	virtual_weapon = active

func _machine_key_from_blueprint(blueprint: Dictionary) -> String:
	for value in blueprint.get("parts", []):
		if value is Dictionary:
			match str(value.get("catalog_id", "")):
				"weapon_spinner": return "RIPPER"
				"weapon_hammer": return "MAUL"
	return "RAMMER"

func _paint_color(key: String) -> Color:
	match key:
		"cutter-teal": return Color("3e918a")
		"forge-orange": return Color("b75f35")
		"cold-steel": return Color("65737a")
		_: return Color("caa03f")

func _vector_from_array(value: Variant) -> Vector3:
	if value is Array and value.size() >= 3:
		return Vector3(float(value[0]), float(value[1]), float(value[2]))
	return Vector3.ZERO

func _label(text: String, size: int, color: Color, wrap := false) -> Label:
	var label := Label.new()
	label.text = text
	label.add_theme_font_size_override("font_size", size)
	label.add_theme_color_override("font_color", color)
	label.add_theme_color_override("font_outline_color", Color("000000aa"))
	label.add_theme_constant_override("outline_size", 3)
	if wrap:
		label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	return label

func _button(text: String, size: int, primary := false) -> Button:
	var button := Button.new()
	button.text = text
	button.add_theme_font_size_override("font_size", size)
	button.add_theme_color_override("font_color", INK if primary else STEEL_BRIGHT)
	button.add_theme_color_override("font_hover_color", INK)
	button.add_theme_stylebox_override("normal", _panel_style(Color("1b2a32") if not primary else ACCENT, Color("536871") if not primary else ACCENT_BRIGHT, 7))
	button.add_theme_stylebox_override("hover", _panel_style(Color("2c414a") if not primary else ACCENT_BRIGHT, ACCENT_BRIGHT, 7))
	button.add_theme_stylebox_override("pressed", _panel_style(Color("0c151a") if not primary else Color("c29638"), ACCENT_BRIGHT, 7))
	button.add_theme_stylebox_override("disabled", _panel_style(Color("121a1e"), Color("28373d"), 7))
	return button

func _panel_style(background: Color, border: Color, radius: int) -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = background
	style.border_color = border
	style.set_border_width_all(1)
	style.set_corner_radius_all(radius)
	style.content_margin_left = 10
	style.content_margin_right = 10
	style.content_margin_top = 8
	style.content_margin_bottom = 8
	return style

func _set_margins(margin: MarginContainer, vertical: int, horizontal: int) -> void:
	margin.add_theme_constant_override("margin_left", horizontal)
	margin.add_theme_constant_override("margin_right", horizontal)
	margin.add_theme_constant_override("margin_top", vertical)
	margin.add_theme_constant_override("margin_bottom", vertical)

func _game_theme() -> Theme:
	var theme := Theme.new()
	theme.set_color("font_color", "Label", STEEL_BRIGHT)
	theme.set_color("font_color", "Button", STEEL_BRIGHT)
	theme.set_color("font_color", "OptionButton", STEEL_BRIGHT)
	theme.set_font_size("font_size", "Label", 16)
	theme.set_font_size("font_size", "Button", 16)
	return theme

func _start_network_smoke(args: PackedStringArray) -> void:
	var port := 9247
	for arg in args:
		if arg.begins_with("--port="):
			port = int(arg.trim_prefix("--port="))
	var bridge: RobotCombatNetworkBridge = NetworkBridgeScript.new()
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
