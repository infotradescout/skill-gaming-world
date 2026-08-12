class_name RobotSchematic
extends Control

const BlueprintServiceScript := preload("res://scripts/blueprint_service.gd")
const ACCENT := Color("e6bb57")
const ACCENT_BRIGHT := Color("ffe19a")

var blueprint: Dictionary = {}
var paint_color := Color("caa03f")

func set_blueprint(next_blueprint: Dictionary, next_paint: Color) -> void:
	blueprint = next_blueprint.duplicate(true)
	paint_color = next_paint
	queue_redraw()

func _draw() -> void:
	var rect := Rect2(Vector2.ZERO, size)
	draw_style_box(_panel_style(Color("0b151b"), Color("334852"), 7), rect)
	var center := Vector2(size.x * 0.5, size.y * 0.55)
	var scale_factor := minf((size.x - 64.0) / 3.8, (size.y - 22.0) / 3.8)
	for x in range(-2, 3):
		var gx := center.x + float(x) * scale_factor
		draw_line(Vector2(gx, 12), Vector2(gx, size.y - 10), Color("1c2a31"), 1.0)
	for z in range(-1, 2):
		var gy := center.y + float(z) * scale_factor
		draw_line(Vector2(18, gy), Vector2(size.x - 18, gy), Color("1c2a31"), 1.0)
	draw_line(center, center + Vector2(0.0, -32.0), ACCENT_BRIGHT, 2.0)
	draw_colored_polygon(PackedVector2Array([center + Vector2(-5.0, -24.0), center + Vector2(5.0, -24.0), center + Vector2(0.0, -34.0)]), ACCENT_BRIGHT)

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
		var raw_size: Array = catalog.get("size", [1.0, 1.0, 1.0])
		var part_size := Vector2(float(raw_size[0]), float(raw_size[2])) * scale_factor
		var mapped := center + Vector2(position.x, position.z) * scale_factor
		match category:
			"chassis":
				draw_rect(Rect2(mapped - part_size * 0.5, part_size), paint_color, true)
				draw_rect(Rect2(mapped - part_size * 0.5, part_size), Color("f2d47d"), false, 2.0)
			"battery":
				draw_rect(Rect2(mapped - Vector2(12.0, 8.0), Vector2(24.0, 16.0)), Color("4b6a75"), true)
			"wheel":
				draw_circle(mapped, 7.0, Color("111519"))
				draw_arc(mapped, 7.0, 0.0, TAU, 16, Color("9eabb0"), 1.0)
			"front":
				draw_rect(Rect2(mapped - Vector2(part_size.x * 0.5, 5.0), Vector2(part_size.x, 10.0)), ACCENT, true)
			"weapon":
				if catalog_id == "weapon_spinner":
					draw_circle(mapped, 17.0, Color("b8c1c3"))
					draw_arc(mapped, 17.0, 0.0, TAU, 20, Color("f0f4ed"), 2.0)
				else:
					draw_rect(Rect2(mapped - Vector2(13.0, 7.0), Vector2(26.0, 14.0)), Color("a97942") if catalog_id == "weapon_hammer" else ACCENT_BRIGHT, true)

func _vector_from_array(value: Variant) -> Vector3:
	if value is Array and value.size() >= 3:
		return Vector3(float(value[0]), float(value[1]), float(value[2]))
	return Vector3.ZERO

func _panel_style(background: Color, border: Color, radius: int) -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = background
	style.border_color = border
	style.set_border_width_all(1)
	style.set_corner_radius_all(radius)
	return style
