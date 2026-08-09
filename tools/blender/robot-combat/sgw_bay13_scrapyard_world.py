"""
Bay 13: The Scrapyard — story-blockout arena / landmark builders.

Imported by sgw_robot_combat_arena.py. "Scrapyard" = fight / brawl venue,
not a junk / trash dump. Shipbreaking history informs materials and landmarks.
"""

from __future__ import annotations

import math
from typing import Any, Callable, Sequence

import bpy
from mathutils import Vector


# Filled by host generator after import.
H: dict[str, Any] = {}


def bind_host(host: dict[str, Any]) -> None:
    """Bind host helpers/constants so this module stays importable by Blender."""
    H.clear()
    H.update(host)


def _c() -> Any:
    return H["create_box"]


def _cyl() -> Any:
    return H["create_cylinder"]


def _tor() -> Any:
    return H["create_torus"]


def _txt() -> Any:
    return H["create_text"]


def _empty() -> Any:
    return H["create_empty"]


def _label(
    name: str,
    text: str,
    location: Sequence[float],
    collection: bpy.types.Collection,
    materials: dict[str, bpy.types.Material],
    *,
    size: float = 0.45,
    rotation: Sequence[float] = (math.radians(90.0), 0.0, 0.0),
) -> None:
    _txt()(
        name,
        text,
        location,
        size,
        materials["hazard_stripe"],
        collection,
        rotation=rotation,
        extrude=0.02,
        sgw_kind="STORY_LABEL",
        collision_shape="NONE",
        story_location=text,
    )


def build_transfer_floor(
    collections: dict[str, bpy.types.Collection],
    materials: dict[str, bpy.types.Material],
) -> list[dict[str, Any]]:
    arena = collections["arena"]
    markings = collections["arena_markings"]
    inner_x = H["ARENA_INNER_X"]
    inner_y = H["ARENA_INNER_Y"]
    floor_t = H["ARENA_FLOOR_THICKNESS"]
    bot_specs = H["BOT_SPECS"]
    add_floor_wear = H["_add_floor_wear"]

    _c()(
        "ARENA_Floor-collision",
        (inner_x, inner_y, floor_t),
        (0.0, 0.0, -floor_t / 2.0),
        materials["floor"],
        arena,
        bevel=0.03,
        sgw_kind="ARENA_STATIC",
        collision_shape="BOX",
        friction=0.88,
        restitution=0.04,
        story_role="ship_transfer_platform",
    )

    # Large steel deck plates (readable grid, not debris).
    plate_w, plate_d = 3.0, 2.5
    plate_gap = 0.10
    x_start = -inner_x / 2.0 + plate_w / 2.0 + 0.20
    y_start = -inner_y / 2.0 + plate_d / 2.0 + 0.20
    plate_index = 0
    y = y_start
    while y < inner_y / 2.0 - 0.15:
        x = x_start
        while x < inner_x / 2.0 - 0.15:
            mat = materials["floor_plate"] if plate_index % 7 else materials["rail"]
            _c()(
                f"FLOOR_DECK_PLATE_{plate_index:03d}",
                (plate_w - plate_gap, plate_d - plate_gap, 0.04),
                (x, y, 0.02),
                mat,
                markings,
                bevel=0.015,
                sgw_kind="ARENA_MARKING",
                collision_shape="NONE",
                story_role="replaceable_deck_panel",
            )
            for ox, oy in ((-0.95, -0.75), (0.95, -0.75), (-0.95, 0.75), (0.95, 0.75)):
                _cyl()(
                    f"FLOOR_LIFT_POINT_{plate_index:03d}_{ox:+.0f}_{oy:+.0f}",
                    0.09,
                    0.025,
                    (x + ox, y + oy, 0.045),
                    materials["brushed"],
                    markings,
                    vertices=16,
                    bevel=0.0,
                    sgw_kind="ARENA_MARKING",
                    collision_shape="NONE",
                    story_role="lifting_point",
                )
            plate_index += 1
            x += plate_w
        y += plate_d

    # Radial transfer-rail seams from center bearing.
    for index, angle_deg in enumerate(range(0, 180, 15)):
        ang = math.radians(angle_deg)
        _c()(
            f"FLOOR_TRANSFER_RAIL_{index:02d}",
            (0.10, min(inner_x, inner_y) - 1.2, 0.016),
            (0.0, 0.0, 0.01),
            materials["floor_seam"],
            markings,
            bevel=0.0,
            rotation=(0.0, 0.0, ang),
            sgw_kind="ARENA_MARKING",
            collision_shape="NONE",
            story_role="transfer_rail_seam",
        )

    # Inspection hatches + repair welds (restrained).
    for index, (hx, hy) in enumerate(((-6.5, -3.5), (5.8, 2.8), (-3.2, 4.2), (7.0, -4.0), (0.0, -5.5))):
        _c()(
            f"FLOOR_INSPECTION_HATCH_{index:02d}",
            (1.1, 0.85, 0.03),
            (hx, hy, 0.03),
            materials["blackened"],
            markings,
            bevel=0.02,
            sgw_kind="ARENA_MARKING",
            collision_shape="NONE",
            story_role="inspection_hatch",
        )
        _c()(
            f"FLOOR_REPAIR_WELD_{index:02d}",
            (1.25, 0.06, 0.02),
            (hx, hy - 0.5, 0.04),
            materials["brushed"],
            markings,
            bevel=0.0,
            sgw_kind="ARENA_MARKING",
            collision_shape="NONE",
            story_role="repair_weld",
        )

    # Central mechanical bearing ring (match center).
    _cyl()(
        "ARENA_BearingRing_Base",
        2.95,
        0.05,
        (0.0, 0.0, 0.03),
        materials["blackened"],
        markings,
        vertices=72,
        bevel=0.0,
        sgw_kind="ARENA_MARKING",
        collision_shape="NONE",
        story_role="central_bearing_ring",
    )
    _tor()(
        "ARENA_BearingRing_Outer",
        2.70,
        0.08,
        (0.0, 0.0, 0.06),
        materials["rail"],
        markings,
        sgw_kind="ARENA_MARKING",
        collision_shape="NONE",
    )
    _tor()(
        "ARENA_BearingRing_Inner",
        1.90,
        0.05,
        (0.0, 0.0, 0.065),
        materials["brushed"],
        markings,
        sgw_kind="ARENA_MARKING",
        collision_shape="NONE",
    )
    _txt()(
        "ARENA_CenterTitle",
        "BAY 13",
        (0.0, 0.35, 0.07),
        0.85,
        materials["hazard_stripe"],
        markings,
        extrude=0.01,
        sgw_kind="ARENA_MARKING",
        collision_shape="NONE",
    )
    _txt()(
        "ARENA_CenterSubtitle",
        "THE SCRAPYARD",
        (0.0, -0.55, 0.07),
        0.42,
        materials["identity_paint"],
        markings,
        extrude=0.008,
        sgw_kind="ARENA_MARKING",
        collision_shape="NONE",
    )

    add_floor_wear(markings, materials)

    spawn_materials = (materials["spawn_red"], materials["spawn_blue"], materials["spawn_gold"])
    spawn_points: list[dict[str, Any]] = []
    for index, (bot, material) in enumerate(zip(bot_specs, spawn_materials, strict=True), start=1):
        x, y, z = bot.spawn
        _cyl()(
            f"SPAWN_{index}_{bot.bot_id.upper()}",
            1.65,
            0.010,
            (x, y, 0.028),
            material,
            markings,
            vertices=64,
            bevel=0.0,
            sgw_kind="SPAWN_ZONE",
            collision_shape="NONE",
            spawn_index=index,
            bot_id=bot.bot_id,
        )
        _tor()(
            f"SPAWN_{index}_{bot.bot_id.upper()}_Ring",
            1.65,
            0.045,
            (x, y, 0.046),
            materials["identity_paint"],
            markings,
            sgw_kind="SPAWN_ZONE",
            collision_shape="NONE",
        )
        facing_rad = math.radians(bot.facing_degrees)
        arrow_offset = 0.60
        _c()(
            f"SPAWN_{index}_{bot.bot_id.upper()}_Arrow",
            (0.28, 0.85, 0.016),
            (x + math.sin(facing_rad) * arrow_offset, y + math.cos(facing_rad) * arrow_offset, 0.038),
            material,
            markings,
            bevel=0.01,
            rotation=(0.0, 0.0, facing_rad),
            sgw_kind="SPAWN_ZONE",
            collision_shape="NONE",
        )
        spawn_points.append(
            {
                "spawn_id": f"spawn_{index}",
                "position": [x, y, z],
                "facing_degrees": bot.facing_degrees,
                "starter_bot_id": bot.bot_id,
            }
        )
    return spawn_points


