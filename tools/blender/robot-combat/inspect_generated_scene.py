"""Inspect a generated SGW Robot Combat Blender scene for foundation proof."""

from __future__ import annotations

import json
import sys
from pathlib import Path

import bpy


def read_output_argument(argv: list[str]) -> str | None:
    if "--" in argv:
        trailing = argv[argv.index("--") + 1 :]
        return trailing[0] if trailing else None
    return argv[1] if len(argv) == 2 else None


def object_names(prefix: str | None = None) -> list[str]:
    names = sorted(obj.name for obj in bpy.data.objects)
    if prefix:
        return [name for name in names if name.startswith(prefix)]
    return names


def objects_with_kind(kind: str) -> list[str]:
    return sorted(
        obj.name
        for obj in bpy.data.objects
        if obj.get("sgw_kind") == kind
    )


def custom_property_summary() -> dict[str, dict[str, object]]:
    summary: dict[str, dict[str, object]] = {}
    for obj in bpy.data.objects:
        if not obj.keys():
            continue
        summary[obj.name] = {key: obj[key] for key in obj.keys() if key != "_RNA_UI"}
    return summary


def main() -> int:
    output_argument = read_output_argument(sys.argv)
    if output_argument is None:
        print("Usage: inspect_generated_scene.py <generated-output-folder>")
        return 2

    root = Path(output_argument).expanduser().resolve()
    blend_path = root / "SGW_Robot_Combat_Arena_v0_1.blend"
    if not blend_path.is_file():
        print(f"FAIL: Missing blend file at {blend_path}")
        return 1

    bpy.ops.wm.open_mainfile(filepath=str(blend_path))

    spawn_names = [name for name in object_names() if name.startswith("SPAWN_")]
    bot_roots = object_names("BOT_")
    bot_root_roots = [name for name in bot_roots if name.endswith("_ROOT")]
    weapon_pivots = [name for name in object_names() if "WeaponPivot" in name or "HammerPivot" in name]
    collision_objects = [name for name in object_names() if "-collision" in name or name.endswith("_Col")]
    part_library = [name for name in object_names() if name.startswith("PART_")]
    socket_objects = [name for name in object_names() if name.startswith("SOCKET_")]

    floor = bpy.data.objects.get("ARENA_Floor-collision")
    wall = bpy.data.objects.get("ARENA_North_SafetyGlass-collision")
    rammer = bpy.data.objects.get("BOT_RAMMER_ROOT")
    ripper = bpy.data.objects.get("BOT_RIPPER_ROOT")
    maul = bpy.data.objects.get("BOT_MAUL_ROOT")
    rammer_wedge = bpy.data.objects.get("RAMMER_FrontWedge-collision")
    ripper_spinner = bpy.data.objects.get("RIPPER_WeaponPivot")
    maul_hammer = bpy.data.objects.get("MAUL_HammerPivot")

    findings = {
        "blend_path": str(blend_path),
        "object_count": len(bpy.data.objects),
        "spawn_zone_marker_count": len(spawn_names),
        "spawn_zones": spawn_names,
        "bot_root_objects": bot_root_roots,
        "weapon_pivots": weapon_pivots,
        "collision_object_count": len(collision_objects),
        "part_library_count": len(part_library),
        "part_library_sample": part_library[:10],
        "socket_object_count": len(socket_objects),
        "socket_sample": socket_objects[:10],
        "arena_floor_present": floor is not None,
        "arena_wall_present": wall is not None,
        "starter_bots_present": {
            "rammer": rammer is not None,
            "ripper": ripper is not None,
            "maul": maul is not None,
        },
        "weapon_features_present": {
            "rammer_wedge_no_active_weapon": rammer_wedge is not None and ripper_spinner is not None and maul_hammer is not None,
            "ripper_spinner_pivot": ripper_spinner is not None,
            "maul_hammer_pivot": maul_hammer is not None,
        },
        "duplicate_suffix_names": [
            name for name in object_names() if ".001" in name or ".002" in name
        ],
        "custom_property_object_count": len(custom_property_summary()),
        "spawn_zone_kind_count": len(objects_with_kind("SPAWN_ZONE")),
    }

    report_path = root / "manifest" / "scene_inspection_report.json"
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(findings, indent=2), encoding="utf-8")
    print(json.dumps(findings, indent=2))
    print(f"Scene inspection report: {report_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