def build_hull_enclosure(
    collections: dict[str, bpy.types.Collection],
    materials: dict[str, bpy.types.Material],
) -> None:
    structure = collections["arena_structure"]
    inner_x = H["ARENA_INNER_X"]
    inner_y = H["ARENA_INNER_Y"]
    armor_h = H["ARENA_HULL_ARMOR_HEIGHT"]
    glass_h = H["ARENA_GLASS_HEIGHT"]
    glass_t = H["ARENA_GLASS_THICKNESS"]
    wall_h = H["ARENA_WALL_HEIGHT"]
    post = H["ARENA_POST_SIZE"]
    frame_d = H["ARENA_FRAME_DEPTH"]

    half_x = inner_x / 2.0
    half_y = inner_y / 2.0
    wall_thickness = 1.05
    armor_z = armor_h / 2.0
    glass_z = armor_h + glass_h / 2.0

    rail_specs = (
        ("North", (inner_x + wall_thickness * 2, wall_thickness, armor_h), (0.0, half_y + wall_thickness / 2, armor_z)),
        ("South", (inner_x + wall_thickness * 2, wall_thickness, armor_h), (0.0, -half_y - wall_thickness / 2, armor_z)),
        ("East", (wall_thickness, inner_y, armor_h), (half_x + wall_thickness / 2, 0.0, armor_z)),
        ("West", (wall_thickness, inner_y, armor_h), (-half_x - wall_thickness / 2, 0.0, armor_z)),
    )
    for side, dimensions, location in rail_specs:
        _c()(
            f"ARENA_{side}_HullArmor-collision",
            dimensions,
            location,
            materials["blackened"],
            structure,
            bevel=0.08,
            sgw_kind="ARENA_STATIC",
            collision_shape="BOX",
            friction=0.48,
            restitution=0.10,
            story_role="ship_hull_armor",
        )
        # Layered plate cladding on inner face.
        if side == "North":
            clad_loc = (0.0, half_y + 0.14, armor_z)
            clad_dims = (inner_x - 0.5, 0.18, armor_h - 0.2)
        elif side == "South":
            clad_loc = (0.0, -half_y - 0.14, armor_z)
            clad_dims = (inner_x - 0.5, 0.18, armor_h - 0.2)
        elif side == "East":
            clad_loc = (half_x + 0.14, 0.0, armor_z)
            clad_dims = (0.18, inner_y - 0.5, armor_h - 0.2)
        else:
            clad_loc = (-half_x - 0.14, 0.0, armor_z)
            clad_dims = (0.18, inner_y - 0.5, armor_h - 0.2)
        _c()(
            f"ARENA_{side}_HullPlateLayer",
            clad_dims,
            clad_loc,
            materials["rail"],
            structure,
            bevel=0.04,
            sgw_kind="ARENA_STRUCTURE",
            collision_shape="NONE",
            story_role="layered_hull_plate",
        )
        # Impact repair patches.
        for p_i, offset in enumerate((-6.0, 0.0, 6.0) if side in ("North", "South") else (-4.0, 0.0, 4.0)):
            if side in ("North", "South"):
                patch_loc = (offset, clad_loc[1], armor_h * 0.55)
                patch_dims = (1.4, 0.08, 0.55)
            else:
                patch_loc = (clad_loc[0], offset, armor_h * 0.55)
                patch_dims = (0.08, 1.2, 0.55)
            _c()(
                f"ARENA_{side}_RepairPatch_{p_i}",
                patch_dims,
                patch_loc,
                materials["brushed"],
                structure,
                bevel=0.02,
                sgw_kind="ARENA_STRUCTURE",
                collision_shape="NONE",
                story_role="impact_repair_patch",
            )

    # Thick framed polycarbonate above armor.
    bay_xs = (-10.0, -6.0, -2.0, 2.0, 6.0, 10.0)
    bay_ys = (-6.0, -2.0, 2.0, 6.0)
    for side, y_wall in (("North", half_y + glass_t / 2.0 + 0.06), ("South", -half_y - glass_t / 2.0 - 0.06)):
        for index, cx in enumerate(bay_xs):
            _c()(
                f"ARENA_{side}_PolyBay_{index}",
                (3.55, glass_t, glass_h - 0.14),
                (cx, y_wall, glass_z),
                materials["glass"],
                structure,
                bevel=0.01,
                sgw_kind="ARENA_STATIC",
                collision_shape="BOX",
                friction=0.22,
                restitution=0.16,
                story_role="framed_polycarbonate",
            )
    for side, x_wall in (("East", half_x + glass_t / 2.0 + 0.06), ("West", -half_x - glass_t / 2.0 - 0.06)):
        for index, cy in enumerate(bay_ys):
            _c()(
                f"ARENA_{side}_PolyBay_{index}",
                (glass_t, 3.55, glass_h - 0.14),
                (x_wall, cy, glass_z),
                materials["glass"],
                structure,
                bevel=0.01,
                sgw_kind="ARENA_STATIC",
                collision_shape="BOX",
                friction=0.22,
                restitution=0.16,
                story_role="framed_polycarbonate",
            )

    # Keep named north glass collision for inspectors.
    _c()(
        "ARENA_North_SafetyGlass-collision",
        (inner_x, glass_t * 0.45, glass_h),
        (0.0, half_y + 0.02, glass_z),
        materials["glass"],
        structure,
        bevel=0.01,
        sgw_kind="ARENA_STATIC",
        collision_shape="BOX",
        friction=0.22,
        restitution=0.16,
    )
    # Legacy kick-rail alias (empty marker) for older name-based inspectors.
    _empty()(
        "ARENA_North_KickRail-collision",
        (0.0, half_y + wall_thickness / 2, armor_z),
        structure,
        display_type="CUBE",
        display_size=0.2,
        sgw_kind="ARENA_STATIC",
        collision_shape="NONE",
        story_role="legacy_alias_hull_armor",
    )

    # Enormous ship-rib supports + reinforced corners.
    post_positions: set[tuple[float, float]] = set()
    for x in (-half_x, -8.0, -4.0, 0.0, 4.0, 8.0, half_x):
        post_positions.add((x, half_y + 0.22))
        post_positions.add((x, -half_y - 0.22))
    for y in (-half_y, -4.0, 0.0, 4.0, half_y):
        post_positions.add((half_x + 0.22, y))
        post_positions.add((-half_x - 0.22, y))

    for index, (x, y) in enumerate(sorted(post_positions)):
        is_corner = abs(abs(x) - half_x) < 0.35 and abs(abs(y) - half_y) < 0.35
        size = 0.95 if is_corner else post
        _c()(
            f"ARENA_ShipRib_{index:02d}",
            (size, size, wall_h + 0.85),
            (x, y, (wall_h + 0.85) / 2.0),
            materials["blackened"],
            structure,
            bevel=0.06,
            sgw_kind="ARENA_STRUCTURE",
            collision_shape="BOX",
            story_role="ship_rib_support",
        )
        # Rib flange / bracket.
        _c()(
            f"ARENA_ShipRibFlange_{index:02d}",
            (size + 0.45, size + 0.12, 0.22),
            (x, y, armor_h),
            materials["rail"],
            structure,
            bevel=0.03,
            sgw_kind="ARENA_STRUCTURE",
            collision_shape="NONE",
            story_role="rib_bracket",
        )
        _c()(
            f"ARENA_ShipRibCap_{index:02d}",
            (size + 0.22, size + 0.22, 0.18),
            (x, y, wall_h + 0.55),
            materials["rail"],
            structure,
            bevel=0.03,
            sgw_kind="ARENA_STRUCTURE",
            collision_shape="NONE",
        )

    for index, (cx, cy, rot) in enumerate(
        (
            (-half_x + 1.2, -half_y + 1.2, 45.0),
            (half_x - 1.2, -half_y + 1.2, -45.0),
            (-half_x + 1.2, half_y - 1.2, 135.0),
            (half_x - 1.2, half_y - 1.2, -135.0),
        )
    ):
        _c()(
            f"ARENA_CornerArmor_{index}",
            (2.0, 0.35, 1.25),
            (cx, cy, 0.62),
            materials["rail"],
            structure,
            bevel=0.06,
            rotation=(0.0, 0.0, math.radians(rot)),
            sgw_kind="ARENA_STRUCTURE",
            collision_shape="BOX",
            story_role="reinforced_corner",
            hazard_tag="active now",
        )

    mid_z = armor_h + glass_h * 0.48
    for side, y in (("North", half_y + 0.22), ("South", -half_y - 0.22)):
        _c()(
            f"ARENA_MidRail_{side}",
            (inner_x + 1.0, frame_d, 0.24),
            (0.0, y, mid_z),
            materials["rail"],
            structure,
            bevel=0.03,
            sgw_kind="ARENA_STRUCTURE",
            collision_shape="NONE",
        )
        _c()(
            f"ARENA_PolyFrame_{side}",
            (inner_x + 1.0, frame_d, 0.20),
            (0.0, y, armor_h + 0.10),
            materials["brushed"],
            structure,
            bevel=0.02,
            sgw_kind="ARENA_STRUCTURE",
            collision_shape="NONE",
        )
    for side, x in (("East", half_x + 0.22), ("West", -half_x - 0.22)):
        _c()(
            f"ARENA_MidRail_{side}",
            (frame_d, inner_y + 0.5, 0.24),
            (x, 0.0, mid_z),
            materials["rail"],
            structure,
            bevel=0.03,
            sgw_kind="ARENA_STRUCTURE",
            collision_shape="NONE",
        )
        _c()(
            f"ARENA_PolyFrame_{side}",
            (frame_d, inner_y + 0.5, 0.20),
            (x, 0.0, armor_h + 0.10),
            materials["brushed"],
            structure,
            bevel=0.02,
            sgw_kind="ARENA_STRUCTURE",
            collision_shape="NONE",
        )

    top_z = wall_h + 0.20
    for name, dims, loc in (
        ("North", (inner_x + 1.4, 0.42, 0.34), (0.0, half_y + 0.22, top_z)),
        ("South", (inner_x + 1.4, 0.42, 0.34), (0.0, -half_y - 0.22, top_z)),
        ("East", (0.42, inner_y + 0.7, 0.34), (half_x + 0.22, 0.0, top_z)),
        ("West", (0.42, inner_y + 0.7, 0.34), (-half_x - 0.22, 0.0, top_z)),
    ):
        _c()(
            f"ARENA_TopRail_{name}",
            dims,
            loc,
            materials["blackened"],
            structure,
            bevel=0.05,
            sgw_kind="ARENA_STRUCTURE",
            collision_shape="BOX",
        )

    # Protected observation / camera pockets on north wall.
    for index, cx in enumerate((-5.0, 5.0)):
        _c()(
            f"ARENA_ObsCameraPocket_{index}",
            (1.6, 0.55, 0.9),
            (cx, half_y + 0.85, armor_h + 1.1),
            materials["blackened"],
            structure,
            bevel=0.04,
            sgw_kind="ARENA_STRUCTURE",
            collision_shape="NONE",
            story_role="protected_camera_position",
        )
        _empty()(
            f"CAM_POCKET_PIVOT_{index}",
            (cx, half_y + 0.4, armor_h + 1.1),
            structure,
            display_type="CONE",
            display_size=0.35,
            sgw_kind="CAMERA_ANCHOR",
            camera_role="PROTECTED_POCKET",
        )


def build_hazards_and_ceremony(
    collections: dict[str, bpy.types.Collection],
    materials: dict[str, bpy.types.Material],
) -> list[dict[str, Any]]:
    hazards_col = collections["arena_hazards"]
    ceremony = collections["arena_ceremony"]
    markings = collections["arena_markings"]
    structure = collections["arena_structure"]
    inner_x = H["ARENA_INNER_X"]
    inner_y = H["ARENA_INNER_Y"]
    armor_h = H["ARENA_HULL_ARMOR_HEIGHT"]
    half_x = inner_x / 2.0
    half_y = inner_y / 2.0

    hazard_defs = [
        {
            "hazard_id": "hull_straightening_ram",
            "name": "HAZARD_HullStraighteningRam",
            "tag": "interactive later",
            "location": (-9.5, 0.0, 0.55),
            "dims": (1.8, 0.7, 1.0),
            "note": "Former hull-straightening press foundation; inactive.",
        },
        {
            "hazard_id": "chain_drag_channel",
            "name": "HAZARD_ChainDragChannel",
            "tag": "interactive later",
            "location": (0.0, 6.2, 0.04),
            "dims": (14.0, 0.55, 0.08),
            "note": "Recessed chain-drag channel; covered inactive.",
        },
        {
            "hazard_id": "magnetic_recovery_zone",
            "name": "HAZARD_MagneticRecoveryZone",
            "tag": "interactive later",
            "location": (9.2, 5.5, 0.03),
            "dims": (3.2, 2.4, 0.05),
            "note": "Marked magnetic recovery pad; inactive gameplay.",
        },
        {
            "hazard_id": "cutting_torch_vents",
            "name": "HAZARD_CuttingTorchVents",
            "tag": "visual only",
            "location": (-9.0, -5.5, 0.12),
            "dims": (2.0, 0.8, 0.25),
            "note": "Short cutting-torch vent housings; visual only.",
        },
    ]
    hazard_manifest: list[dict[str, Any]] = []
    for item in hazard_defs:
        _c()(
            f"{item['name']}_Foundation",
            item["dims"],
            item["location"],
            materials["hazard"],
            hazards_col,
            bevel=0.03,
            sgw_kind="HAZARD_MARKER",
            collision_shape="NONE",
            hazard_state="INACTIVE",
            hazard_tag=item["tag"],
            server_authority_required=True,
        )
        _c()(
            f"{item['name']}_Frame",
            (item["dims"][0] + 0.2, item["dims"][1] + 0.2, 0.1),
            (item["location"][0], item["location"][1], item["location"][2] + item["dims"][2] * 0.35),
            materials["blackened"],
            hazards_col,
            bevel=0.02,
            sgw_kind="HAZARD_MARKER",
            collision_shape="NONE",
            hazard_tag=item["tag"],
        )
        hazard_manifest.append(
            {
                "hazard_id": item["hazard_id"],
                "state": "INACTIVE",
                "hazard_tag": item["tag"],
                "note": item["note"],
            }
        )

    # Corner impact pockets — active now as static collision armor only.
    for index, (cx, cy) in enumerate(
        ((-half_x + 1.0, -half_y + 1.0), (half_x - 1.0, -half_y + 1.0), (-half_x + 1.0, half_y - 1.0), (half_x - 1.0, half_y - 1.0))
    ):
        _c()(
            f"HAZARD_CornerImpactPocket_{index}-collision",
            (1.4, 1.4, 0.35),
            (cx, cy, 0.18),
            materials["rail"],
            hazards_col,
            bevel=0.05,
            sgw_kind="ARENA_STATIC",
            collision_shape="BOX",
            hazard_tag="active now",
            story_role="corner_impact_pocket",
        )
        hazard_manifest.append(
            {
                "hazard_id": f"corner_impact_pocket_{index}",
                "state": "ACTIVE_STATIC",
                "hazard_tag": "active now",
                "note": "Reinforced corner impact pocket — static collision only, not a special hazard mode.",
            }
        )

    # Match ceremony markers / pivots (animation-ready structure only).
    ceremony_markers = (
        ("CEREMONY_WorkLights_CrewBays", (0.0, -half_y - 5.5, 4.5), "work_lights"),
        ("CEREMONY_DockBell", (half_x + 3.5, -half_y - 2.0, 3.2), "dock_bell"),
        ("CEREMONY_SafetyShutters", (0.0, -half_y - 0.8, armor_h + 0.3), "safety_shutters"),
        ("CEREMONY_CraneLightSweep", (0.0, half_y + 6.0, 9.5), "crane_light_sweep"),
        ("CEREMONY_MainSiren", (0.0, half_y + 8.5, 7.8), "main_siren"),
        ("CEREMONY_MatchStart", (0.0, 0.0, 0.2), "match_start"),
        ("CEREMONY_RecoveryLights", (0.0, half_y + 5.5, 6.0), "recovery_lights"),
        ("CEREMONY_RecoveryCrane", (2.0, half_y + 6.5, 10.0), "recovery_crane"),
        ("CEREMONY_ImpactSparksAnchor", (0.0, 0.0, 0.5), "impact_sparks"),
    )
    for name, loc, role in ceremony_markers:
        _empty()(
            name,
            loc,
            ceremony,
            display_type="PLAIN_AXES",
            display_size=0.55,
            sgw_kind="CEREMONY_MARKER",
            ceremony_role=role,
            animation_ready=True,
        )

    # Three freight gates (south) with pivots for open/close.
    gate_xs = (-6.5, 0.0, 6.5)
    for index, gx in enumerate(gate_xs, start=1):
        pivot = _empty()(
            f"CEREMONY_FreightGate_{index:02d}_Pivot",
            (gx - 1.7, -half_y - 0.65, armor_h / 2.0),
            ceremony,
            display_type="ARROWS",
            display_size=0.45,
            sgw_kind="CEREMONY_MARKER",
            ceremony_role="freight_gate_pivot",
            gate_index=index,
            animation_ready=True,
        )
        gate = _c()(
            f"ARENA_FreightGate_{index:02d}-collision",
            (3.2, 0.38, armor_h - 0.1),
            (1.7, 0.0, 0.0),
            materials["rail"],
            structure,
            bevel=0.05,
            sgw_kind="ARENA_STATIC",
            collision_shape="BOX",
            friction=0.45,
            restitution=0.08,
            story_role="freight_gate",
            gate_index=index,
        )
        gate.parent = pivot
        _c()(
            f"ARENA_FreightGate_{index:02d}_Stripe",
            (2.9, 0.08, 0.2),
            (gx, -half_y - 0.35, armor_h * 0.55),
            materials["hazard_stripe"],
            structure,
            bevel=0.01,
            sgw_kind="ARENA_STRUCTURE",
            collision_shape="NONE",
        )
        _c()(
            f"ARENA_FreightGate_{index:02d}_Frame",
            (3.6, 0.5, 0.28),
            (gx, -half_y - 0.65, armor_h + 0.05),
            materials["brushed"],
            structure,
            bevel=0.04,
            sgw_kind="ARENA_STRUCTURE",
            collision_shape="NONE",
        )

    # Service apron around enclosure (fair floor remains clear).
    _c()(
        "ARENA_ExteriorApron",
        (46.0, 36.0, 0.35),
        (0.0, 0.0, -0.58),
        materials["concrete"],
        collections["arena"],
        bevel=0.08,
        sgw_kind="ENVIRONMENT_STATIC",
        collision_shape="BOX",
    )

    return hazard_manifest


def build_cutting_hall(
    collection: bpy.types.Collection,
    materials: dict[str, bpy.types.Material],
    lights: bpy.types.Collection,
    add_area_light: Callable[..., bpy.types.Object],
    point_object_at: Callable[..., None],
) -> None:
    # West of arena — former hull-cutting area.
    ox, oy = -20.0, 2.0
    _c()(
        "CUTTING_HALL_Floor",
        (12.0, 14.0, 0.3),
        (ox, oy, -0.35),
        materials["concrete"],
        collection,
        bevel=0.05,
        sgw_kind="ENVIRONMENT_VISUAL",
        collision_shape="NONE",
        story_location="Cutting Hall",
    )
    # Open east face toward the arena — N/S/W walls + roof only (blockout massing).
    for name, dims, loc in (
        ("NorthWall", (12.0, 0.4, 7.0), (ox, oy + 6.8, 3.2)),
        ("SouthWall", (12.0, 0.4, 7.0), (ox, oy - 6.8, 3.2)),
        ("WestWall", (0.4, 14.0, 7.0), (ox - 5.8, oy, 3.2)),
        ("Roof", (12.0, 14.0, 0.35), (ox, oy, 6.8)),
    ):
        _c()(
            f"CUTTING_HALL_{name}",
            dims,
            loc,
            materials["rail"] if name != "Roof" else materials["blackened"],
            collection,
            bevel=0.05,
            sgw_kind="ENVIRONMENT_VISUAL",
            collision_shape="NONE",
        )
    # Fictional industrial cutter + ducts + curtains.
    _c()(
        "CUTTING_HALL_CutterFrame",
        (2.4, 1.2, 3.2),
        (ox - 1.5, oy + 1.0, 1.6),
        materials["brushed"],
        collection,
        bevel=0.06,
        sgw_kind="ENVIRONMENT_VISUAL",
        collision_shape="NONE",
        story_role="hull_cutting_equipment",
    )
    _cyl()(
        "CUTTING_HALL_CutterArm",
        0.18,
        3.5,
        (ox + 0.5, oy + 1.0, 2.8),
        materials["weapon"],
        collection,
        vertices=16,
        rotation=(0.0, math.radians(90.0), 0.0),
        bevel=0.0,
        sgw_kind="ENVIRONMENT_VISUAL",
        collision_shape="NONE",
    )
    for i, dy in enumerate((-3.0, 0.0, 3.0)):
        _cyl()(
            f"CUTTING_HALL_Duct_{i}",
            0.35,
            5.0,
            (ox - 3.5, oy + dy, 5.5),
            materials["blackened"],
            collection,
            vertices=16,
            rotation=(0.0, math.radians(90.0), 0.0),
            bevel=0.0,
            sgw_kind="ENVIRONMENT_VISUAL",
            collision_shape="NONE",
        )
        _c()(
            f"CUTTING_HALL_Curtain_{i}",
            (0.08, 2.2, 3.5),
            (ox + 4.5, oy + dy, 1.8),
            materials.get("orange_work", materials["hazard"]),
            collection,
            bevel=0.01,
            sgw_kind="ENVIRONMENT_VISUAL",
            collision_shape="NONE",
            story_role="welding_curtain",
        )
    _c()(
        "CUTTING_HALL_HoseRack",
        (0.4, 2.5, 1.8),
        (ox - 4.5, oy - 4.0, 1.0),
        materials["rubber"],
        collection,
        bevel=0.03,
        sgw_kind="ENVIRONMENT_VISUAL",
        collision_shape="NONE",
    )
    _c()(
        "CUTTING_HALL_SteelScar",
        (3.5, 0.15, 2.0),
        (ox + 2.0, oy + 6.5, 2.0),
        materials["floor_scar"],
        collection,
        bevel=0.02,
        sgw_kind="ENVIRONMENT_VISUAL",
        collision_shape="NONE",
    )
    light = add_area_light(
        "CuttingHall_WorkLight",
        (ox, oy, 5.8),
        900.0,
        4.0,
        (1.0, 0.55, 0.25),
        lights,
        shape="RECTANGLE",
        use_shadow=False,
    )
    point_object_at(light, (ox, oy, 0.5))
    _label("LABEL_CuttingHall", "CUTTING HALL", (ox, oy + 6.2, 6.5), collection, materials, size=0.55)


def build_crane_row(
    collection: bpy.types.Collection,
    materials: dict[str, bpy.types.Material],
) -> None:
    ox, oy = 0.0, 14.5
    _c()(
        "CRANE_ROW_Deck",
        (22.0, 8.0, 0.35),
        (ox, oy, -0.25),
        materials["blackened"],
        collection,
        bevel=0.06,
        sgw_kind="ENVIRONMENT_VISUAL",
        collision_shape="NONE",
        story_location="Crane Row",
    )
    # Overhead gantry + magnetic crane block.
    _c()(
        "CRANE_ROW_GantryBeam",
        (20.0, 0.55, 0.55),
        (ox, oy, 10.5),
        materials["rail"],
        collection,
        bevel=0.05,
        sgw_kind="ENVIRONMENT_VISUAL",
        collision_shape="NONE",
        story_role="overhead_magnetic_crane",
    )
    for side, x in (("W", -9.5), ("E", 9.5)):
        _c()(
            f"CRANE_ROW_Leg_{side}",
            (0.55, 0.55, 10.5),
            (x, oy, 5.0),
            materials["blackened"],
            collection,
            bevel=0.04,
            sgw_kind="ENVIRONMENT_VISUAL",
            collision_shape="NONE",
        )
    magnet = _c()(
        "CRANE_ROW_MagnetHead",
        (2.4, 2.4, 0.7),
        (2.0, oy, 7.2),
        materials["weapon"],
        collection,
        bevel=0.08,
        sgw_kind="ENVIRONMENT_VISUAL",
        collision_shape="NONE",
        story_role="magnetic_crane_head",
    )
    _empty()(
        "CEREMONY_RecoveryCrane_MagnetPivot",
        (2.0, oy, 8.5),
        collection,
        display_type="ARROWS",
        display_size=0.5,
        sgw_kind="CEREMONY_MARKER",
        ceremony_role="recovery_crane_magnet",
        animation_ready=True,
    )
    magnet.parent = bpy.data.objects.get("CEREMONY_RecoveryCrane_MagnetPivot")
    magnet.location = (0.0, 0.0, -1.3)

    for i, x in enumerate((-6.0, -2.0, 2.0, 6.0)):
        _c()(
            f"CRANE_ROW_ChainRack_{i}",
            (0.8, 1.6, 2.2),
            (x, oy - 2.5, 1.1),
            materials["brushed"],
            collection,
            bevel=0.04,
            sgw_kind="ENVIRONMENT_VISUAL",
            collision_shape="NONE",
        )
    _c()(
        "CRANE_ROW_DamagedMachinePlatform",
        (5.0, 3.2, 0.45),
        (7.5, oy - 1.5, 0.15),
        materials["rail"],
        collection,
        bevel=0.05,
        sgw_kind="ENVIRONMENT_VISUAL",
        collision_shape="NONE",
        story_role="damaged_machine_platform",
    )
    _c()(
        "CRANE_ROW_RecoveryZoneMark",
        (4.5, 3.0, 0.04),
        (-6.0, oy - 1.0, 0.02),
        materials["hazard_stripe"],
        collection,
        bevel=0.0,
        sgw_kind="ENVIRONMENT_VISUAL",
        collision_shape="NONE",
        story_role="recovery_zone",
    )
    _label("LABEL_CraneRow", "CRANE ROW", (ox, oy + 3.2, 8.8), collection, materials, size=0.6)


def build_crows_nest(
    collection: bpy.types.Collection,
    materials: dict[str, bpy.types.Material],
) -> None:
    ox, oy = 0.0, 18.5
    _c()(
        "CROWS_NEST_Room",
        (8.0, 4.5, 3.2),
        (ox, oy, 7.2),
        materials["blackened"],
        collection,
        bevel=0.08,
        sgw_kind="ENVIRONMENT_VISUAL",
        collision_shape="NONE",
        story_location="Crow's Nest",
    )
    _c()(
        "CROWS_NEST_Support",
        (2.2, 2.2, 6.0),
        (ox, oy, 2.8),
        materials["rail"],
        collection,
        bevel=0.06,
        sgw_kind="ENVIRONMENT_VISUAL",
        collision_shape="NONE",
    )
    for i, x in enumerate((-2.5, 0.0, 2.5)):
        _c()(
            f"CROWS_NEST_Window_{i}",
            (1.8, 0.12, 1.2),
            (x, oy - 2.2, 7.4),
            materials["glass"],
            collection,
            bevel=0.01,
            sgw_kind="ENVIRONMENT_VISUAL",
            collision_shape="NONE",
            story_role="industrial_window",
        )
    _c()(
        "CROWS_NEST_Console",
        (4.5, 1.2, 1.0),
        (ox, oy - 0.8, 6.2),
        materials["brushed"],
        collection,
        bevel=0.04,
        sgw_kind="ENVIRONMENT_VISUAL",
        collision_shape="NONE",
        story_role="arena_controls",
    )
    _c()(
        "CROWS_NEST_ScoreBoard",
        (3.5, 0.25, 1.4),
        (ox, oy - 2.15, 8.4),
        materials["identity_paint"],
        collection,
        bevel=0.03,
        sgw_kind="ENVIRONMENT_VISUAL",
        collision_shape="NONE",
        story_role="score_display",
    )
    for i, x in enumerate((-2.8, 2.8)):
        _cyl()(
            f"CROWS_NEST_WarningLight_{i}",
            0.25,
            0.35,
            (x, oy - 2.0, 8.9),
            materials["hazard"],
            collection,
            vertices=16,
            bevel=0.0,
            sgw_kind="ENVIRONMENT_VISUAL",
            collision_shape="NONE",
            story_role="warning_light",
        )
    _cyl()(
        "CROWS_NEST_MainSiren",
        0.45,
        0.8,
        (ox + 3.2, oy, 9.0),
        materials["hazard_stripe"],
        collection,
        vertices=20,
        bevel=0.0,
        sgw_kind="ENVIRONMENT_VISUAL",
        collision_shape="NONE",
        story_role="main_siren",
    )
    _empty()(
        "CEREMONY_MainSiren_Pivot",
        (ox + 3.2, oy, 9.0),
        collection,
        display_type="PLAIN_AXES",
        display_size=0.4,
        sgw_kind="CEREMONY_MARKER",
        ceremony_role="main_siren",
        animation_ready=True,
    )
    _label("LABEL_CrowsNest", "CROW'S NEST", (ox, oy - 2.3, 9.6), collection, materials, size=0.42)


def build_crew_bays(
    collection: bpy.types.Collection,
    materials: dict[str, bpy.types.Material],
    lights: bpy.types.Collection,
    add_area_light: Callable[..., bpy.types.Object],
    point_object_at: Callable[..., None],
) -> None:
    half_y = H["ARENA_INNER_Y"] / 2.0
    bay_specs = (
        (1, -6.5, "YARD MULE", materials["spawn_red"]),
        (2, 0.0, "KEELCUTTER", materials["spawn_blue"]),
        (3, 6.5, "PILEBREAKER", materials["spawn_gold"]),
    )
    for index, bx, crew_name, accent in bay_specs:
        oy = -half_y - 6.2
        _c()(
            f"CREW_BAY_{index:02d}_Floor",
            (5.2, 5.5, 0.28),
            (bx, oy, -0.20),
            materials["blackened"],
            collection,
            bevel=0.05,
            sgw_kind="ENVIRONMENT_VISUAL",
            collision_shape="NONE",
            story_location=f"Crew Bay {index}",
            crew_bay_index=index,
        )
        # Open bay shell toward the arena (north face open).
        for wall_name, dims, loc in (
            ("BackWall", (5.2, 0.35, 3.6), (bx, oy - 2.6, 1.7)),
            ("WestWall", (0.35, 5.5, 3.6), (bx - 2.5, oy, 1.7)),
            ("EastWall", (0.35, 5.5, 3.6), (bx + 2.5, oy, 1.7)),
            ("Roof", (5.2, 5.5, 0.3), (bx, oy, 3.6)),
        ):
            _c()(
                f"CREW_BAY_{index:02d}_{wall_name}",
                dims,
                loc,
                materials["rail"] if wall_name != "Roof" else materials["blackened"],
                collection,
                bevel=0.05,
                sgw_kind="ENVIRONMENT_VISUAL",
                collision_shape="NONE",
                crew_bay_index=index,
            )
        _c()(
            f"CREW_BAY_{index:02d}_FreightGateLeaf",
            (4.4, 0.2, 2.6),
            (bx, oy + 2.6, 1.3),
            materials["brushed"],
            collection,
            bevel=0.04,
            sgw_kind="ENVIRONMENT_VISUAL",
            collision_shape="NONE",
            story_role="crew_freight_gate",
        )
        _empty()(
            f"CEREMONY_CrewBay_{index:02d}_GatePivot",
            (bx - 2.2, oy + 2.6, 1.3),
            collection,
            display_type="ARROWS",
            display_size=0.35,
            sgw_kind="CEREMONY_MARKER",
            ceremony_role="crew_bay_gate",
            gate_index=index,
            animation_ready=True,
        )
        _c()(
            f"CREW_BAY_{index:02d}_Lift",
            (2.2, 2.0, 0.35),
            (bx, oy - 0.5, 0.1),
            materials["weapon"],
            collection,
            bevel=0.04,
            sgw_kind="ENVIRONMENT_VISUAL",
            collision_shape="NONE",
            story_role="service_lift",
        )
        _c()(
            f"CREW_BAY_{index:02d}_ArmorRack",
            (0.4, 1.8, 2.0),
            (bx - 2.0, oy - 1.5, 1.0),
            materials["blackened"],
            collection,
            bevel=0.03,
            sgw_kind="ENVIRONMENT_VISUAL",
            collision_shape="NONE",
        )
        _c()(
            f"CREW_BAY_{index:02d}_ToolCabinet",
            (1.0, 0.6, 1.6),
            (bx + 1.8, oy - 1.8, 0.8),
            accent,
            collection,
            bevel=0.03,
            sgw_kind="ENVIRONMENT_VISUAL",
            collision_shape="NONE",
            story_role="crew_panel_accent",
        )
        _c()(
            f"CREW_BAY_{index:02d}_Charger",
            (0.7, 0.5, 1.2),
            (bx + 1.8, oy + 0.5, 0.6),
            materials["brushed"],
            collection,
            bevel=0.03,
            sgw_kind="ENVIRONMENT_VISUAL",
            collision_shape="NONE",
        )
        for wi, wy in enumerate((-1.2, 0.2)):
            _cyl()(
                f"CREW_BAY_{index:02d}_SpareWheel_{wi}",
                0.35,
                0.22,
                (bx - 1.6, oy + wy, 0.35),
                materials["rubber"],
                collection,
                vertices=18,
                rotation=(math.radians(90.0), 0.0, 0.0),
                bevel=0.0,
                sgw_kind="ENVIRONMENT_VISUAL",
                collision_shape="NONE",
            )
        _c()(
            f"CREW_BAY_{index:02d}_Curtain",
            (0.08, 2.0, 2.4),
            (bx + 2.4, oy, 1.3),
            materials.get("orange_work", materials["hazard"]),
            collection,
            bevel=0.01,
            sgw_kind="ENVIRONMENT_VISUAL",
            collision_shape="NONE",
        )
        _txt()(
            f"CREW_BAY_{index:02d}_Name",
            crew_name,
            (bx, oy + 2.4, 3.4),
            0.28,
            accent,
            collection,
            rotation=(math.radians(90.0), 0.0, 0.0),
            extrude=0.015,
            sgw_kind="STORY_LABEL",
            collision_shape="NONE",
        )
        light = add_area_light(
            f"CrewBay_{index:02d}_WorkLight",
            (bx, oy, 3.6),
            500.0,
            2.2,
            (1.0, 0.9, 0.75),
            lights,
            shape="DISK",
            use_shadow=False,
        )
        point_object_at(light, (bx, oy, 0.4))
        _empty()(
            f"CEREMONY_CrewBay_{index:02d}_WorkLight",
            (bx, oy, 3.6),
            collection,
            display_type="PLAIN_AXES",
            display_size=0.3,
            sgw_kind="CEREMONY_MARKER",
            ceremony_role="crew_bay_work_light",
            gate_index=index,
            animation_ready=True,
        )
    _label("LABEL_CrewBays", "CREW BAYS", (0.0, -half_y - 8.8, 4.2), collection, materials, size=0.5)


def build_wall_of_wrecks(
    collection: bpy.types.Collection,
    materials: dict[str, bpy.types.Material],
) -> None:
    ox, oy = 18.5, 2.0
    _c()(
        "WALL_OF_WRECKS_Backboard",
        (1.2, 12.0, 5.5),
        (ox, oy, 2.6),
        materials["blackened"],
        collection,
        bevel=0.08,
        sgw_kind="ENVIRONMENT_VISUAL",
        collision_shape="NONE",
        story_location="Wall of Wrecks",
    )
    exhibits = (
        ("BentWedge", (0.9, 1.6, 0.35), materials["rail"]),
        ("SpinnerTeeth", (0.7, 0.7, 0.7), materials["weapon"]),
        ("BrokenHammerHead", (0.8, 0.8, 1.1), materials["hardened"]),
        ("ScorchedArmor", (1.2, 0.2, 1.4), materials["floor_scar"]),
        ("EmptySlotA", (1.0, 0.15, 1.2), materials["identity_paint"]),
        ("EmptySlotB", (1.0, 0.15, 1.2), materials["identity_paint"]),
    )
    for i, (name, dims, mat) in enumerate(exhibits):
        y = oy - 4.5 + i * 1.8
        _c()(
            f"WALL_OF_WRECKS_{name}",
            dims,
            (ox - 0.9, y, 2.2),
            mat,
            collection,
            bevel=0.04,
            sgw_kind="ENVIRONMENT_VISUAL",
            collision_shape="NONE",
            story_role="wreck_exhibit" if "Empty" not in name else "future_history_slot",
        )
        _c()(
            f"WALL_OF_WRECKS_Mount_{i}",
            (0.3, 0.3, 0.3),
            (ox - 0.3, y, 2.2),
            materials["brushed"],
            collection,
            bevel=0.02,
            sgw_kind="ENVIRONMENT_VISUAL",
            collision_shape="NONE",
        )
    _label("LABEL_WallOfWrecks", "WALL OF WRECKS", (ox - 0.5, oy, 5.6), collection, materials, size=0.4, rotation=(math.radians(90.0), 0.0, math.radians(-90.0)))


def build_exterior_scrapyard(
    collection: bpy.types.Collection,
    materials: dict[str, bpy.types.Material],
) -> None:
    # Coastal yard context — active industrial, not apocalypse trash dump.
    _c()(
        "EXT_WaterPlane",
        (80.0, 30.0, 0.2),
        (0.0, 32.0, -1.2),
        materials.get("water", materials["glass"]),
        collection,
        bevel=0.0,
        sgw_kind="ENVIRONMENT_VISUAL",
        collision_shape="NONE",
        story_role="dark_water",
    )
    for i, x in enumerate((-28.0, -22.0, -16.0, 16.0, 22.0, 28.0)):
        _c()(
            f"EXT_Container_{i}",
            (2.4, 6.0, 2.6),
            (x, 22.0 + (i % 2) * 3.0, 1.1),
            materials["rail"] if i % 2 == 0 else materials["blackened"],
            collection,
            bevel=0.05,
            sgw_kind="ENVIRONMENT_VISUAL",
            collision_shape="NONE",
            story_role="stacked_container",
        )
    for i, x in enumerate((-30.0, 30.0)):
        _c()(
            f"EXT_YardCrane_Mast_{i}",
            (0.7, 0.7, 16.0),
            (x, 26.0, 7.5),
            materials["blackened"],
            collection,
            bevel=0.05,
            sgw_kind="ENVIRONMENT_VISUAL",
            collision_shape="NONE",
        )
        _c()(
            f"EXT_YardCrane_Boom_{i}",
            (14.0, 0.45, 0.45),
            (x + (-7.0 if x < 0 else 7.0), 26.0, 14.5),
            materials["rail"],
            collection,
            bevel=0.04,
            sgw_kind="ENVIRONMENT_VISUAL",
            collision_shape="NONE",
        )
    # Partial skeleton of a fictional dismantled vessel (background, low cost).
    _c()(
        "EXT_VesselSkeleton_Keel",
        (28.0, 1.2, 1.0),
        (0.0, 34.0, 0.8),
        materials["oxide"] if "oxide" in materials else materials["floor_scar"],
        collection,
        bevel=0.08,
        sgw_kind="ENVIRONMENT_VISUAL",
        collision_shape="NONE",
        story_role="dismantled_vessel_skeleton",
    )
    for i, x in enumerate((-10.0, -5.0, 0.0, 5.0, 10.0)):
        _c()(
            f"EXT_VesselSkeleton_Rib_{i}",
            (0.35, 6.0, 4.5),
            (x, 34.0, 3.0),
            materials["blackened"],
            collection,
            bevel=0.04,
            sgw_kind="ENVIRONMENT_VISUAL",
            collision_shape="NONE",
        )
    for i, (x, y) in enumerate(((-24.0, -10.0), (24.0, -8.0), (-26.0, 8.0))):
        _c()(
            f"EXT_Workshop_{i}",
            (8.0, 6.0, 4.5),
            (x, y, 2.0),
            materials["concrete"],
            collection,
            bevel=0.08,
            sgw_kind="ENVIRONMENT_VISUAL",
            collision_shape="NONE",
            story_role="workshop_storage",
        )
    for i, x in enumerate((-12.0, 0.0, 12.0)):
        _cyl()(
            f"EXT_DockLight_{i}",
            0.2,
            6.0,
            (x, 28.5, 3.0),
            materials["brushed"],
            collection,
            vertices=12,
            bevel=0.0,
            sgw_kind="ENVIRONMENT_VISUAL",
            collision_shape="NONE",
            story_role="dock_light",
        )
        _c()(
            f"EXT_DockLight_Head_{i}",
            (0.8, 0.5, 0.35),
            (x, 28.5, 6.2),
            materials["light_housing"],
            collection,
            bevel=0.03,
            sgw_kind="ENVIRONMENT_VISUAL",
            collision_shape="NONE",
        )
    _c()(
        "EXT_WetApron",
        (50.0, 10.0, 0.12),
        (0.0, 24.0, -0.45),
        materials.get("wet_steel", materials["blackened"]),
        collection,
        bevel=0.0,
        sgw_kind="ENVIRONMENT_VISUAL",
        collision_shape="NONE",
        story_role="wet_industrial_surface",
    )
    _label("LABEL_ExteriorScrapyard", "BAY 13 EXTERIOR", (0.0, 30.0, 10.0), collection, materials, size=0.7)


def build_story_environment(
    collections: dict[str, bpy.types.Collection],
    materials: dict[str, bpy.types.Material],
) -> None:
    add_area_light = H["add_area_light"]
    point_object_at = H["point_object_at"]
    lights = collections["lights"]

    build_cutting_hall(collections["loc_cutting_hall"], materials, lights, add_area_light, point_object_at)
    build_crane_row(collections["loc_crane_row"], materials)
    build_crows_nest(collections["loc_crows_nest"], materials)
    build_crew_bays(collections["loc_crew_bays"], materials, lights, add_area_light, point_object_at)
    build_wall_of_wrecks(collections["loc_wall_of_wrecks"], materials)
    build_exterior_scrapyard(collections["loc_exterior"], materials)

    # Gate signage — Scrapyard fight-venue branding (not junkyard trash).
    _txt()(
        "VENUE_Title",
        "BAY 13",
        (0.0, 16.8, 12.2),
        1.1,
        materials["hazard_stripe"],
        collections["environment"],
        rotation=(math.radians(90.0), 0.0, 0.0),
        extrude=0.05,
        sgw_kind="ENVIRONMENT_VISUAL",
        collision_shape="NONE",
    )
    _txt()(
        "VENUE_Tagline",
        "THE SCRAPYARD",
        (0.0, 16.8, 10.6),
        0.65,
        materials["identity_paint"],
        collections["environment"],
        rotation=(math.radians(90.0), 0.0, 0.0),
        extrude=0.03,
        sgw_kind="ENVIRONMENT_VISUAL",
        collision_shape="NONE",
    )
    _txt()(
        "VENUE_Belief",
        "SCRAPYARD MACHINES ARE PROVEN",
        (0.0, 16.8, 9.4),
        0.32,
        materials["gold"],
        collections["environment"],
        rotation=(math.radians(90.0), 0.0, 0.0),
        extrude=0.02,
        sgw_kind="ENVIRONMENT_VISUAL",
        collision_shape="NONE",
    )


def build_arena(
    collections: dict[str, bpy.types.Collection],
    materials: dict[str, bpy.types.Material],
) -> dict[str, Any]:
    spawn_points = build_transfer_floor(collections, materials)
    build_hull_enclosure(collections, materials)
    hazards = build_hazards_and_ceremony(collections, materials)
    return {
        "working_title": H["ARENA_WORKING_TITLE"],
        "story_pass": H["ARENA_STORY_PASS"],
        "inner_dimensions_m": [H["ARENA_INNER_X"], H["ARENA_INNER_Y"], H["ARENA_WALL_HEIGHT"]],
        "floor_friction": 0.88,
        "combat_floor_role": "former_ship_transfer_platform",
        "spawn_points": spawn_points,
        "hazards": hazards,
        "story_locations": [
            "Cutting Hall",
            "Crane Row",
            "Crow's Nest",
            "Crew Bays",
            "Wall of Wrecks",
            "Exterior Scrapyard",
        ],
        "language_note": "Scrapyard means fight/brawl venue, not junk/trash dump.",
    }
