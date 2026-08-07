"""
SGW Robot Combat — Arena and Starter Bot Generator
==================================================

Target: Blender 5.2 LTS
Purpose:
    1. Build Bay 13: The Scrapyard arena story blockout (ship-transfer floor + landmarks).
    2. Build three starter robots (classes preserved): Rammer/Yard Mule,
       Ripper/Keelcutter, Maul/Pilebreaker — story blockout silhouettes.
    3. Build a reusable modular part library and attachment sockets.
    4. Save a .blend source file, glTF/GLB game assets, and a JSON manifest.

Locked arena name: BAY 13: THE SCRAPYARD
    "Scrap / Scrapyard" means fight / brawl (they scrap here), NOT junk / trash dump.
    Shipbreaking history remains accurate for industrial past.

Run in Blender:
    Scripting workspace -> New -> paste/open this file -> Run Script.

Optional output override:
    Set environment variable SGW_ROBOT_COMBAT_OUTPUT to a writable folder.
    Otherwise files are written to ~/SGW_Robot_Combat_Build.

This script creates original generic robot-combat assets. It does not copy any
television-program arena, robot, logo, trade dress, or branded game asset.
"""

from __future__ import annotations

import json
import math
import os
import traceback
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Any, Iterable, Sequence

import bpy
from mathutils import Vector


BUILD_VERSION = "0.3.0-story-blockout"
SCHEMA_VERSION = "sgw.robot_combat.assets.v1"
GAME_TITLE = "SGW Robot Combat"
ARENA_WORKING_TITLE = "BAY 13: THE SCRAPYARD"
ARENA_STORY_PASS = "STORY_BLOCKOUT"
BLENDER_TARGET = (5, 2, 0)

ARENA_INNER_X = 24.0
ARENA_INNER_Y = 16.0
ARENA_FLOOR_THICKNESS = 0.45
ARENA_WALL_HEIGHT = 4.40
ARENA_HULL_ARMOR_HEIGHT = 1.55
ARENA_GLASS_HEIGHT = ARENA_WALL_HEIGHT - ARENA_HULL_ARMOR_HEIGHT
ARENA_GLASS_THICKNESS = 0.22
ARENA_POST_SIZE = 0.70
ARENA_FRAME_DEPTH = 0.28
# Legacy aliases used by older bot/lighting helpers.
ARENA_RAIL_HEIGHT = ARENA_HULL_ARMOR_HEIGHT

OUTPUT_ROOT = Path(
    os.environ.get(
        "SGW_ROBOT_COMBAT_OUTPUT",
        str(Path.home() / "SGW_Robot_Combat_Build"),
    )
).expanduser().resolve()
EXPORT_DIR = OUTPUT_ROOT / "exports"
MANIFEST_DIR = OUTPUT_ROOT / "manifest"
BLEND_PATH = OUTPUT_ROOT / "SGW_Robot_Combat_Arena_v0_1.blend"


@dataclass(frozen=True)
class PartSpec:
    part_id: str
    display_name: str
    category: str
    mass_kg: float
    durability: float
    power_draw_kw: float
    build_cost_points: int
    attachment_group: str
    notes: str


@dataclass(frozen=True)
class BotSpec:
    bot_id: str
    display_name: str
    story_name: str
    archetype: str
    spawn: tuple[float, float, float]
    facing_degrees: float
    mass_kg: float
    drive_power_kw: float
    weapon_power_kw: float
    description: str
    unit_mark: str


PART_SPECS: tuple[PartSpec, ...] = (
    PartSpec(
        "chassis_compact",
        "Compact Chassis",
        "CHASSIS",
        26.0,
        100.0,
        0.0,
        120,
        "CHASSIS",
        "Low, compact base with four wheel sockets and universal top sockets.",
    ),
    PartSpec(
        "chassis_standard",
        "Standard Chassis",
        "CHASSIS",
        34.0,
        125.0,
        0.0,
        160,
        "CHASSIS",
        "Balanced base for wedges, hammers, lifters, and moderate spinners.",
    ),
    PartSpec(
        "wheel_drive_small",
        "Small Drive Wheel",
        "DRIVE",
        3.0,
        55.0,
        1.8,
        35,
        "WHEEL",
        "Compact wheel for light builds and four-wheel drive layouts.",
    ),
    PartSpec(
        "wheel_drive_large",
        "Large Drive Wheel",
        "DRIVE",
        4.5,
        70.0,
        2.4,
        48,
        "WHEEL",
        "Higher ground clearance and stronger pushing traction.",
    ),
    PartSpec(
        "armor_plate_flat",
        "Flat Armor Plate",
        "ARMOR",
        6.0,
        85.0,
        0.0,
        42,
        "ARMOR",
        "General-purpose protective panel.",
    ),
    PartSpec(
        "armor_wedge",
        "Front Wedge",
        "ARMOR",
        10.0,
        110.0,
        0.0,
        70,
        "FRONT",
        "Low front wedge for deflection, control, and lifting leverage.",
    ),
    PartSpec(
        "weapon_vertical_spinner",
        "Vertical Spinner",
        "WEAPON",
        18.0,
        80.0,
        8.0,
        190,
        "WEAPON_FRONT",
        "High-energy front disc. Requires a guarded weapon mount and battery capacity.",
    ),
    PartSpec(
        "weapon_hammer",
        "Overhead Hammer",
        "WEAPON",
        15.0,
        90.0,
        5.0,
        160,
        "WEAPON_TOP",
        "Powered overhead striking arm with a reinforced pivot.",
    ),
    PartSpec(
        "battery_standard",
        "Standard Battery",
        "POWER",
        8.0,
        60.0,
        -12.0,
        90,
        "INTERNAL",
        "Provides 12 kW of available power. Negative draw represents supply.",
    ),
    PartSpec(
        "motor_drive",
        "Drive Motor",
        "POWERTRAIN",
        4.0,
        65.0,
        2.4,
        60,
        "INTERNAL",
        "One motor channel for one powered wheel or linked axle.",
    ),
)

BOT_SPECS: tuple[BotSpec, ...] = (
    BotSpec(
        "rammer",
        "Rammer",
        "Yard Mule",
        "WEDGE_PUSHER",
        (-4.4, -2.2, 0.0),
        28.0,
        103.0,
        9.6,
        0.0,
        "Yard-tractor / harbor-tug language: low wide wedge, recessed drive, tow points, "
        "lifting brackets, and bolted replaceable front armor.",
        "YM-13",
    ),
    BotSpec(
        "ripper",
        "Ripper",
        "Keelcutter",
        "VERTICAL_SPINNER",
        (4.4, -2.2, 0.0),
        -28.0,
        116.0,
        9.6,
        8.0,
        "Hull-cutting language: heavy vertical cutter, teeth, shaft, bearing blocks, "
        "support cage, and armored self-weapon cavity.",
        "KC-07",
    ),
    BotSpec(
        "maul",
        "Maul",
        "Pilebreaker",
        "HAMMER",
        (0.0, 2.8, 0.0),
        180.0,
        112.0,
        9.6,
        5.0,
        "Pile-driver language: hammer tower, axle/pivot, stops, braces, impact head, "
        "counterweight, and protected drive mechanism.",
        "PB-04",
    ),
)


# Each part exposes explicit attachment data. Parent slots accept child parts;
# child mounts declare how that part connects back to an approved parent slot.
# The runtime must match compatible socket groups and rebuild this graph on the
# authoritative server instead of trusting a client-provided attachment claim.
PART_SOCKET_DEFINITIONS: dict[str, tuple[dict[str, Any], ...]] = {
    "chassis_compact": (
        {"socket_id": "WHEEL_FL", "socket_group": "WHEEL", "socket_role": "PARENT_SLOT", "location": [-1.05, 0.56, -0.02], "accepts": ["wheel_drive_small", "wheel_drive_large"]},
        {"socket_id": "WHEEL_FR", "socket_group": "WHEEL", "socket_role": "PARENT_SLOT", "location": [1.05, 0.56, -0.02], "accepts": ["wheel_drive_small", "wheel_drive_large"]},
        {"socket_id": "WHEEL_RL", "socket_group": "WHEEL", "socket_role": "PARENT_SLOT", "location": [-1.05, -0.56, -0.02], "accepts": ["wheel_drive_small", "wheel_drive_large"]},
        {"socket_id": "WHEEL_RR", "socket_group": "WHEEL", "socket_role": "PARENT_SLOT", "location": [1.05, -0.56, -0.02], "accepts": ["wheel_drive_small", "wheel_drive_large"]},
        {"socket_id": "FRONT", "socket_group": "FRONT", "socket_role": "PARENT_SLOT", "location": [0.0, 0.88, -0.12], "accepts": ["armor_wedge", "weapon_vertical_spinner"]},
        {"socket_id": "TOP_A", "socket_group": "TOP", "socket_role": "PARENT_SLOT", "location": [0.0, 0.0, 0.30], "accepts": ["armor_plate_flat", "weapon_hammer"]},
        {"socket_id": "INTERNAL_A", "socket_group": "INTERNAL", "socket_role": "PARENT_SLOT", "location": [0.0, -0.25, 0.0], "accepts": ["battery_standard", "motor_drive"]},
    ),
    "chassis_standard": (
        {"socket_id": "WHEEL_FL", "socket_group": "WHEEL", "socket_role": "PARENT_SLOT", "location": [-1.32, 0.68, -0.03], "accepts": ["wheel_drive_small", "wheel_drive_large"]},
        {"socket_id": "WHEEL_FR", "socket_group": "WHEEL", "socket_role": "PARENT_SLOT", "location": [1.32, 0.68, -0.03], "accepts": ["wheel_drive_small", "wheel_drive_large"]},
        {"socket_id": "WHEEL_RL", "socket_group": "WHEEL", "socket_role": "PARENT_SLOT", "location": [-1.32, -0.68, -0.03], "accepts": ["wheel_drive_small", "wheel_drive_large"]},
        {"socket_id": "WHEEL_RR", "socket_group": "WHEEL", "socket_role": "PARENT_SLOT", "location": [1.32, -0.68, -0.03], "accepts": ["wheel_drive_small", "wheel_drive_large"]},
        {"socket_id": "FRONT", "socket_group": "FRONT", "socket_role": "PARENT_SLOT", "location": [0.0, 1.08, -0.13], "accepts": ["armor_wedge", "weapon_vertical_spinner"]},
        {"socket_id": "TOP_A", "socket_group": "TOP", "socket_role": "PARENT_SLOT", "location": [0.0, 0.0, 0.36], "accepts": ["armor_plate_flat", "weapon_hammer"]},
        {"socket_id": "INTERNAL_A", "socket_group": "INTERNAL", "socket_role": "PARENT_SLOT", "location": [0.0, -0.32, 0.0], "accepts": ["battery_standard", "motor_drive"]},
    ),
    "wheel_drive_small": (
        {"socket_id": "MOUNT", "socket_group": "WHEEL", "socket_role": "CHILD_MOUNT", "location": [0.0, 0.0, 0.0], "accepts": []},
    ),
    "wheel_drive_large": (
        {"socket_id": "MOUNT", "socket_group": "WHEEL", "socket_role": "CHILD_MOUNT", "location": [0.0, 0.0, 0.0], "accepts": []},
    ),
    "armor_plate_flat": (
        {"socket_id": "MOUNT_BOTTOM", "socket_group": "TOP", "socket_role": "CHILD_MOUNT", "location": [0.0, 0.0, -0.07], "accepts": []},
    ),
    "armor_wedge": (
        {"socket_id": "MOUNT_REAR", "socket_group": "FRONT", "socket_role": "CHILD_MOUNT", "location": [0.0, -0.55, 0.20], "accepts": []},
    ),
    "weapon_vertical_spinner": (
        {"socket_id": "MOUNT_AXLE", "socket_group": "FRONT", "socket_role": "CHILD_MOUNT", "location": [0.0, 0.0, 0.0], "accepts": []},
    ),
    "weapon_hammer": (
        {"socket_id": "MOUNT_PIVOT", "socket_group": "TOP", "socket_role": "CHILD_MOUNT", "location": [0.0, -0.90, -0.22], "accepts": []},
    ),
    "battery_standard": (
        {"socket_id": "MOUNT_INTERNAL", "socket_group": "INTERNAL", "socket_role": "CHILD_MOUNT", "location": [0.0, 0.0, 0.0], "accepts": []},
    ),
    "motor_drive": (
        {"socket_id": "MOUNT_INTERNAL", "socket_group": "INTERNAL", "socket_role": "CHILD_MOUNT", "location": [0.0, 0.0, 0.0], "accepts": []},
    ),
}


# ---------------------------------------------------------------------------
# Core scene helpers
# ---------------------------------------------------------------------------


def log(message: str) -> None:
    print(f"[SGW ROBOT COMBAT] {message}")


def ensure_supported_blender() -> None:
    version = tuple(int(v) for v in bpy.app.version[:3])
    if version < (4, 2, 0):
        raise RuntimeError(
            f"This generator requires Blender 4.2 or newer. Found {version}. "
            "Blender 5.2 LTS is the tested target."
        )
    if version < BLENDER_TARGET:
        log(
            f"Warning: running Blender {version}; tested target is "
            f"{BLENDER_TARGET}. The build will continue."
        )


def prepare_output_folders() -> None:
    for folder in (OUTPUT_ROOT, EXPORT_DIR, MANIFEST_DIR):
        folder.mkdir(parents=True, exist_ok=True)


def reset_scene() -> None:
    """Remove all scene objects and orphaned project data for a deterministic build."""
    if bpy.context.object is not None and bpy.context.object.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")

    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)

    # Remove child collections while preserving the Scene Collection root.
    for collection in list(bpy.data.collections):
        bpy.data.collections.remove(collection)

    # Clean common data blocks so repeated runs do not append .001 names.
    for block_group in (
        bpy.data.meshes,
        bpy.data.curves,
        bpy.data.cameras,
        bpy.data.lights,
        bpy.data.materials,
    ):
        for block in list(block_group):
            if block.users == 0:
                block_group.remove(block)


def new_collection(name: str, parent: bpy.types.Collection | None = None) -> bpy.types.Collection:
    collection = bpy.data.collections.get(name)
    if collection is None:
        collection = bpy.data.collections.new(name)
    target_parent = parent or bpy.context.scene.collection
    if collection.name not in {child.name for child in target_parent.children}:
        target_parent.children.link(collection)
    return collection


def move_to_collection(obj: bpy.types.Object, collection: bpy.types.Collection) -> None:
    for existing in list(obj.users_collection):
        existing.objects.unlink(obj)
    collection.objects.link(obj)


def select_only(objects: Iterable[bpy.types.Object]) -> None:
    bpy.ops.object.select_all(action="DESELECT")
    objects = list(objects)
    for obj in objects:
        obj.hide_set(False)
        obj.select_set(True)
    if objects:
        bpy.context.view_layer.objects.active = objects[0]


def apply_scale(obj: bpy.types.Object) -> None:
    select_only([obj])
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)


def add_bevel(obj: bpy.types.Object, width: float = 0.05, segments: int = 3) -> None:
    if obj.type != "MESH" or width <= 0:
        return
    modifier = obj.modifiers.new(name="SGW Edge Softening", type="BEVEL")
    modifier.width = width
    modifier.segments = segments
    modifier.limit_method = "ANGLE"


def id_property_value(value: Any) -> Any:
    """Convert Python values to Blender-safe custom-property values.

    Blender ID-property arrays are dependable for numeric data. String lists
    and nested structures are encoded as compact JSON so the GLB exporter can
    preserve them without depending on unsupported array element types.
    """
    if isinstance(value, tuple):
        value = list(value)
    if isinstance(value, list):
        if all(isinstance(item, (bool, int, float)) for item in value):
            return value
        return json.dumps(value, separators=(",", ":"), sort_keys=True)
    if isinstance(value, dict):
        return json.dumps(value, separators=(",", ":"), sort_keys=True)
    return value


def tag_object(obj: bpy.types.Object, **properties: Any) -> bpy.types.Object:
    obj["sgw_schema"] = SCHEMA_VERSION
    obj["sgw_build_version"] = BUILD_VERSION
    for key, value in properties.items():
        if value is None:
            continue
        obj[key] = id_property_value(value)
    return obj


def create_material(
    name: str,
    rgba: tuple[float, float, float, float],
    *,
    metallic: float = 0.0,
    roughness: float = 0.45,
    emission_strength: float = 0.0,
    grit: bool = False,
    grit_scale: float = 48.0,
) -> bpy.types.Material:
    material = bpy.data.materials.new(name=name)
    material.use_nodes = True
    material.diffuse_color = rgba

    nodes = material.node_tree.nodes
    links = material.node_tree.links
    principled = nodes.get("Principled BSDF")
    if principled is not None:
        if "Base Color" in principled.inputs:
            principled.inputs["Base Color"].default_value = rgba
        if "Metallic" in principled.inputs:
            principled.inputs["Metallic"].default_value = metallic
        if "Roughness" in principled.inputs:
            principled.inputs["Roughness"].default_value = roughness
        if "Alpha" in principled.inputs:
            principled.inputs["Alpha"].default_value = rgba[3]
        emission_input = principled.inputs.get("Emission Color")
        if emission_input is None:
            emission_input = principled.inputs.get("Emission")
        if emission_input is not None and emission_strength > 0:
            emission_input.default_value = rgba
        emission_strength_input = principled.inputs.get("Emission Strength")
        if emission_strength_input is not None:
            emission_strength_input.default_value = emission_strength

        if grit:
            # Procedural grit: darken base color slightly and roughen worn patches.
            noise = nodes.new("ShaderNodeTexNoise")
            noise.location = (-520, 40)
            noise.inputs["Scale"].default_value = grit_scale
            noise.inputs["Detail"].default_value = 14.0
            noise.inputs["Roughness"].default_value = 0.62
            if "Distortion" in noise.inputs:
                noise.inputs["Distortion"].default_value = 0.35

            color_ramp = nodes.new("ShaderNodeValToRGB")
            color_ramp.location = (-280, 40)
            color_ramp.color_ramp.elements[0].position = 0.22
            color_ramp.color_ramp.elements[0].color = (0.42, 0.42, 0.44, 1.0)
            color_ramp.color_ramp.elements[1].position = 0.82
            color_ramp.color_ramp.elements[1].color = (1.0, 1.0, 1.0, 1.0)

            mix_color = nodes.new("ShaderNodeMix")
            mix_color.location = (-60, 160)
            mix_color.data_type = "RGBA"
            mix_color.blend_type = "MULTIPLY"
            mix_color.inputs["Factor"].default_value = 0.62
            mix_color.inputs["A"].default_value = rgba
            links.new(noise.outputs["Fac"], color_ramp.inputs["Fac"])
            links.new(color_ramp.outputs["Color"], mix_color.inputs["B"])
            links.new(mix_color.outputs["Result"], principled.inputs["Base Color"])

            rough_mix = nodes.new("ShaderNodeMix")
            rough_mix.location = (-60, -40)
            rough_mix.data_type = "FLOAT"
            rough_mix.inputs["A"].default_value = max(0.08, roughness - 0.08)
            rough_mix.inputs["B"].default_value = min(0.95, roughness + 0.28)
            links.new(noise.outputs["Fac"], rough_mix.inputs["Factor"])
            links.new(rough_mix.outputs["Result"], principled.inputs["Roughness"])

    if rgba[3] < 1.0:
        # Prefer blended transparency so safety glass does not read as frosted noise.
        if hasattr(material, "surface_render_method"):
            try:
                material.surface_render_method = "BLENDED"
            except (TypeError, ValueError):
                try:
                    material.surface_render_method = "DITHERED"
                except (TypeError, ValueError):
                    pass
        elif hasattr(material, "blend_method"):
            material.blend_method = "BLEND"
        if hasattr(material, "use_transparency_overlap"):
            material.use_transparency_overlap = False
        if hasattr(material, "use_backface_culling"):
            material.use_backface_culling = True

    return material


def assign_material(obj: bpy.types.Object, material: bpy.types.Material) -> None:
    if obj.type != "MESH":
        return
    obj.data.materials.clear()
    obj.data.materials.append(material)


def create_empty(
    name: str,
    location: Sequence[float],
    collection: bpy.types.Collection,
    *,
    parent: bpy.types.Object | None = None,
    display_type: str = "PLAIN_AXES",
    display_size: float = 0.35,
    **tags: Any,
) -> bpy.types.Object:
    obj = bpy.data.objects.new(name, None)
    obj.empty_display_type = display_type
    obj.empty_display_size = display_size
    obj.location = Vector(location)
    collection.objects.link(obj)
    if parent is not None:
        obj.parent = parent
    return tag_object(obj, **tags)


def create_box(
    name: str,
    dimensions: Sequence[float],
    location: Sequence[float],
    material: bpy.types.Material,
    collection: bpy.types.Collection,
    *,
    rotation: Sequence[float] = (0.0, 0.0, 0.0),
    bevel: float = 0.04,
    parent: bpy.types.Object | None = None,
    **tags: Any,
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=location)
    obj = bpy.context.active_object
    obj.name = name
    obj.dimensions = Vector(dimensions)
    apply_scale(obj)
    obj.rotation_euler = rotation
    move_to_collection(obj, collection)
    if parent is not None:
        obj.parent = parent
    assign_material(obj, material)
    add_bevel(obj, bevel)
    return tag_object(obj, primitive="BOX", dimensions=list(dimensions), **tags)


def create_cylinder(
    name: str,
    radius: float,
    depth: float,
    location: Sequence[float],
    material: bpy.types.Material,
    collection: bpy.types.Collection,
    *,
    rotation: Sequence[float] = (0.0, 0.0, 0.0),
    vertices: int = 48,
    bevel: float = 0.025,
    parent: bpy.types.Object | None = None,
    smooth: bool = False,
    **tags: Any,
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=vertices,
        radius=radius,
        depth=depth,
        location=location,
        rotation=rotation,
    )
    obj = bpy.context.active_object
    obj.name = name
    apply_scale(obj)
    move_to_collection(obj, collection)
    if parent is not None:
        obj.parent = parent
    assign_material(obj, material)
    add_bevel(obj, bevel)
    if smooth:
        for polygon in obj.data.polygons:
            polygon.use_smooth = True
    return tag_object(
        obj,
        primitive="CYLINDER",
        radius=radius,
        depth=depth,
        **tags,
    )


def create_torus(
    name: str,
    major_radius: float,
    minor_radius: float,
    location: Sequence[float],
    material: bpy.types.Material,
    collection: bpy.types.Collection,
    *,
    rotation: Sequence[float] = (0.0, 0.0, 0.0),
    parent: bpy.types.Object | None = None,
    **tags: Any,
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_torus_add(
        major_radius=major_radius,
        minor_radius=minor_radius,
        major_segments=64,
        minor_segments=12,
        location=location,
        rotation=rotation,
    )
    obj = bpy.context.active_object
    obj.name = name
    move_to_collection(obj, collection)
    if parent is not None:
        obj.parent = parent
    assign_material(obj, material)
    for polygon in obj.data.polygons:
        polygon.use_smooth = True
    return tag_object(obj, primitive="TORUS", **tags)


def create_wedge(
    name: str,
    width: float,
    length: float,
    height: float,
    location: Sequence[float],
    material: bpy.types.Material,
    collection: bpy.types.Collection,
    *,
    rotation: Sequence[float] = (0.0, 0.0, 0.0),
    parent: bpy.types.Object | None = None,
    **tags: Any,
) -> bpy.types.Object:
    """Create a triangular-prism wedge pointing toward local +Y."""
    half_w = width / 2.0
    half_l = length / 2.0
    vertices = [
        (-half_w, -half_l, 0.0),
        (half_w, -half_l, 0.0),
        (-half_w, half_l, 0.0),
        (half_w, half_l, 0.0),
        (-half_w, -half_l, height),
        (half_w, -half_l, height),
    ]
    faces = [
        (0, 1, 3, 2),       # bottom
        (0, 4, 5, 1),       # rear
        (0, 2, 4),          # left
        (1, 5, 3),          # right
        (2, 3, 5, 4),       # slope
    ]
    mesh = bpy.data.meshes.new(f"{name}_Mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    obj.location = Vector(location)
    obj.rotation_euler = rotation
    collection.objects.link(obj)
    if parent is not None:
        obj.parent = parent
    assign_material(obj, material)
    add_bevel(obj, min(width, length, height) * 0.035, segments=2)
    return tag_object(
        obj,
        primitive="WEDGE",
        dimensions=[width, length, height],
        **tags,
    )


def create_text(
    name: str,
    body: str,
    location: Sequence[float],
    size: float,
    material: bpy.types.Material,
    collection: bpy.types.Collection,
    *,
    rotation: Sequence[float] = (0.0, 0.0, 0.0),
    extrude: float = 0.025,
    align_x: str = "CENTER",
    align_y: str = "CENTER",
    parent: bpy.types.Object | None = None,
    **tags: Any,
) -> bpy.types.Object:
    curve = bpy.data.curves.new(type="FONT", name=f"{name}_Curve")
    curve.body = body
    curve.align_x = align_x
    curve.align_y = align_y
    curve.size = size
    curve.extrude = extrude
    curve.bevel_depth = 0.006
    obj = bpy.data.objects.new(name, curve)
    obj.location = Vector(location)
    obj.rotation_euler = rotation
    collection.objects.link(obj)
    if parent is not None:
        obj.parent = parent
    curve.materials.append(material)
    return tag_object(obj, primitive="TEXT", text=body, **tags)


# ---------------------------------------------------------------------------
# World, arena, lighting, and cameras
# ---------------------------------------------------------------------------


def configure_scene() -> None:
    scene = bpy.context.scene
    scene.unit_settings.system = "METRIC"
    scene.unit_settings.scale_length = 1.0
    # Blender 5.2 LTS: use BLENDER_EEVEE (not EEVEE_NEXT).
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 1920
    scene.render.resolution_y = 1080
    scene.render.resolution_percentage = 70
    scene.render.image_settings.file_format = "PNG"
    scene.render.film_transparent = False
    scene.view_settings.view_transform = "Standard"
    scene.view_settings.look = "None"
    scene.view_settings.exposure = 0.05
    scene.view_settings.gamma = 1.0

    eevee = getattr(scene, "eevee", None)
    if eevee is not None:
        for attr, value in (
            ("use_shadows", True),
            ("use_raytracing", True),
            ("use_volumetric_shadows", False),
            ("taa_render_samples", 64),
            ("use_bloom", False),
            ("bloom_intensity", 0.05),
        ):
            if hasattr(eevee, attr):
                try:
                    setattr(eevee, attr, value)
                except (TypeError, ValueError, AttributeError):
                    pass

    scene["sgw_schema"] = SCHEMA_VERSION
    scene["sgw_build_version"] = BUILD_VERSION
    scene["sgw_game_title"] = GAME_TITLE
    scene["sgw_platform_side"] = "FREE"
    scene["sgw_value_class"] = "NO_VALUE"
    scene["sgw_units"] = "METERS_KILOGRAMS_SECONDS"

    world = scene.world or bpy.data.worlds.new("SGW World")
    scene.world = world
    world.use_nodes = True
    background = world.node_tree.nodes.get("Background")
    if background is not None:
        # Dim industrial venue ambient — drama without hiding metal work.
        background.inputs["Color"].default_value = (0.028, 0.032, 0.042, 1.0)
        background.inputs["Strength"].default_value = 0.32
    scene.view_settings.exposure = -0.15


def build_materials() -> dict[str, bpy.types.Material]:
    return {
        "floor": create_material(
            "MAT_ArenaFloor",
            (0.035, 0.038, 0.042, 1.0),
            metallic=0.72,
            roughness=0.78,
            grit=True,
            grit_scale=28.0,
        ),
        "floor_plate": create_material(
            "MAT_FloorPlate",
            (0.055, 0.058, 0.065, 1.0),
            metallic=0.78,
            roughness=0.70,
            grit=True,
            grit_scale=42.0,
        ),
        "floor_seam": create_material(
            "MAT_FloorSeam",
            (0.018, 0.019, 0.022, 1.0),
            metallic=0.45,
            roughness=0.88,
        ),
        "floor_scar": create_material(
            "MAT_FloorScar",
            (0.08, 0.075, 0.07, 1.0),
            metallic=0.55,
            roughness=0.82,
            grit=True,
            grit_scale=120.0,
        ),
        "tire_mark": create_material(
            "MAT_TireMark",
            (0.012, 0.012, 0.014, 1.0),
            metallic=0.05,
            roughness=0.95,
        ),
        "rail": create_material(
            "MAT_ArmoredSteel",
            (0.10, 0.11, 0.125, 1.0),
            metallic=0.90,
            roughness=0.42,
            grit=True,
            grit_scale=18.0,
        ),
        "blackened": create_material(
            "MAT_BlackenedSteel",
            (0.045, 0.048, 0.055, 1.0),
            metallic=0.88,
            roughness=0.48,
            grit=True,
            grit_scale=35.0,
        ),
        "brushed": create_material(
            "MAT_BrushedMetal",
            (0.28, 0.30, 0.33, 1.0),
            metallic=0.94,
            roughness=0.34,
            grit=True,
            grit_scale=80.0,
        ),
        "glass": create_material(
            "MAT_SafetyPolycarb",
            (0.48, 0.58, 0.66, 0.07),
            metallic=0.0,
            roughness=0.03,
        ),
        "chassis": create_material(
            "MAT_ChassisSteel",
            (0.12, 0.13, 0.15, 1.0),
            metallic=0.86,
            roughness=0.52,
            grit=True,
            grit_scale=70.0,
        ),
        "black": create_material(
            "MAT_Black",
            (0.035, 0.038, 0.042, 1.0),
            metallic=0.70,
            roughness=0.45,
            grit=True,
            grit_scale=60.0,
        ),
        "white": create_material("MAT_White", (0.28, 0.30, 0.32, 1.0), metallic=0.08, roughness=0.74),
        "marking_white": create_material(
            "MAT_MarkingPaint",
            (0.18, 0.19, 0.21, 1.0),
            metallic=0.04,
            roughness=0.88,
        ),
        "identity_paint": create_material(
            "MAT_IdentityPaint",
            (0.14, 0.15, 0.17, 1.0),
            metallic=0.10,
            roughness=0.82,
        ),
        "red": create_material(
            "MAT_RedArmor",
            (0.38, 0.045, 0.04, 1.0),
            metallic=0.62,
            roughness=0.42,
            grit=True,
            grit_scale=48.0,
        ),
        "blue": create_material(
            "MAT_BlueArmor",
            (0.05, 0.16, 0.42, 1.0),
            metallic=0.62,
            roughness=0.42,
            grit=True,
            grit_scale=48.0,
        ),
        "gold": create_material(
            "MAT_AmberArmor",
            (0.48, 0.28, 0.06, 1.0),
            metallic=0.68,
            roughness=0.40,
            grit=True,
            grit_scale=48.0,
        ),
        "green": create_material("MAT_Green", (0.05, 0.32, 0.18, 1.0), metallic=0.35, roughness=0.45),
        "rubber": create_material("MAT_Rubber", (0.02, 0.022, 0.025, 1.0), metallic=0.0, roughness=0.96),
        "weapon": create_material(
            "MAT_WeaponSteel",
            (0.34, 0.36, 0.40, 1.0),
            metallic=0.97,
            roughness=0.18,
            grit=True,
            grit_scale=110.0,
        ),
        "hardened": create_material(
            "MAT_HardenedEdge",
            (0.48, 0.50, 0.54, 1.0),
            metallic=0.98,
            roughness=0.12,
            grit=True,
            grit_scale=140.0,
        ),
        "spawn_red": create_material(
            "MAT_SpawnRed",
            (0.28, 0.06, 0.05, 1.0),
            metallic=0.10,
            roughness=0.80,
            emission_strength=0.0,
        ),
        "spawn_blue": create_material(
            "MAT_SpawnBlue",
            (0.05, 0.12, 0.32, 1.0),
            metallic=0.10,
            roughness=0.80,
            emission_strength=0.0,
        ),
        "spawn_gold": create_material(
            "MAT_SpawnGold",
            (0.36, 0.22, 0.05, 1.0),
            metallic=0.10,
            roughness=0.80,
            emission_strength=0.0,
        ),
        "light": create_material(
            "MAT_LightPanel",
            (0.32, 0.34, 0.38, 1.0),
            metallic=0.05,
            roughness=0.60,
            emission_strength=0.06,
        ),
        "light_housing": create_material(
            "MAT_LightHousing",
            (0.05, 0.055, 0.065, 1.0),
            metallic=0.82,
            roughness=0.48,
        ),
        "hazard": create_material(
            "MAT_InactiveHazard",
            (0.42, 0.22, 0.04, 1.0),
            metallic=0.40,
            roughness=0.58,
            grit=True,
            grit_scale=30.0,
        ),
        "hazard_stripe": create_material(
            "MAT_HazardStripe",
            (0.55, 0.42, 0.06, 1.0),
            metallic=0.18,
            roughness=0.65,
        ),
        "concrete": create_material(
            "MAT_ServiceConcrete",
            (0.12, 0.12, 0.125, 1.0),
            metallic=0.05,
            roughness=0.90,
            grit=True,
            grit_scale=20.0,
        ),
        "transparent_marker": create_material(
            "MAT_Marker",
            (0.35, 0.75, 0.95, 0.18),
            metallic=0.0,
            roughness=0.35,
        ),
        "collision_viz": create_material(
            "MAT_CollisionViz",
            (0.85, 0.18, 0.08, 0.35),
            metallic=0.0,
            roughness=0.40,
        ),
        "socket_viz": create_material(
            "MAT_SocketViz",
            (0.15, 0.75, 0.55, 1.0),
            metallic=0.20,
            roughness=0.35,
            emission_strength=0.35,
        ),
        "oxide": create_material(
            "MAT_OxideSalt",
            (0.22, 0.12, 0.07, 1.0),
            metallic=0.35,
            roughness=0.82,
            grit=True,
            grit_scale=40.0,
        ),
        "wet_steel": create_material(
            "MAT_WetSteel",
            (0.06, 0.07, 0.08, 1.0),
            metallic=0.85,
            roughness=0.28,
            grit=True,
            grit_scale=25.0,
        ),
        "water": create_material(
            "MAT_DarkWater",
            (0.03, 0.05, 0.08, 0.85),
            metallic=0.05,
            roughness=0.12,
        ),
        "orange_work": create_material(
            "MAT_OrangeWorkLight",
            (0.55, 0.22, 0.05, 1.0),
            metallic=0.15,
            roughness=0.70,
            emission_strength=0.12,
        ),
    }


def _add_floor_wear(
    markings: bpy.types.Collection,
    materials: dict[str, bpy.types.Material],
) -> None:
    """Controlled scrape, tire, and impact wear on the fighting floor."""
    tire_marks = (
        (-4.8, -1.2, 3.2, 0.18, 18.0),
        (3.6, 1.8, 2.8, 0.16, -22.0),
        (-1.5, 2.4, 2.2, 0.14, 55.0),
        (5.8, -3.5, 2.6, 0.15, 8.0),
        (-6.2, 3.0, 1.8, 0.12, -40.0),
        (0.8, -4.2, 2.4, 0.14, 70.0),
        (2.2, 0.4, 1.6, 0.11, -12.0),
        (-3.0, -3.8, 2.0, 0.13, 35.0),
    )
    for index, (x, y, length, width, angle) in enumerate(tire_marks):
        create_box(
            f"FLOOR_TIRE_{index:02d}",
            (width, length, 0.01),
            (x, y, 0.048),
            materials["tire_mark"],
            markings,
            bevel=0.0,
            rotation=(0.0, 0.0, math.radians(angle)),
            sgw_kind="ARENA_MARKING",
            collision_shape="NONE",
        )

    scars = (
        (-2.4, 1.1, 1.4, 0.35, 28.0),
        (4.1, -2.0, 1.1, 0.28, -15.0),
        (-7.2, -0.5, 0.9, 0.42, 60.0),
        (6.5, 2.8, 1.2, 0.30, 10.0),
        (1.2, 4.0, 0.8, 0.55, -35.0),
        (-0.6, -5.5, 1.0, 0.25, 5.0),
        (-5.5, 0.8, 1.8, 0.22, -8.0),
        (3.0, -4.8, 1.5, 0.26, 42.0),
    )
    for index, (x, y, length, width, angle) in enumerate(scars):
        create_box(
            f"FLOOR_SCAR_{index:02d}",
            (width, length, 0.012),
            (x, y, 0.050),
            materials["floor_scar"],
            markings,
            bevel=0.01,
            rotation=(0.0, 0.0, math.radians(angle)),
            sgw_kind="ARENA_MARKING",
            collision_shape="NONE",
        )

    for index, (x, y, radius) in enumerate(
        ((-8.2, 4.8, 0.35), (8.0, -4.6, 0.42), (-3.8, -5.2, 0.28), (2.6, 5.0, 0.32), (7.4, 3.2, 0.25))
    ):
        create_cylinder(
            f"FLOOR_DENT_{index:02d}",
            radius,
            0.025,
            (x, y, 0.040),
            materials["blackened"],
            markings,
            vertices=24,
            bevel=0.0,
            sgw_kind="ARENA_MARKING",
            collision_shape="NONE",
        )


def _load_bay13_world():
    import importlib.util

    module_path = Path(__file__).resolve().parent / "sgw_bay13_scrapyard_world.py"
    spec = importlib.util.spec_from_file_location("sgw_bay13_scrapyard_world", module_path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Unable to load Bay 13 world module from {module_path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    module.bind_host(
        {
            "create_box": create_box,
            "create_cylinder": create_cylinder,
            "create_torus": create_torus,
            "create_text": create_text,
            "create_empty": create_empty,
            "_add_floor_wear": _add_floor_wear,
            "add_area_light": add_area_light,
            "point_object_at": point_object_at,
            "BOT_SPECS": BOT_SPECS,
            "ARENA_INNER_X": ARENA_INNER_X,
            "ARENA_INNER_Y": ARENA_INNER_Y,
            "ARENA_FLOOR_THICKNESS": ARENA_FLOOR_THICKNESS,
            "ARENA_WALL_HEIGHT": ARENA_WALL_HEIGHT,
            "ARENA_HULL_ARMOR_HEIGHT": ARENA_HULL_ARMOR_HEIGHT,
            "ARENA_GLASS_HEIGHT": ARENA_GLASS_HEIGHT,
            "ARENA_GLASS_THICKNESS": ARENA_GLASS_THICKNESS,
            "ARENA_POST_SIZE": ARENA_POST_SIZE,
            "ARENA_FRAME_DEPTH": ARENA_FRAME_DEPTH,
            "ARENA_WORKING_TITLE": ARENA_WORKING_TITLE,
            "ARENA_STORY_PASS": ARENA_STORY_PASS,
        }
    )
    return module


_BAY13_WORLD = None


def _bay13_world():
    global _BAY13_WORLD
    if _BAY13_WORLD is None:
        _BAY13_WORLD = _load_bay13_world()
    return _BAY13_WORLD


def build_arena(
    collections: dict[str, bpy.types.Collection],
    materials: dict[str, bpy.types.Material],
) -> dict[str, Any]:
    """Bay 13: The Scrapyard story blockout (transfer floor + hull enclosure + hazards/ceremony)."""
    return _bay13_world().build_arena(collections, materials)


def _legacy_build_arena_glassbox_UNUSED(
    collections: dict[str, bpy.types.Collection],
    materials: dict[str, bpy.types.Material],
) -> dict[str, Any]:
    arena = collections["arena"]
    structure = collections["arena_structure"]
    markings = collections["arena_markings"]

    create_box(
        "ARENA_Floor-collision",
        (ARENA_INNER_X, ARENA_INNER_Y, ARENA_FLOOR_THICKNESS),
        (0.0, 0.0, -ARENA_FLOOR_THICKNESS / 2.0),
        materials["floor"],
        arena,
        bevel=0.03,
        sgw_kind="ARENA_STATIC",
        collision_shape="BOX",
        friction=0.88,
        restitution=0.04,
    )

    # Dark competition-steel panels with deep seams and removable-panel look.
    plate_w, plate_d = 3.0, 2.5
    plate_gap = 0.08
    x_start = -ARENA_INNER_X / 2.0 + plate_w / 2.0 + 0.20
    y_start = -ARENA_INNER_Y / 2.0 + plate_d / 2.0 + 0.20
    plate_index = 0
    y = y_start
    while y < ARENA_INNER_Y / 2.0 - 0.15:
        x = x_start
        while x < ARENA_INNER_X / 2.0 - 0.15:
            create_box(
                f"FLOOR_PLATE_{plate_index:03d}",
                (plate_w - plate_gap, plate_d - plate_gap, 0.035),
                (x, y, 0.018),
                materials["floor_plate"],
                markings,
                bevel=0.015,
                sgw_kind="ARENA_MARKING",
                collision_shape="NONE",
            )
            # Removable-panel lift sockets (visual).
            for ox, oy in ((-0.95, -0.75), (0.95, -0.75), (-0.95, 0.75), (0.95, 0.75)):
                create_cylinder(
                    f"FLOOR_PLATE_{plate_index:03d}_SOCKET_{ox:+.0f}_{oy:+.0f}",
                    0.08,
                    0.02,
                    (x + ox, y + oy, 0.038),
                    materials["brushed"],
                    markings,
                    vertices=16,
                    bevel=0.0,
                    sgw_kind="ARENA_MARKING",
                    collision_shape="NONE",
                )
            plate_index += 1
            x += plate_w
        y += plate_d

    for gx in range(-11, 12, 3):
        create_box(
            f"SEAM_X_{gx:+03d}",
            (0.07, ARENA_INNER_Y - 0.30, 0.014),
            (float(gx), 0.0, 0.008),
            materials["floor_seam"],
            markings,
            bevel=0.0,
            sgw_kind="ARENA_MARKING",
            collision_shape="NONE",
        )
    for gy in range(-7, 8, 2):
        create_box(
            f"SEAM_Y_{gy:+03d}",
            (ARENA_INNER_X - 0.30, 0.07, 0.014),
            (0.0, float(gy), 0.008),
            materials["floor_seam"],
            markings,
            bevel=0.0,
            sgw_kind="ARENA_MARKING",
            collision_shape="NONE",
        )

    _add_floor_wear(markings, materials)

    half_x = ARENA_INNER_X / 2.0
    half_y = ARENA_INNER_Y / 2.0
    wall_thickness = 0.95
    rail_z = ARENA_RAIL_HEIGHT / 2.0

    # Thick armored lower steel walls (not a thin kick-rail playpen).
    rail_specs = (
        ("North", (ARENA_INNER_X + wall_thickness * 2, wall_thickness, ARENA_RAIL_HEIGHT), (0.0, half_y + wall_thickness / 2, rail_z)),
        ("South", (ARENA_INNER_X + wall_thickness * 2, wall_thickness, ARENA_RAIL_HEIGHT), (0.0, -half_y - wall_thickness / 2, rail_z)),
        ("East", (wall_thickness, ARENA_INNER_Y, ARENA_RAIL_HEIGHT), (half_x + wall_thickness / 2, 0.0, rail_z)),
        ("West", (wall_thickness, ARENA_INNER_Y, ARENA_RAIL_HEIGHT), (-half_x - wall_thickness / 2, 0.0, rail_z)),
    )
    for side, dimensions, location in rail_specs:
        create_box(
            f"ARENA_{side}_KickRail-collision",
            dimensions,
            location,
            materials["blackened"],
            structure,
            bevel=0.08,
            sgw_kind="ARENA_STATIC",
            collision_shape="BOX",
            friction=0.48,
            restitution=0.10,
        )
        # Impact armor cladding on the inner face.
        if side == "North":
            clad_loc = (0.0, half_y + 0.12, rail_z)
            clad_dims = (ARENA_INNER_X - 0.4, 0.16, ARENA_RAIL_HEIGHT - 0.18)
        elif side == "South":
            clad_loc = (0.0, -half_y - 0.12, rail_z)
            clad_dims = (ARENA_INNER_X - 0.4, 0.16, ARENA_RAIL_HEIGHT - 0.18)
        elif side == "East":
            clad_loc = (half_x + 0.12, 0.0, rail_z)
            clad_dims = (0.16, ARENA_INNER_Y - 0.4, ARENA_RAIL_HEIGHT - 0.18)
        else:
            clad_loc = (-half_x - 0.12, 0.0, rail_z)
            clad_dims = (0.16, ARENA_INNER_Y - 0.4, ARENA_RAIL_HEIGHT - 0.18)
        create_box(
            f"ARENA_{side}_ImpactClad",
            clad_dims,
            clad_loc,
            materials["rail"],
            structure,
            bevel=0.04,
            sgw_kind="ARENA_STRUCTURE",
            collision_shape="NONE",
        )
        stripe_dims = (
            (dimensions[0] * 0.92, 0.08, 0.16)
            if side in ("North", "South")
            else (0.08, dimensions[1] * 0.92, 0.16)
        )
        if side == "North":
            stripe_loc = (location[0], location[1] - 0.30, ARENA_RAIL_HEIGHT * 0.72)
        elif side == "South":
            stripe_loc = (location[0], location[1] + 0.30, ARENA_RAIL_HEIGHT * 0.72)
        elif side == "East":
            stripe_loc = (location[0] - 0.30, location[1], ARENA_RAIL_HEIGHT * 0.72)
        else:
            stripe_loc = (location[0] + 0.30, location[1], ARENA_RAIL_HEIGHT * 0.72)
        create_box(
            f"ARENA_{side}_RailStripe",
            stripe_dims,
            stripe_loc,
            materials["hazard_stripe"],
            structure,
            bevel=0.01,
            sgw_kind="ARENA_STRUCTURE",
            collision_shape="NONE",
        )

    glass_z = ARENA_RAIL_HEIGHT + ARENA_GLASS_HEIGHT / 2.0
    # Framed polycarbonate panels in bay segments (not one thin aquarium sheet).
    bay_xs = (-10.0, -6.0, -2.0, 2.0, 6.0, 10.0)
    bay_ys = (-6.0, -2.0, 2.0, 6.0)
    for side, y_wall in (("North", half_y + ARENA_GLASS_THICKNESS / 2.0 + 0.04), ("South", -half_y - ARENA_GLASS_THICKNESS / 2.0 - 0.04)):
        for index, cx in enumerate(bay_xs):
            create_box(
                f"ARENA_{side}_GlassBay_{index}",
                (3.55, ARENA_GLASS_THICKNESS, ARENA_GLASS_HEIGHT - 0.12),
                (cx, y_wall, glass_z),
                materials["glass"],
                structure,
                bevel=0.01,
                sgw_kind="ARENA_STATIC",
                collision_shape="BOX",
                friction=0.22,
                restitution=0.16,
            )
    for side, x_wall in (("East", half_x + ARENA_GLASS_THICKNESS / 2.0 + 0.04), ("West", -half_x - ARENA_GLASS_THICKNESS / 2.0 - 0.04)):
        for index, cy in enumerate(bay_ys):
            create_box(
                f"ARENA_{side}_GlassBay_{index}",
                (ARENA_GLASS_THICKNESS, 3.55, ARENA_GLASS_HEIGHT - 0.12),
                (x_wall, cy, glass_z),
                materials["glass"],
                structure,
                bevel=0.01,
                sgw_kind="ARENA_STATIC",
                collision_shape="BOX",
                friction=0.22,
                restitution=0.16,
            )

    # Keep named collision glass for inspectors that look up North wall.
    create_box(
        "ARENA_North_SafetyGlass-collision",
        (ARENA_INNER_X, ARENA_GLASS_THICKNESS * 0.5, ARENA_GLASS_HEIGHT),
        (0.0, half_y + 0.02, glass_z),
        materials["glass"],
        structure,
        bevel=0.01,
        sgw_kind="ARENA_STATIC",
        collision_shape="BOX",
        friction=0.22,
        restitution=0.16,
    )

    # Heavy corner posts and wall posts with caps.
    post_positions: set[tuple[float, float]] = set()
    for x in (-half_x, -8.0, -4.0, 0.0, 4.0, 8.0, half_x):
        post_positions.add((x, half_y + 0.18))
        post_positions.add((x, -half_y - 0.18))
    for y in (-half_y, -4.0, 0.0, 4.0, half_y):
        post_positions.add((half_x + 0.18, y))
        post_positions.add((-half_x - 0.18, y))

    for index, (x, y) in enumerate(sorted(post_positions)):
        is_corner = abs(abs(x) - half_x) < 0.3 and abs(abs(y) - half_y) < 0.3
        size = 0.72 if is_corner else ARENA_POST_SIZE
        create_box(
            f"ARENA_Post_{index:02d}",
            (size, size, ARENA_WALL_HEIGHT + 0.55),
            (x, y, (ARENA_WALL_HEIGHT + 0.55) / 2.0),
            materials["blackened"],
            structure,
            bevel=0.05,
            sgw_kind="ARENA_STRUCTURE",
            collision_shape="BOX",
        )
        create_box(
            f"ARENA_PostCap_{index:02d}",
            (size + 0.18, size + 0.18, 0.16),
            (x, y, ARENA_WALL_HEIGHT + 0.45),
            materials["rail"],
            structure,
            bevel=0.03,
            sgw_kind="ARENA_STRUCTURE",
            collision_shape="NONE",
        )

    # Reinforced corner impact zones inside the cage.
    for index, (cx, cy, rot) in enumerate(
        (
            (-half_x + 1.1, -half_y + 1.1, 45.0),
            (half_x - 1.1, -half_y + 1.1, -45.0),
            (-half_x + 1.1, half_y - 1.1, 135.0),
            (half_x - 1.1, half_y - 1.1, -135.0),
        )
    ):
        create_box(
            f"ARENA_CornerArmor_{index}",
            (1.8, 0.28, 1.15),
            (cx, cy, 0.58),
            materials["rail"],
            structure,
            bevel=0.06,
            rotation=(0.0, 0.0, math.radians(rot)),
            sgw_kind="ARENA_STRUCTURE",
            collision_shape="BOX",
        )

    mid_z = ARENA_RAIL_HEIGHT + ARENA_GLASS_HEIGHT * 0.48
    for side, y in (("North", half_y + 0.18), ("South", -half_y - 0.18)):
        create_box(
            f"ARENA_MidRail_{side}",
            (ARENA_INNER_X + 0.8, ARENA_FRAME_DEPTH, 0.20),
            (0.0, y, mid_z),
            materials["rail"],
            structure,
            bevel=0.03,
            sgw_kind="ARENA_STRUCTURE",
            collision_shape="NONE",
        )
        create_box(
            f"ARENA_LowerGlassFrame_{side}",
            (ARENA_INNER_X + 0.8, ARENA_FRAME_DEPTH, 0.18),
            (0.0, y, ARENA_RAIL_HEIGHT + 0.08),
            materials["brushed"],
            structure,
            bevel=0.02,
            sgw_kind="ARENA_STRUCTURE",
            collision_shape="NONE",
        )
    for side, x in (("East", half_x + 0.18), ("West", -half_x - 0.18)):
        create_box(
            f"ARENA_MidRail_{side}",
            (ARENA_FRAME_DEPTH, ARENA_INNER_Y + 0.4, 0.20),
            (x, 0.0, mid_z),
            materials["rail"],
            structure,
            bevel=0.03,
            sgw_kind="ARENA_STRUCTURE",
            collision_shape="NONE",
        )
        create_box(
            f"ARENA_LowerGlassFrame_{side}",
            (ARENA_FRAME_DEPTH, ARENA_INNER_Y + 0.4, 0.18),
            (x, 0.0, ARENA_RAIL_HEIGHT + 0.08),
            materials["brushed"],
            structure,
            bevel=0.02,
            sgw_kind="ARENA_STRUCTURE",
            collision_shape="NONE",
        )

    for index, x in enumerate((-8.0, -4.0, 0.0, 4.0, 8.0)):
        for side, y in (("N", half_y + 0.18), ("S", -half_y - 0.18)):
            create_box(
                f"ARENA_Mullion_{side}_{index}",
                (0.18, 0.22, ARENA_GLASS_HEIGHT),
                (x, y, glass_z),
                materials["rail"],
                structure,
                bevel=0.02,
                sgw_kind="ARENA_STRUCTURE",
                collision_shape="NONE",
            )
    for index, y in enumerate((-4.0, 0.0, 4.0)):
        for side, x in (("E", half_x + 0.18), ("W", -half_x - 0.18)):
            create_box(
                f"ARENA_Mullion_{side}_{index}",
                (0.22, 0.18, ARENA_GLASS_HEIGHT),
                (x, y, glass_z),
                materials["rail"],
                structure,
                bevel=0.02,
                sgw_kind="ARENA_STRUCTURE",
                collision_shape="NONE",
            )

    top_z = ARENA_WALL_HEIGHT + 0.18
    for name, dims, loc in (
        ("North", (ARENA_INNER_X + 1.2, 0.38, 0.32), (0.0, half_y + 0.18, top_z)),
        ("South", (ARENA_INNER_X + 1.2, 0.38, 0.32), (0.0, -half_y - 0.18, top_z)),
        ("East", (0.38, ARENA_INNER_Y + 0.6, 0.32), (half_x + 0.18, 0.0, top_z)),
        ("West", (0.38, ARENA_INNER_Y + 0.6, 0.32), (-half_x - 0.18, 0.0, top_z)),
    ):
        create_box(
            f"ARENA_TopRail_{name}",
            dims,
            loc,
            materials["blackened"],
            structure,
            bevel=0.05,
            sgw_kind="ARENA_STRUCTURE",
            collision_shape="BOX",
        )

    # Protected service gates (south wall bay).
    create_box(
        "ARENA_ServiceGate_South-collision",
        (3.6, 0.42, ARENA_RAIL_HEIGHT - 0.12),
        (0.0, -half_y - 0.55, rail_z),
        materials["rail"],
        structure,
        bevel=0.06,
        sgw_kind="ARENA_STATIC",
        collision_shape="BOX",
        friction=0.45,
        restitution=0.08,
    )
    create_box(
        "ARENA_ServiceGate_Frame",
        (4.0, 0.55, 0.28),
        (0.0, -half_y - 0.55, ARENA_RAIL_HEIGHT + 0.05),
        materials["brushed"],
        structure,
        bevel=0.04,
        sgw_kind="ARENA_STRUCTURE",
        collision_shape="NONE",
    )
    create_box(
        "ARENA_ServiceGate_Stripe",
        (3.4, 0.08, 0.22),
        (0.0, -half_y - 0.32, rail_z),
        materials["hazard_stripe"],
        structure,
        bevel=0.01,
        sgw_kind="ARENA_STRUCTURE",
        collision_shape="NONE",
    )
    create_box(
        "ARENA_ServiceDoor_East-collision",
        (0.42, 2.8, ARENA_RAIL_HEIGHT - 0.12),
        (half_x + 0.55, 0.0, rail_z),
        materials["rail"],
        structure,
        bevel=0.05,
        sgw_kind="ARENA_STATIC",
        collision_shape="BOX",
    )

    # Center identity — painted steel, not glowing white bloom.
    create_cylinder(
        "ARENA_CenterDisc",
        2.85,
        0.018,
        (0.0, 0.0, 0.036),
        materials["blackened"],
        markings,
        vertices=72,
        bevel=0.0,
        sgw_kind="ARENA_MARKING",
        collision_shape="NONE",
    )
    create_torus(
        "ARENA_CenterRing",
        2.55,
        0.06,
        (0.0, 0.0, 0.052),
        materials["hazard_stripe"],
        markings,
        sgw_kind="ARENA_MARKING",
        collision_shape="NONE",
    )
    create_torus(
        "ARENA_CenterRing_Inner",
        1.85,
        0.035,
        (0.0, 0.0, 0.054),
        materials["identity_paint"],
        markings,
        sgw_kind="ARENA_MARKING",
        collision_shape="NONE",
    )
    create_text(
        "ARENA_CenterTitle",
        "SGW",
        (0.0, 0.28, 0.058),
        0.90,
        materials["hazard_stripe"],
        markings,
        rotation=(0.0, 0.0, 0.0),
        extrude=0.010,
        sgw_kind="ARENA_MARKING",
        collision_shape="NONE",
    )
    create_text(
        "ARENA_CenterSubtitle",
        "ROBOT COMBAT",
        (0.0, -0.55, 0.058),
        0.38,
        materials["identity_paint"],
        markings,
        rotation=(0.0, 0.0, 0.0),
        extrude=0.006,
        sgw_kind="ARENA_MARKING",
        collision_shape="NONE",
    )

    spawn_materials = (materials["spawn_red"], materials["spawn_blue"], materials["spawn_gold"])
    spawn_points: list[dict[str, Any]] = []
    for index, (bot, material) in enumerate(zip(BOT_SPECS, spawn_materials, strict=True), start=1):
        x, y, z = bot.spawn
        create_cylinder(
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
        create_torus(
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
        create_box(
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

    # Designed inactive hazard bays with protective frames.
    hazard_centers = ((-9.2, -5.8), (9.2, -5.8), (-9.2, 5.8), (9.2, 5.8))
    for index, (x, y) in enumerate(hazard_centers, start=1):
        create_box(
            f"HAZARD_BAY_{index}_INACTIVE",
            (2.4, 1.6, 0.05),
            (x, y, 0.028),
            materials["hazard"],
            markings,
            bevel=0.04,
            sgw_kind="HAZARD_MARKER",
            collision_shape="NONE",
            hazard_state="INACTIVE",
            server_authority_required=True,
        )
        create_box(
            f"HAZARD_BAY_{index}_Frame",
            (2.6, 1.8, 0.12),
            (x, y, 0.08),
            materials["blackened"],
            markings,
            bevel=0.03,
            sgw_kind="HAZARD_MARKER",
            collision_shape="NONE",
            hazard_state="INACTIVE",
        )
        create_box(
            f"HAZARD_BAY_{index}_Stripe",
            (2.2, 0.16, 0.04),
            (x, y, 0.10),
            materials["hazard_stripe"],
            markings,
            bevel=0.01,
            sgw_kind="HAZARD_MARKER",
            collision_shape="NONE",
            hazard_state="INACTIVE",
        )
        create_cylinder(
            f"HAZARD_BAY_{index}_CoverBolt",
            0.12,
            0.08,
            (x, y, 0.12),
            materials["brushed"],
            markings,
            vertices=16,
            bevel=0.0,
            sgw_kind="HAZARD_MARKER",
            collision_shape="NONE",
        )

    # Service decks and pit apron outside the fighting enclosure.
    create_box(
        "ARENA_ExteriorApron",
        (42.0, 32.0, 0.35),
        (0.0, 0.0, -0.58),
        materials["concrete"],
        arena,
        bevel=0.08,
        sgw_kind="ENVIRONMENT_STATIC",
        collision_shape="BOX",
    )
    create_box(
        "ARENA_ServiceDeck_South",
        (18.0, 5.5, 0.28),
        (0.0, -half_y - 4.2, -0.20),
        materials["blackened"],
        arena,
        bevel=0.06,
        sgw_kind="ENVIRONMENT_STATIC",
        collision_shape="BOX",
    )
    create_box(
        "ARENA_ServiceDeck_East",
        (5.0, 14.0, 0.28),
        (half_x + 4.0, 0.0, -0.20),
        materials["blackened"],
        arena,
        bevel=0.06,
        sgw_kind="ENVIRONMENT_STATIC",
        collision_shape="BOX",
    )
    create_box(
        "ARENA_ServiceDeck_West",
        (5.0, 14.0, 0.28),
        (-half_x - 4.0, 0.0, -0.20),
        materials["blackened"],
        arena,
        bevel=0.06,
        sgw_kind="ENVIRONMENT_STATIC",
        collision_shape="BOX",
    )
    for index, x in enumerate((-6.0, 0.0, 6.0)):
        create_box(
            f"ARENA_PitBarrier_{index}",
            (2.4, 0.35, 1.1),
            (x, -half_y - 3.4, 0.45),
            materials["rail"],
            structure,
            bevel=0.04,
            sgw_kind="ARENA_STRUCTURE",
            collision_shape="NONE",
        )
        create_box(
            f"ARENA_PitBarrierStripe_{index}",
            (2.2, 0.08, 0.18),
            (x, -half_y - 3.2, 0.70),
            materials["hazard_stripe"],
            structure,
            bevel=0.01,
            sgw_kind="ARENA_STRUCTURE",
            collision_shape="NONE",
        )

    return {
        "inner_dimensions_m": [ARENA_INNER_X, ARENA_INNER_Y, ARENA_WALL_HEIGHT],
        "floor_friction": 0.88,
        "spawn_points": spawn_points,
        "hazards": [
            {
                "hazard_id": f"hazard_bay_{i}",
                "state": "INACTIVE",
                "note": "Visual placeholder; no gameplay behavior is active.",
            }
            for i in range(1, 5)
        ],
    }


def add_area_light(
    name: str,
    location: Sequence[float],
    energy: float,
    size: float,
    color: Sequence[float],
    collection: bpy.types.Collection,
    *,
    rotation: Sequence[float] = (0.0, 0.0, 0.0),
    shape: str = "DISK",
    use_shadow: bool = False,
) -> bpy.types.Object:
    data = bpy.data.lights.new(name=f"{name}_Data", type="AREA")
    data.energy = energy
    data.shape = shape
    data.size = size
    data.color = color
    if hasattr(data, "use_shadow"):
        data.use_shadow = use_shadow
    obj = bpy.data.objects.new(name, data)
    obj.location = Vector(location)
    obj.rotation_euler = rotation
    collection.objects.link(obj)
    return tag_object(obj, sgw_kind="LIGHT")


def add_sun_light(
    name: str,
    location: Sequence[float],
    energy: float,
    color: Sequence[float],
    collection: bpy.types.Collection,
    *,
    rotation: Sequence[float],
    use_shadow: bool = True,
) -> bpy.types.Object:
    data = bpy.data.lights.new(name=f"{name}_Data", type="SUN")
    data.energy = energy
    data.color = color
    if hasattr(data, "angle"):
        data.angle = math.radians(25.0)
    if hasattr(data, "use_shadow"):
        data.use_shadow = use_shadow
    obj = bpy.data.objects.new(name, data)
    obj.location = Vector(location)
    obj.rotation_euler = rotation
    collection.objects.link(obj)
    return tag_object(obj, sgw_kind="LIGHT")


def point_object_at(obj: bpy.types.Object, target: Sequence[float]) -> None:
    direction = Vector(target) - obj.location
    obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


def build_lighting_and_cameras(
    collections: dict[str, bpy.types.Collection],
    materials: dict[str, bpy.types.Material],
) -> None:
    lights = collections["lights"]
    cameras = collections["cameras"]
    structure = collections["arena_structure"]

    # Perimeter overhead rigging only — no center glowing crossbars through the FOV.
    truss_z = 7.6
    half_x = ARENA_INNER_X / 2.0
    half_y = ARENA_INNER_Y / 2.0
    for name, dims, loc in (
        ("North", (ARENA_INNER_X + 2.0, 0.32, 0.32), (0.0, half_y + 0.6, truss_z)),
        ("South", (ARENA_INNER_X + 2.0, 0.32, 0.32), (0.0, -half_y - 0.6, truss_z)),
        ("East", (0.32, ARENA_INNER_Y + 1.2, 0.32), (half_x + 0.6, 0.0, truss_z)),
        ("West", (0.32, ARENA_INNER_Y + 1.2, 0.32), (-half_x - 0.6, 0.0, truss_z)),
    ):
        create_box(
            f"LIGHT_TRUSS_{name}",
            dims,
            loc,
            materials["blackened"],
            structure,
            bevel=0.04,
            sgw_kind="ARENA_STRUCTURE",
            collision_shape="NONE",
        )

    # Corner risers only — keep focal floor clear.
    for index, (x, y) in enumerate(
        (
            (-half_x - 0.6, -half_y - 0.6),
            (half_x + 0.6, -half_y - 0.6),
            (-half_x - 0.6, half_y + 0.6),
            (half_x + 0.6, half_y + 0.6),
        )
    ):
        create_box(
            f"LIGHT_TRUSS_Riser_{index}",
            (0.28, 0.28, truss_z - 0.2),
            (x, y, truss_z / 2.0),
            materials["rail"],
            structure,
            bevel=0.03,
            sgw_kind="ARENA_STRUCTURE",
            collision_shape="NONE",
        )

    add_sun_light(
        "Arena_KeySun",
        (10.0, -12.0, 16.0),
        1.35,
        (1.0, 0.93, 0.86),
        lights,
        rotation=(math.radians(46.0), math.radians(16.0), math.radians(-28.0)),
        use_shadow=True,
    )
    add_sun_light(
        "Arena_FillSun",
        (-11.0, 9.0, 13.0),
        0.55,
        (0.70, 0.80, 0.95),
        lights,
        rotation=(math.radians(58.0), math.radians(-28.0), math.radians(42.0)),
        use_shadow=False,
    )

    # Fixtures hang from perimeter trusses, not a center plus.
    light_positions = (
        (-9.0, -5.5, truss_z - 0.35),
        (9.0, -5.5, truss_z - 0.35),
        (-9.0, 5.5, truss_z - 0.35),
        (9.0, 5.5, truss_z - 0.35),
        (0.0, -half_y - 0.5, truss_z - 0.45),
        (0.0, half_y + 0.5, truss_z - 0.45),
    )
    for index, position in enumerate(light_positions, start=1):
        aim = (position[0] * 0.25, position[1] * 0.2, 0.35)
        light = add_area_light(
            f"Arena_Key_{index}",
            position,
            1200.0,
            2.4,
            (0.90, 0.94, 1.0) if index % 2 else (1.0, 0.88, 0.76),
            lights,
            shape="RECTANGLE",
            use_shadow=False,
        )
        if hasattr(light.data, "size_y"):
            light.data.size_y = 1.2
        point_object_at(light, aim)
        create_box(
            f"Arena_LightHousing_{index}",
            (1.10, 0.62, 0.28),
            (position[0], position[1], position[2] + 0.08),
            materials["light_housing"],
            lights,
            bevel=0.04,
            sgw_kind="LIGHT_FIXTURE",
            collision_shape="NONE",
        )
        # Diffuser stays dark steel — illumination comes from real lights, not glowing slabs.
        create_box(
            f"Arena_LightPanel_{index}",
            (0.78, 0.38, 0.03),
            (position[0], position[1], position[2] - 0.08),
            materials["brushed"],
            lights,
            bevel=0.01,
            sgw_kind="LIGHT_FIXTURE",
            collision_shape="NONE",
        )

    for index, bot in enumerate(BOT_SPECS, start=1):
        sx, sy, _ = bot.spawn
        spot_data = bpy.data.lights.new(name=f"Arena_BotSpot_{index}_Data", type="SPOT")
        spot_data.energy = 650.0
        spot_data.color = (1.0, 0.94, 0.86)
        spot_data.spot_size = math.radians(48.0)
        spot_data.spot_blend = 0.60
        if hasattr(spot_data, "use_shadow"):
            spot_data.use_shadow = False
        spot = bpy.data.objects.new(f"Arena_BotSpot_{index}", spot_data)
        spot.location = Vector((sx * 0.45, sy * 0.35 - 1.2, 5.2))
        lights.objects.link(spot)
        point_object_at(spot, (sx, sy, 0.55))
        tag_object(spot, sgw_kind="LIGHT")

    # Professional three-quarter broadcast: all bots complete, venue scale, clear FOV.
    camera_data = bpy.data.cameras.new("CAM_Overview_Data")
    camera_data.lens = 26.0
    camera_data.sensor_width = 36.0
    if hasattr(camera_data, "clip_start"):
        camera_data.clip_start = 0.1
    if hasattr(camera_data, "clip_end"):
        camera_data.clip_end = 220.0
    camera = bpy.data.objects.new("CAM_Overview", camera_data)
    # Outside SE three-quarter, high enough that the south wall sits below the subjects.
    # SE broadcast angle: full floor, enclosure scale, Crane Row + Crow's Nest depth.
    camera.location = (18.5, -26.0, 14.5)
    cameras.objects.link(camera)
    point_object_at(camera, (0.0, 2.5, 0.6))
    tag_object(camera, sgw_kind="CAMERA", camera_role="OVERVIEW", story_arena=ARENA_WORKING_TITLE)
    bpy.context.scene.camera = camera

    # Lower arena-level scale camera for evidence — includes bots + wall height.
    low_data = bpy.data.cameras.new("CAM_ArenaLevel_Data")
    low_data.lens = 24.0
    low_data.sensor_width = 36.0
    if hasattr(low_data, "clip_start"):
        low_data.clip_start = 0.1
    if hasattr(low_data, "clip_end"):
        low_data.clip_end = 200.0
    low_cam = bpy.data.objects.new("CAM_ArenaLevel", low_data)
    low_cam.location = (8.5, -9.5, 1.55)
    cameras.objects.link(low_cam)
    point_object_at(low_cam, (-1.0, 1.5, 1.1))
    tag_object(low_cam, sgw_kind="CAMERA", camera_role="ARENA_LEVEL")

    anchors = (
        ("CAM_ANCHOR_PlayerA", (-10.5, -6.8, 4.8), "PLAYER_A"),
        ("CAM_ANCHOR_PlayerB", (10.5, -6.8, 4.8), "PLAYER_B"),
        ("CAM_ANCHOR_PlayerC", (0.0, 7.0, 5.2), "PLAYER_C"),
        ("CAM_ANCHOR_Spectator", (0.0, -14.0, 7.8), "SPECTATOR"),
    )
    for name, location, role in anchors:
        anchor = create_empty(
            name,
            location,
            cameras,
            display_type="CONE",
            display_size=0.75,
            sgw_kind="CAMERA_ANCHOR",
            camera_role=role,
        )
        point_object_at(anchor, (0.0, 0.0, 0.7))

    add_silhouette_cameras(cameras, lights)
    # Additive story evidence cameras (CAM_STORY_*). Idempotent; does not
    # replace CAM_Overview, CAM_ArenaLevel, or CAM_SILHOUETTE_*.
    ensure_story_cameras(cameras)


def ensure_story_cameras(cameras: bpy.types.Collection) -> None:
    """Create CAM_STORY_* evidence cameras if missing (additive / idempotent)."""

    def _find(aliases: Sequence[str]) -> bpy.types.Object | None:
        for name in aliases:
            obj = bpy.data.objects.get(name)
            if obj is not None:
                return obj
        lowered = [alias.lower() for alias in aliases]
        for obj in bpy.data.objects:
            name_l = obj.name.lower()
            for alias in lowered:
                if alias in name_l:
                    return obj
        return None

    def _center(obj: bpy.types.Object) -> Vector:
        return Vector(obj.matrix_world.translation)

    def _ensure(
        name: str,
        *,
        lens: float,
        location: Sequence[float],
        look: Sequence[float],
        role: str,
        clip_end: float = 280.0,
    ) -> bpy.types.Object:
        camera = bpy.data.objects.get(name)
        if camera is None:
            data = bpy.data.cameras.new(f"{name}_Data")
            camera = bpy.data.objects.new(name, data)
            cameras.objects.link(camera)
        if camera.data is not None:
            camera.data.lens = lens
            camera.data.sensor_width = 36.0
            if hasattr(camera.data, "clip_start"):
                camera.data.clip_start = 0.1
            if hasattr(camera.data, "clip_end"):
                camera.data.clip_end = clip_end
        camera.location = Vector(location)
        point_object_at(camera, look)
        tag_object(
            camera,
            sgw_kind="CAMERA",
            camera_role=role,
            sgw_story_camera=True,
        )
        return camera

    landmark_looks = {
        "cutting_hall": (
            ("STORY_CuttingHall", "LANDMARK_CuttingHall", "CUTTING_HALL"),
            (0.0, 14.5, 3.8),
        ),
        "crane_row": (
            ("STORY_CraneRow", "LANDMARK_CraneRow", "CRANE_ROW"),
            (0.0, 0.0, 5.5),
        ),
        "crows_nest": (
            ("STORY_CrowsNest", "LANDMARK_CrowsNest", "CROWS_NEST"),
            (0.0, 12.5, 7.2),
        ),
        "wall_of_wrecks": (
            ("STORY_WallOfWrecks", "LANDMARK_WallOfWrecks", "WALL_OF_WRECKS"),
            (16.0, 0.0, 3.0),
        ),
        "exterior": (
            ("STORY_ExteriorScrapyard", "LANDMARK_ExteriorScrapyard", "ARENA_ExteriorApron"),
            (0.0, 2.0, 2.8),
        ),
    }

    def look_for(key: str, fallback: Sequence[float]) -> tuple[float, float, float]:
        aliases, default = landmark_looks[key]
        obj = _find(aliases)
        if obj is None:
            return (float(fallback[0]), float(fallback[1]), float(fallback[2]))
        c = _center(obj) + Vector((0.0, 0.0, 1.2))
        return (float(c.x), float(c.y), float(c.z))

    specs: list[tuple[str, float, Sequence[float], Sequence[float], str]] = [
        ("CAM_STORY_Exterior", 22.0, (34.0, -42.0, 16.5), look_for("exterior", (0.0, 2.0, 2.8)), "STORY_EXTERIOR"),
        ("CAM_STORY_ArenaOverview", 26.0, (18.5, -26.0, 12.8), (0.0, 1.0, 0.55), "STORY_ARENA_OVERVIEW"),
        ("CAM_STORY_FloorScale", 24.0, (9.2, -10.4, 1.35), (-0.8, 1.6, 0.95), "STORY_FLOOR_SCALE"),
        ("CAM_STORY_CuttingHall", 32.0, (0.0, 2.5, 3.2), look_for("cutting_hall", (0.0, 14.5, 3.8)), "STORY_CUTTING_HALL"),
        ("CAM_STORY_CraneRow", 28.0, (-14.0, -8.0, 7.8), look_for("crane_row", (0.0, 0.0, 5.5)), "STORY_CRANE_ROW"),
        ("CAM_STORY_CrowsNest", 35.0, (8.5, -10.0, 6.5), look_for("crows_nest", (0.0, 12.5, 7.2)), "STORY_CROWS_NEST"),
        ("CAM_STORY_WallOfWrecks", 32.0, (-4.0, -6.0, 3.4), look_for("wall_of_wrecks", (16.0, 0.0, 3.0)), "STORY_WALL_OF_WRECKS"),
        ("CAM_STORY_CrewBays", 28.0, (0.0, -18.5, 5.2), (0.0, -10.5, 1.8), "STORY_CREW_BAYS"),
        ("CAM_STORY_CrewBay_1", 35.0, (-8.5, -16.0, 3.6), (-6.0, -11.0, 1.4), "STORY_CREW_BAY_1"),
        ("CAM_STORY_CrewBay_2", 35.0, (0.0, -16.5, 3.6), (0.0, -11.0, 1.4), "STORY_CREW_BAY_2"),
        ("CAM_STORY_CrewBay_3", 35.0, (8.5, -16.0, 3.6), (6.0, -11.0, 1.4), "STORY_CREW_BAY_3"),
        ("CAM_STORY_YardMule", 40.0, (-1.2, -5.8, 1.7), (-4.4, -2.2, 0.55), "STORY_YARD_MULE"),
        ("CAM_STORY_Keelcutter", 40.0, (7.4, -5.6, 1.85), (4.4, -2.2, 0.55), "STORY_KEELCUTTER"),
        ("CAM_STORY_Pilebreaker", 40.0, (3.6, 6.4, 2.1), (0.0, 2.8, 0.75), "STORY_PILEBREAKER"),
        ("CAM_STORY_ModularParts", 45.0, (3.8, -18.5, 3.2), (0.0, -16.0, 1.0), "STORY_MODULAR_PARTS"),
        ("CAM_STORY_Composition", 26.0, (17.8, -24.8, 11.6), (0.0, 0.8, 0.65), "STORY_COMPOSITION"),
        ("CAM_STORY_Silhouette_YardMule", 50.0, (-4.4, -6.8, 1.1), (-4.4, -2.2, 0.55), "STORY_SILHOUETTE_YARD_MULE"),
        ("CAM_STORY_Silhouette_Keelcutter", 50.0, (4.4, -6.9, 1.15), (4.4, -2.2, 0.55), "STORY_SILHOUETTE_KEELCUTTER"),
        ("CAM_STORY_Silhouette_Pilebreaker", 50.0, (4.6, 2.8, 1.25), (0.0, 2.8, 0.75), "STORY_SILHOUETTE_PILEBREAKER"),
    ]
    for name, lens, location, look, role in specs:
        _ensure(name, lens=lens, location=location, look=look, role=role)


def add_silhouette_cameras(
    cameras: bpy.types.Collection,
    lights: bpy.types.Collection,
) -> None:
    """Side elevation cameras + rim lights for dark silhouette readability tests.

    Complements sibling CAM_STORY_Silhouette_* evidence cameras; does not replace them.
    """
    configs = (
        ("CAM_SILHOUETTE_YARD_MULE", "rammer", "Yard Mule"),
        ("CAM_SILHOUETTE_KEELCUTTER", "ripper", "Keelcutter"),
        ("CAM_SILHOUETTE_PILEBREAKER", "maul", "Pilebreaker"),
    )
    specs_by_id = {spec.bot_id: spec for spec in BOT_SPECS}
    for cam_name, bot_id, story_name in configs:
        bot = specs_by_id[bot_id]
        sx, sy, _ = bot.spawn
        facing = math.radians(bot.facing_degrees)
        # Camera sits off the bot's right flank for a clean side silhouette.
        side_x = math.cos(facing)
        side_y = math.sin(facing)
        cam_loc = (sx + side_x * 5.2 - side_y * 0.4, sy + side_y * 5.2 + side_x * 0.4, 1.05)
        aim = (sx, sy, 0.70)

        camera = bpy.data.objects.get(cam_name)
        if camera is None:
            cam_data = bpy.data.cameras.new(f"{cam_name}_Data")
            camera = bpy.data.objects.new(cam_name, cam_data)
            cameras.objects.link(camera)
        if camera.data is not None:
            camera.data.lens = 55.0
            camera.data.sensor_width = 36.0
            if hasattr(camera.data, "clip_start"):
                camera.data.clip_start = 0.1
            if hasattr(camera.data, "clip_end"):
                camera.data.clip_end = 80.0
        camera.location = Vector(cam_loc)
        point_object_at(camera, aim)
        tag_object(
            camera,
            sgw_kind="CAMERA",
            camera_role="SILHOUETTE",
            story_bot=story_name,
            bot_id=bot_id,
            silhouette_test=True,
            lighting_note="Use paired SILHOUETTE rim light; prefer dark subject against bright rim.",
        )

        # Bright rim behind the bot; front stays darker for silhouette read.
        rim_name = f"SILHOUETTE_Rim_{bot_id.upper()}"
        rim_loc = (sx - side_x * 3.2, sy - side_y * 3.2, 2.4)
        rim = bpy.data.objects.get(rim_name)
        if rim is None:
            rim = add_area_light(
                rim_name,
                rim_loc,
                1800.0,
                2.8,
                (0.92, 0.95, 1.0),
                lights,
                shape="DISK",
                use_shadow=False,
            )
        else:
            rim.location = Vector(rim_loc)
        point_object_at(rim, aim)
        tag_object(
            rim,
            sgw_kind="LIGHT",
            silhouette_setup=True,
            camera_pair=cam_name,
            story_bot=story_name,
        )

        marker_name = f"MARKER_SILHOUETTE_{bot_id.upper()}"
        if bpy.data.objects.get(marker_name) is None:
            create_empty(
                marker_name,
                (sx, sy, 0.05),
                cameras,
                display_type="CIRCLE",
                display_size=0.55,
                sgw_kind="CAMERA_ANCHOR",
                camera_role="SILHOUETTE_SUBJECT",
                story_bot=story_name,
                bot_id=bot_id,
            )


def build_render_backdrop(
    collections: dict[str, bpy.types.Collection],
    materials: dict[str, bpy.types.Material],
) -> None:
    """Bay 13 Scrapyard story landmarks (Cutting Hall, Crane Row, Crow's Nest, Crew Bays, Wall of Wrecks, Exterior)."""
    _bay13_world().build_story_environment(collections, materials)


def _legacy_build_render_backdrop_UNUSED(
    collections: dict[str, bpy.types.Collection],
    materials: dict[str, bpy.types.Material],
) -> None:
    environment = collections["environment"]
    create_box(
        "VENUE_BackWall",
        (48.0, 1.0, 16.0),
        (0.0, 16.5, 6.5),
        materials["black"],
        environment,
        bevel=0.12,
        sgw_kind="ENVIRONMENT_VISUAL",
        collision_shape="NONE",
    )
    create_box(
        "VENUE_SideWall_East",
        (1.0, 36.0, 14.0),
        (21.0, 0.0, 5.5),
        materials["black"],
        environment,
        bevel=0.10,
        sgw_kind="ENVIRONMENT_VISUAL",
        collision_shape="NONE",
    )
    create_box(
        "VENUE_SideWall_West",
        (1.0, 36.0, 14.0),
        (-21.0, 0.0, 5.5),
        materials["black"],
        environment,
        bevel=0.10,
        sgw_kind="ENVIRONMENT_VISUAL",
        collision_shape="NONE",
    )
    create_box(
        "VENUE_Mezzanine_North",
        (30.0, 4.0, 0.45),
        (0.0, 14.0, 4.2),
        materials["blackened"],
        environment,
        bevel=0.08,
        sgw_kind="ENVIRONMENT_VISUAL",
        collision_shape="NONE",
    )
    create_box(
        "VENUE_MezzanineRail",
        (30.0, 0.18, 1.1),
        (0.0, 12.1, 4.85),
        materials["rail"],
        environment,
        bevel=0.04,
        sgw_kind="ENVIRONMENT_VISUAL",
        collision_shape="NONE",
    )
    for index, x in enumerate((-10.0, -3.5, 3.5, 10.0)):
        create_box(
            f"VENUE_Column_{index}",
            (0.85, 0.85, 10.0),
            (x, 15.2, 4.5),
            materials["rail"],
            environment,
            bevel=0.08,
            sgw_kind="ENVIRONMENT_VISUAL",
            collision_shape="NONE",
        )
    create_text(
        "VENUE_Title",
        "SGW ROBOT COMBAT",
        (0.0, 16.0, 9.4),
        1.05,
        materials["identity_paint"],
        environment,
        rotation=(math.radians(90.0), 0.0, 0.0),
        extrude=0.04,
        sgw_kind="ENVIRONMENT_VISUAL",
        collision_shape="NONE",
    )
    create_text(
        "VENUE_Tagline",
        "BUILD IT. DRIVE IT. SURVIVE IT.",
        (0.0, 16.0, 7.8),
        0.52,
        materials["gold"],
        environment,
        rotation=(math.radians(90.0), 0.0, 0.0),
        extrude=0.025,
        sgw_kind="ENVIRONMENT_VISUAL",
        collision_shape="NONE",
    )


# ---------------------------------------------------------------------------
# Robot construction helpers
# ---------------------------------------------------------------------------


def add_socket(
    parent: bpy.types.Object,
    collection: bpy.types.Collection,
    socket_id: str,
    socket_group: str,
    local_location: Sequence[float],
    *,
    local_rotation: Sequence[float] = (0.0, 0.0, 0.0),
    accepts: Sequence[str] = (),
    socket_role: str = "PARENT_SLOT",
    owner_part_id: str | None = None,
) -> bpy.types.Object:
    socket = create_empty(
        f"SOCKET_{parent.name}_{socket_id}",
        local_location,
        collection,
        parent=parent,
        display_type="ARROWS",
        display_size=0.24,
        sgw_kind="ATTACHMENT_SOCKET",
        socket_id=socket_id,
        socket_group=socket_group,
        socket_role=socket_role,
        owner_part_id=owner_part_id,
        accepts=list(accepts),
    )
    socket.rotation_euler = local_rotation
    return socket


def add_bolt_detail(
    name: str,
    location: Sequence[float],
    parent: bpy.types.Object,
    collection: bpy.types.Collection,
    materials: dict[str, bpy.types.Material],
    *,
    radius: float = 0.045,
) -> None:
    create_cylinder(
        name,
        radius,
        radius * 0.7,
        location,
        materials["brushed"],
        collection,
        vertices=12,
        bevel=0.0,
        parent=parent,
        sgw_kind="ROBOT_VISUAL",
        collision_shape="NONE",
    )


def add_standard_wheels(
    root: bpy.types.Object,
    collection: bpy.types.Collection,
    materials: dict[str, bpy.types.Material],
    *,
    x_offset: float,
    y_offsets: tuple[float, float],
    wheel_radius: float = 0.38,
    wheel_depth: float = 0.32,
    recessed: bool = True,
) -> list[bpy.types.Object]:
    wheels: list[bpy.types.Object] = []
    wheel_data = (
        ("FL", -x_offset, y_offsets[1]),
        ("FR", x_offset, y_offsets[1]),
        ("RL", -x_offset, y_offsets[0]),
        ("RR", x_offset, y_offsets[0]),
    )
    hub_inset = 0.02 if recessed else 0.0
    for socket_id, x, y in wheel_data:
        side = -1.0 if x < 0 else 1.0
        wx = x + side * hub_inset
        wheel_z = wheel_radius * 0.88
        wheel = create_cylinder(
            f"{root.name}_Wheel_{socket_id}",
            wheel_radius,
            wheel_depth,
            (wx, y, wheel_z),
            materials["rubber"],
            collection,
            rotation=(0.0, math.radians(90.0), 0.0),
            vertices=40,
            bevel=0.03,
            parent=root,
            smooth=True,
            sgw_kind="ROBOT_PART",
            part_id="wheel_drive_large",
            category="DRIVE",
            collision_shape="CYLINDER",
            wheel_socket=socket_id,
            powered=True,
            mass_kg=4.5,
            durability=70.0,
        )
        create_cylinder(
            f"{root.name}_Hub_{socket_id}",
            wheel_radius * 0.42,
            wheel_depth + 0.05,
            (wx, y, wheel_z),
            materials["weapon"],
            collection,
            rotation=(0.0, math.radians(90.0), 0.0),
            vertices=32,
            bevel=0.02,
            parent=root,
            smooth=True,
            sgw_kind="ROBOT_VISUAL",
            collision_shape="NONE",
        )
        create_cylinder(
            f"{root.name}_Axle_{socket_id}",
            0.07,
            wheel_depth + 0.22,
            (wx - side * 0.08, y, wheel_z),
            materials["brushed"],
            collection,
            rotation=(0.0, math.radians(90.0), 0.0),
            vertices=16,
            bevel=0.0,
            parent=root,
            smooth=True,
            sgw_kind="ROBOT_VISUAL",
            collision_shape="NONE",
        )
        # Partial wheel guard — covers top/rear only so tires remain readable.
        create_box(
            f"{root.name}_WheelGuard_{socket_id}",
            (0.10, wheel_depth * 0.7, wheel_radius * 0.85),
            (x + side * 0.08, y - 0.05, wheel_z + wheel_radius * 0.35),
            materials["chassis"],
            collection,
            bevel=0.02,
            parent=root,
            sgw_kind="ROBOT_VISUAL",
            collision_shape="NONE",
        )
        add_socket(
            root,
            collection,
            f"WHEEL_{socket_id}",
            "WHEEL",
            (wx, y, wheel_z),
            local_rotation=(0.0, math.radians(90.0), 0.0),
            accepts=("wheel_drive_small", "wheel_drive_large"),
        )
        wheels.append(wheel)
    return wheels


def add_lift_eye(
    name: str,
    location: Sequence[float],
    parent: bpy.types.Object,
    collection: bpy.types.Collection,
    materials: dict[str, bpy.types.Material],
) -> None:
    """Small yard lifting eye — readable blockout ring on a pad."""
    create_box(
        f"{name}_Pad",
        (0.16, 0.16, 0.05),
        (location[0], location[1], location[2] - 0.04),
        materials["brushed"],
        collection,
        bevel=0.01,
        parent=parent,
        sgw_kind="ROBOT_VISUAL",
        collision_shape="NONE",
    )
    create_torus(
        name,
        0.07,
        0.018,
        location,
        materials["weapon"],
        collection,
        rotation=(math.radians(90.0), 0.0, 0.0),
        parent=parent,
        sgw_kind="ROBOT_VISUAL",
        collision_shape="NONE",
    )


def add_tow_point(
    name: str,
    location: Sequence[float],
    parent: bpy.types.Object,
    collection: bpy.types.Collection,
    materials: dict[str, bpy.types.Material],
) -> None:
    """Harbor-tug / yard-tractor tow cleat."""
    create_box(
        f"{name}_Base",
        (0.28, 0.18, 0.10),
        location,
        materials["blackened"],
        collection,
        bevel=0.02,
        parent=parent,
        sgw_kind="ROBOT_VISUAL",
        collision_shape="NONE",
    )
    create_cylinder(
        f"{name}_Horn",
        0.05,
        0.22,
        (location[0], location[1] + 0.02, location[2] + 0.10),
        materials["brushed"],
        collection,
        rotation=(math.radians(90.0), 0.0, 0.0),
        vertices=16,
        bevel=0.0,
        parent=parent,
        smooth=True,
        sgw_kind="ROBOT_VISUAL",
        collision_shape="NONE",
    )


def add_bot_identity(
    root: bpy.types.Object,
    collection: bpy.types.Collection,
    materials: dict[str, bpy.types.Material],
    *,
    class_label: str,
    story_name: str,
    unit_mark: str,
    color_material: bpy.types.Material,
    stripe_z: float = 0.78,
) -> None:
    """Restrained crew ID: thin stripe + unit number — not toy primary boxes."""
    create_box(
        f"{root.name}_IdentityStripe",
        (1.15, 0.08, 0.022),
        (0.0, -0.32, stripe_z),
        color_material,
        collection,
        bevel=0.01,
        parent=root,
        sgw_kind="ROBOT_VISUAL",
        collision_shape="NONE",
    )
    create_box(
        f"{root.name}_UnitPlate",
        (0.42, 0.22, 0.03),
        (0.55, -0.55, stripe_z + 0.02),
        materials["identity_paint"],
        collection,
        bevel=0.01,
        parent=root,
        sgw_kind="ROBOT_VISUAL",
        collision_shape="NONE",
    )
    create_text(
        f"{root.name}_UnitMark",
        unit_mark,
        (0.55, -0.55, stripe_z + 0.04),
        0.14,
        materials["marking_white"],
        collection,
        rotation=(0.0, 0.0, 0.0),
        extrude=0.006,
        parent=root,
        sgw_kind="ROBOT_VISUAL",
        collision_shape="NONE",
    )
    create_text(
        f"{root.name}_Nameplate",
        story_name.upper(),
        (0.0, -0.48, stripe_z + 0.03),
        0.16,
        materials["marking_white"],
        collection,
        rotation=(0.0, 0.0, 0.0),
        extrude=0.006,
        parent=root,
        sgw_kind="ROBOT_VISUAL",
        collision_shape="NONE",
    )
    create_text(
        f"{root.name}_ClassMark",
        class_label.upper(),
        (-0.55, -0.55, stripe_z + 0.04),
        0.11,
        color_material,
        collection,
        rotation=(0.0, 0.0, 0.0),
        extrude=0.005,
        parent=root,
        sgw_kind="ROBOT_VISUAL",
        collision_shape="NONE",
    )


def create_bot_root(spec: BotSpec, collection: bpy.types.Collection) -> bpy.types.Object:
    root = create_empty(
        f"BOT_{spec.bot_id.upper()}_ROOT",
        spec.spawn,
        collection,
        display_type="CUBE",
        display_size=0.65,
        sgw_kind="ROBOT_ROOT",
        bot_id=spec.bot_id,
        display_name=spec.display_name,
        story_name=spec.story_name,
        unit_mark=spec.unit_mark,
        archetype=spec.archetype,
        mass_kg=spec.mass_kg,
        drive_power_kw=spec.drive_power_kw,
        weapon_power_kw=spec.weapon_power_kw,
        description=spec.description,
        blueprint_version=1,
        player_buildable=True,
        server_validation_required=True,
        venue_story=ARENA_WORKING_TITLE,
    )
    root.rotation_euler.z = math.radians(spec.facing_degrees)
    return root


def build_rammer(
    spec: BotSpec,
    collection: bpy.types.Collection,
    materials: dict[str, bpy.types.Material],
) -> bpy.types.Object:
    """Yard Mule — yard tractor / harbor tug language (class: Rammer)."""
    root = create_bot_root(spec, collection)
    # Low, wide tractor chassis — industrial metal primary.
    create_box(
        "RAMMER_Chassis-collision",
        (2.85, 2.15, 0.42),
        (0.0, -0.18, 0.38),
        materials["chassis"],
        collection,
        bevel=0.10,
        parent=root,
        sgw_kind="ROBOT_PART",
        part_id="chassis_standard",
        category="CHASSIS",
        collision_shape="BOX",
        mass_kg=34.0,
        durability=125.0,
    )
    create_box(
        "RAMMER_BellyPan",
        (2.65, 1.95, 0.08),
        (0.0, -0.15, 0.14),
        materials["blackened"],
        collection,
        bevel=0.02,
        parent=root,
        sgw_kind="ROBOT_VISUAL",
        collision_shape="NONE",
    )
    create_box(
        "RAMMER_HoodBlock",
        (1.55, 0.95, 0.28),
        (0.0, -0.55, 0.68),
        materials["blackened"],
        collection,
        bevel=0.05,
        parent=root,
        sgw_kind="ROBOT_VISUAL",
        collision_shape="NONE",
    )
    # Wide recessed stance — protected drive like a yard mule.
    add_standard_wheels(
        root,
        collection,
        materials,
        x_offset=1.32,
        y_offsets=(-0.78, 0.52),
        wheel_radius=0.33,
        wheel_depth=0.34,
        recessed=True,
    )
    for side, sx in (("L", -1.38), ("R", 1.38)):
        create_box(
            f"RAMMER_WheelWell_{side}",
            (0.14, 1.55, 0.42),
            (sx, -0.12, 0.40),
            materials["chassis"],
            collection,
            bevel=0.03,
            parent=root,
            sgw_kind="ROBOT_VISUAL",
            collision_shape="NONE",
        )
    # Structural front wedge (collision) + bolted replaceable face plate.
    create_wedge(
        "RAMMER_FrontWedge-collision",
        3.15,
        1.75,
        0.46,
        (0.0, 1.42, 0.02),
        materials["hardened"],
        collection,
        parent=root,
        sgw_kind="ROBOT_PART",
        part_id="armor_wedge",
        category="ARMOR",
        collision_shape="CONVEX",
        mass_kg=10.0,
        durability=110.0,
    )
    create_wedge(
        "RAMMER_ReplaceableFace",
        2.85,
        1.35,
        0.16,
        (0.0, 1.38, 0.28),
        materials["blackened"],
        collection,
        parent=root,
        sgw_kind="ROBOT_VISUAL",
        collision_shape="NONE",
        replaceable_armor=True,
    )
    create_box(
        "RAMMER_WedgeLip",
        (3.05, 0.14, 0.09),
        (0.0, 2.20, 0.06),
        materials["weapon"],
        collection,
        bevel=0.02,
        parent=root,
        sgw_kind="ROBOT_VISUAL",
        collision_shape="NONE",
    )
    for side, sx in (("L", -0.95), ("R", 0.95)):
        create_box(
            f"RAMMER_WedgeBrace_{side}",
            (0.14, 1.15, 0.24),
            (sx, 0.58, 0.30),
            materials["brushed"],
            collection,
            bevel=0.02,
            parent=root,
            sgw_kind="ROBOT_VISUAL",
            collision_shape="NONE",
        )
    # Layered under-wedge / forklift-tongue read.
    create_box(
        "RAMMER_ForkTongue_L",
        (0.28, 0.85, 0.08),
        (-0.55, 1.85, 0.08),
        materials["rail"],
        collection,
        bevel=0.02,
        parent=root,
        sgw_kind="ROBOT_VISUAL",
        collision_shape="NONE",
    )
    create_box(
        "RAMMER_ForkTongue_R",
        (0.28, 0.85, 0.08),
        (0.55, 1.85, 0.08),
        materials["rail"],
        collection,
        bevel=0.02,
        parent=root,
        sgw_kind="ROBOT_VISUAL",
        collision_shape="NONE",
    )
    for i, (bx, by) in enumerate(
        ((-1.1, 1.55), (1.1, 1.55), (-0.55, 1.85), (0.55, 1.85), (0.0, 2.05), (-1.1, 1.15), (1.1, 1.15))
    ):
        add_bolt_detail(f"RAMMER_FaceBolt_{i}", (bx, by, 0.42), root, collection, materials, radius=0.04)
    create_box(
        "RAMMER_TopArmor",
        (2.35, 1.35, 0.12),
        (0.0, -0.22, 0.68),
        materials["blackened"],
        collection,
        bevel=0.05,
        parent=root,
        sgw_kind="ROBOT_PART",
        part_id="armor_plate_flat",
        category="ARMOR",
        collision_shape="BOX",
        mass_kg=6.0,
        durability=85.0,
    )
    create_box(
        "RAMMER_TopSeam",
        (2.20, 0.04, 0.02),
        (0.0, -0.22, 0.75),
        materials["floor_seam"],
        collection,
        bevel=0.0,
        parent=root,
        sgw_kind="ROBOT_VISUAL",
        collision_shape="NONE",
    )
    # Restrained ID — thin side stripes, not toy-color side boxes.
    create_box(
        "RAMMER_IDPanel_L",
        (0.05, 0.75, 0.18),
        (-1.45, -0.10, 0.50),
        materials["red"],
        collection,
        bevel=0.01,
        parent=root,
        sgw_kind="ROBOT_VISUAL",
        collision_shape="NONE",
    )
    create_box(
        "RAMMER_IDPanel_R",
        (0.05, 0.75, 0.18),
        (1.45, -0.10, 0.50),
        materials["red"],
        collection,
        bevel=0.01,
        parent=root,
        sgw_kind="ROBOT_VISUAL",
        collision_shape="NONE",
    )
    create_box(
        "RAMMER_IDStripe_Front",
        (0.55, 0.06, 0.04),
        (0.0, 1.55, 0.48),
        materials["red"],
        collection,
        bevel=0.01,
        parent=root,
        sgw_kind="ROBOT_VISUAL",
        collision_shape="NONE",
    )
    create_box(
        "RAMMER_SideSkirt_L",
        (0.10, 1.55, 0.14),
        (-1.42, -0.12, 0.30),
        materials["chassis"],
        collection,
        bevel=0.02,
        parent=root,
        sgw_kind="ROBOT_VISUAL",
        collision_shape="NONE",
    )
    create_box(
        "RAMMER_SideSkirt_R",
        (0.10, 1.55, 0.14),
        (1.42, -0.12, 0.30),
        materials["chassis"],
        collection,
        bevel=0.02,
        parent=root,
        sgw_kind="ROBOT_VISUAL",
        collision_shape="NONE",
    )
    create_box(
        "RAMMER_RearBumper",
        (2.45, 0.24, 0.42),
        (0.0, -1.28, 0.38),
        materials["blackened"],
        collection,
        bevel=0.04,
        parent=root,
        sgw_kind="ROBOT_VISUAL",
        collision_shape="NONE",
    )
    create_box(
        "RAMMER_BatteryCover",
        (0.90, 0.55, 0.10),
        (0.0, -0.55, 0.84),
        materials["brushed"],
        collection,
        bevel=0.02,
        parent=root,
        sgw_kind="ROBOT_VISUAL",
        collision_shape="NONE",
    )
    add_tow_point("RAMMER_TowCleat", (0.0, -1.42, 0.52), root, collection, materials)
    add_lift_eye("RAMMER_LiftEye_FL", (-1.20, 0.85, 0.72), root, collection, materials)
    add_lift_eye("RAMMER_LiftEye_FR", (1.20, 0.85, 0.72), root, collection, materials)
    add_lift_eye("RAMMER_LiftEye_RL", (-1.15, -1.05, 0.72), root, collection, materials)
    add_lift_eye("RAMMER_LiftEye_RR", (1.15, -1.05, 0.72), root, collection, materials)
    for i, (bx, by) in enumerate(((-0.95, 0.15), (0.95, 0.15), (-0.95, -0.75), (0.95, -0.75), (0.0, -1.10))):
        add_bolt_detail(f"RAMMER_Bolt_{i}", (bx, by, 0.76), root, collection, materials)
    add_socket(root, collection, "FRONT", "FRONT", (0.0, 1.85, 0.28), accepts=("armor_wedge", "weapon_vertical_spinner"))
    add_socket(root, collection, "TOP_A", "TOP", (0.0, 0.10, 0.82), accepts=("armor_plate_flat", "weapon_hammer"))
    add_socket(root, collection, "INTERNAL_POWER", "INTERNAL", (0.0, -0.25, 0.42), accepts=("battery_standard", "motor_drive"))
    add_bot_identity(
        root,
        collection,
        materials,
        class_label=spec.display_name,
        story_name=spec.story_name,
        unit_mark=spec.unit_mark,
        color_material=materials["red"],
        stripe_z=0.74,
    )
    return root


def build_ripper(
    spec: BotSpec,
    collection: bpy.types.Collection,
    materials: dict[str, bpy.types.Material],
) -> bpy.types.Object:
    """Keelcutter — ship-hull cutting language (class: Ripper)."""
    root = create_bot_root(spec, collection)
    create_box(
        "RIPPER_Chassis-collision",
        (2.55, 2.25, 0.52),
        (0.0, -0.32, 0.46),
        materials["chassis"],
        collection,
        bevel=0.10,
        parent=root,
        sgw_kind="ROBOT_PART",
        part_id="chassis_standard",
        category="CHASSIS",
        collision_shape="BOX",
        mass_kg=34.0,
        durability=125.0,
    )
    create_box(
        "RIPPER_BellyPan",
        (2.35, 2.00, 0.08),
        (0.0, -0.28, 0.16),
        materials["blackened"],
        collection,
        bevel=0.02,
        parent=root,
        sgw_kind="ROBOT_VISUAL",
        collision_shape="NONE",
    )
    add_standard_wheels(
        root,
        collection,
        materials,
        x_offset=1.18,
        y_offsets=(-0.78, 0.38),
        wheel_radius=0.34,
        wheel_depth=0.30,
        recessed=True,
    )
    create_box(
        "RIPPER_TopDeck",
        (2.10, 1.35, 0.11),
        (0.0, -0.40, 0.78),
        materials["blackened"],
        collection,
        bevel=0.05,
        parent=root,
        sgw_kind="ROBOT_VISUAL",
        collision_shape="NONE",
    )
    # Restrained crew ID — thin panel, not a blue lid.
    create_box(
        "RIPPER_IDPanel",
        (0.85, 0.28, 0.03),
        (0.0, -0.70, 0.86),
        materials["blue"],
        collection,
        bevel=0.01,
        parent=root,
        sgw_kind="ROBOT_VISUAL",
        collision_shape="NONE",
    )
    # Armored weapon cavity — protects the machine from its own cutter.
    create_box(
        "RIPPER_WeaponGuard_Left",
        (0.26, 1.45, 1.25),
        (-0.78, 1.08, 0.88),
        materials["chassis"],
        collection,
        bevel=0.05,
        parent=root,
        sgw_kind="ROBOT_PART",
        part_id="armor_plate_flat",
        category="ARMOR",
        collision_shape="BOX",
        mass_kg=4.0,
        durability=85.0,
    )
    create_box(
        "RIPPER_WeaponGuard_Right",
        (0.26, 1.45, 1.25),
        (0.78, 1.08, 0.88),
        materials["chassis"],
        collection,
        bevel=0.05,
        parent=root,
        sgw_kind="ROBOT_PART",
        part_id="armor_plate_flat",
        category="ARMOR",
        collision_shape="BOX",
        mass_kg=4.0,
        durability=85.0,
    )
    create_box(
        "RIPPER_CavityBulkhead",
        (1.35, 0.18, 1.05),
        (0.0, 0.42, 0.85),
        materials["blackened"],
        collection,
        bevel=0.04,
        parent=root,
        sgw_kind="ROBOT_VISUAL",
        collision_shape="NONE",
    )
    create_box(
        "RIPPER_CavityRoof",
        (1.45, 0.95, 0.12),
        (0.0, 1.05, 1.42),
        materials["chassis"],
        collection,
        bevel=0.03,
        parent=root,
        sgw_kind="ROBOT_VISUAL",
        collision_shape="NONE",
    )
    create_box(
        "RIPPER_GuardID_L",
        (0.04, 0.55, 0.28),
        (-0.92, 1.05, 0.95),
        materials["blue"],
        collection,
        bevel=0.01,
        parent=root,
        sgw_kind="ROBOT_VISUAL",
        collision_shape="NONE",
    )
    create_box(
        "RIPPER_GuardID_R",
        (0.04, 0.55, 0.28),
        (0.92, 1.05, 0.95),
        materials["blue"],
        collection,
        bevel=0.01,
        parent=root,
        sgw_kind="ROBOT_VISUAL",
        collision_shape="NONE",
    )
    create_box(
        "RIPPER_WeaponCavityFloor",
        (1.20, 1.15, 0.10),
        (0.0, 1.08, 0.22),
        materials["blackened"],
        collection,
        bevel=0.02,
        parent=root,
        sgw_kind="ROBOT_VISUAL",
        collision_shape="NONE",
    )
    # Support cage — shipyard cutter frame language.
    create_box(
        "RIPPER_WeaponArch",
        (1.55, 0.14, 0.18),
        (0.0, 1.65, 1.48),
        materials["brushed"],
        collection,
        bevel=0.03,
        parent=root,
        sgw_kind="ROBOT_VISUAL",
        collision_shape="NONE",
    )
    create_box(
        "RIPPER_CageBar_Front",
        (1.35, 0.10, 0.10),
        (0.0, 1.72, 0.55),
        materials["rail"],
        collection,
        bevel=0.02,
        parent=root,
        sgw_kind="ROBOT_VISUAL",
        collision_shape="NONE",
    )
    for side, sx in (("L", -0.58), ("R", 0.58)):
        create_box(
            f"RIPPER_FrameBrace_{side}",
            (0.14, 0.14, 1.20),
            (sx, 1.52, 0.92),
            materials["rail"],
            collection,
            bevel=0.02,
            parent=root,
            sgw_kind="ROBOT_VISUAL",
            collision_shape="NONE",
        )
        create_box(
            f"RIPPER_CageBrace_{side}",
            (0.10, 0.85, 0.10),
            (sx, 1.20, 1.35),
            materials["rail"],
            collection,
            bevel=0.015,
            parent=root,
            sgw_kind="ROBOT_VISUAL",
            collision_shape="NONE",
        )
    # Heavy bearing blocks + cutter shaft.
    create_box(
        "RIPPER_BearingBlock_L",
        (0.32, 0.38, 0.38),
        (-0.58, 1.18, 0.92),
        materials["blackened"],
        collection,
        bevel=0.04,
        parent=root,
        sgw_kind="ROBOT_VISUAL",
        collision_shape="NONE",
    )
    create_box(
        "RIPPER_BearingBlock_R",
        (0.32, 0.38, 0.38),
        (0.58, 1.18, 0.92),
        materials["blackened"],
        collection,
        bevel=0.04,
        parent=root,
        sgw_kind="ROBOT_VISUAL",
        collision_shape="NONE",
    )
    create_cylinder(
        "RIPPER_Bearing_L",
        0.18,
        0.20,
        (-0.58, 1.18, 0.92),
        materials["brushed"],
        collection,
        rotation=(0.0, math.radians(90.0), 0.0),
        vertices=24,
        bevel=0.01,
        parent=root,
        smooth=True,
        sgw_kind="ROBOT_VISUAL",
        collision_shape="NONE",
    )
    create_cylinder(
        "RIPPER_Bearing_R",
        0.18,
        0.20,
        (0.58, 1.18, 0.92),
        materials["brushed"],
        collection,
        rotation=(0.0, math.radians(90.0), 0.0),
        vertices=24,
        bevel=0.01,
        parent=root,
        smooth=True,
        sgw_kind="ROBOT_VISUAL",
        collision_shape="NONE",
    )
    create_cylinder(
        "RIPPER_WeaponShaft",
        0.10,
        1.25,
        (0.0, 1.18, 0.92),
        materials["weapon"],
        collection,
        rotation=(0.0, math.radians(90.0), 0.0),
        vertices=20,
        bevel=0.0,
        parent=root,
        smooth=True,
        sgw_kind="ROBOT_VISUAL",
        collision_shape="NONE",
    )
    weapon_pivot = create_empty(
        "RIPPER_WeaponPivot",
        (0.0, 1.18, 0.92),
        collection,
        parent=root,
        display_type="CIRCLE",
        display_size=0.42,
        sgw_kind="RUNTIME_WEAPON_PIVOT",
        runtime_joint="HINGE",
        weapon_type="VERTICAL_SPINNER",
        weapon_axis_local=[1.0, 0.0, 0.0],
        server_authority_required=True,
    )
    create_cylinder(
        "RIPPER_VerticalSpinner-collision",
        1.05,
        0.42,
        (0.0, 0.0, 0.0),
        materials["weapon"],
        collection,
        rotation=(0.0, math.radians(90.0), 0.0),
        vertices=64,
        bevel=0.04,
        parent=weapon_pivot,
        smooth=True,
        sgw_kind="ROBOT_PART",
        part_id="weapon_vertical_spinner",
        category="WEAPON",
        collision_shape="CYLINDER",
        mass_kg=18.0,
        durability=80.0,
        weapon_type="VERTICAL_SPINNER",
        weapon_axis_local=[1.0, 0.0, 0.0],
        max_angular_speed_rad_s=115.0,
        power_draw_kw=8.0,
        server_damage_authority=True,
        runtime_joint="HINGE",
    )
    create_cylinder(
        "RIPPER_DiscHub",
        0.32,
        0.48,
        (0.0, 0.0, 0.0),
        materials["blackened"],
        collection,
        rotation=(0.0, math.radians(90.0), 0.0),
        vertices=32,
        bevel=0.02,
        parent=weapon_pivot,
        smooth=True,
        sgw_kind="ROBOT_VISUAL",
        collision_shape="NONE",
        follows_weapon_pivot=True,
    )
    create_cylinder(
        "RIPPER_CutterRim",
        0.95,
        0.10,
        (0.0, 0.0, 0.0),
        materials["hardened"],
        collection,
        rotation=(0.0, math.radians(90.0), 0.0),
        vertices=48,
        bevel=0.01,
        parent=weapon_pivot,
        smooth=True,
        sgw_kind="ROBOT_VISUAL",
        collision_shape="NONE",
        follows_weapon_pivot=True,
    )
    for index in range(10):
        angle = index * 36.0
        rad = math.radians(angle)
        create_box(
            f"RIPPER_Tooth_{index + 1}",
            (0.52, 0.18, 0.16),
            (0.0, math.sin(rad) * 0.92, math.cos(rad) * 0.92),
            materials["hardened"],
            collection,
            rotation=(math.radians(angle), 0.0, 0.0),
            bevel=0.02,
            parent=weapon_pivot,
            sgw_kind="ROBOT_VISUAL",
            collision_shape="NONE",
            follows_weapon_pivot=True,
        )
    # Keel forks / self-weapon splitters.
    create_wedge(
        "RIPPER_FrontFork_Left-collision",
        0.68,
        1.30,
        0.24,
        (-1.05, 1.28, 0.06),
        materials["hardened"],
        collection,
        parent=root,
        sgw_kind="ROBOT_PART",
        part_id="armor_wedge",
        category="ARMOR",
        collision_shape="CONVEX",
        mass_kg=4.0,
        durability=100.0,
    )
    create_wedge(
        "RIPPER_FrontFork_Right-collision",
        0.68,
        1.30,
        0.24,
        (1.05, 1.28, 0.06),
        materials["hardened"],
        collection,
        parent=root,
        sgw_kind="ROBOT_PART",
        part_id="armor_wedge",
        category="ARMOR",
        collision_shape="CONVEX",
        mass_kg=4.0,
        durability=100.0,
    )
    create_box(
        "RIPPER_SplitterBlade",
        (0.08, 0.95, 0.55),
        (0.0, 1.55, 0.45),
        materials["weapon"],
        collection,
        bevel=0.02,
        parent=root,
        sgw_kind="ROBOT_VISUAL",
        collision_shape="NONE",
    )
    for i, (bx, by, bz) in enumerate(((-0.75, 0.35, 0.86), (0.75, 0.35, 0.86), (0.0, -0.85, 0.86), (-0.55, 1.45, 1.45), (0.55, 1.45, 1.45))):
        add_bolt_detail(f"RIPPER_Bolt_{i}", (bx, by, bz), root, collection, materials)
    add_socket(root, collection, "WEAPON_FRONT", "WEAPON_FRONT", (0.0, 1.18, 0.88), accepts=("weapon_vertical_spinner",))
    add_socket(root, collection, "TOP_A", "TOP", (0.0, -0.20, 0.90), accepts=("armor_plate_flat",))
    add_socket(root, collection, "INTERNAL_POWER", "INTERNAL", (0.0, -0.35, 0.48), accepts=("battery_standard", "motor_drive"))
    add_bot_identity(
        root,
        collection,
        materials,
        class_label=spec.display_name,
        story_name=spec.story_name,
        unit_mark=spec.unit_mark,
        color_material=materials["blue"],
        stripe_z=0.84,
    )
    return root


def build_maul(
    spec: BotSpec,
    collection: bpy.types.Collection,
    materials: dict[str, bpy.types.Material],
) -> bpy.types.Object:
    """Pilebreaker — dock pile-driver language (class: Maul)."""
    root = create_bot_root(spec, collection)
    # Wide planted chassis for pile-driver stability.
    create_box(
        "MAUL_Chassis-collision",
        (3.05, 2.45, 0.55),
        (0.0, -0.15, 0.48),
        materials["chassis"],
        collection,
        bevel=0.11,
        parent=root,
        sgw_kind="ROBOT_PART",
        part_id="chassis_standard",
        category="CHASSIS",
        collision_shape="BOX",
        mass_kg=34.0,
        durability=125.0,
    )
    create_box(
        "MAUL_BellyPan",
        (2.85, 2.20, 0.09),
        (0.0, -0.12, 0.16),
        materials["blackened"],
        collection,
        bevel=0.02,
        parent=root,
        sgw_kind="ROBOT_VISUAL",
        collision_shape="NONE",
    )
    add_standard_wheels(
        root,
        collection,
        materials,
        x_offset=1.38,
        y_offsets=(-0.85, 0.55),
        wheel_radius=0.36,
        wheel_depth=0.34,
        recessed=True,
    )
    create_wedge(
        "MAUL_FrontWedge-collision",
        2.90,
        1.10,
        0.32,
        (0.0, 1.35, 0.06),
        materials["hardened"],
        collection,
        parent=root,
        sgw_kind="ROBOT_PART",
        part_id="armor_wedge",
        category="ARMOR",
        collision_shape="CONVEX",
        mass_kg=8.0,
        durability=105.0,
    )
    create_box(
        "MAUL_SideArmor_L",
        (0.16, 2.00, 0.52),
        (-1.58, -0.05, 0.52),
        materials["chassis"],
        collection,
        bevel=0.04,
        parent=root,
        sgw_kind="ROBOT_VISUAL",
        collision_shape="NONE",
    )
    create_box(
        "MAUL_SideArmor_R",
        (0.16, 2.00, 0.52),
        (1.58, -0.05, 0.52),
        materials["chassis"],
        collection,
        bevel=0.04,
        parent=root,
        sgw_kind="ROBOT_VISUAL",
        collision_shape="NONE",
    )
    create_box(
        "MAUL_IDPanel_L",
        (0.04, 0.65, 0.18),
        (-1.67, -0.08, 0.58),
        materials["gold"],
        collection,
        bevel=0.01,
        parent=root,
        sgw_kind="ROBOT_VISUAL",
        collision_shape="NONE",
    )
    create_box(
        "MAUL_IDPanel_R",
        (0.04, 0.65, 0.18),
        (1.67, -0.08, 0.58),
        materials["gold"],
        collection,
        bevel=0.01,
        parent=root,
        sgw_kind="ROBOT_VISUAL",
        collision_shape="NONE",
    )
    # Pile-driver hammer tower — tall, braced, with axle and stops.
    create_box(
        "MAUL_HammerTower",
        (0.78, 0.78, 1.25),
        (0.0, 0.08, 1.15),
        materials["blackened"],
        collection,
        bevel=0.06,
        parent=root,
        sgw_kind="ROBOT_VISUAL",
        collision_shape="NONE",
    )
    create_box(
        "MAUL_TowerCap",
        (0.95, 0.95, 0.14),
        (0.0, 0.08, 1.82),
        materials["brushed"],
        collection,
        bevel=0.03,
        parent=root,
        sgw_kind="ROBOT_VISUAL",
        collision_shape="NONE",
    )
    create_box(
        "MAUL_TowerBrace_L",
        (0.18, 0.65, 0.95),
        (-0.58, 0.08, 1.00),
        materials["rail"],
        collection,
        bevel=0.03,
        parent=root,
        sgw_kind="ROBOT_VISUAL",
        collision_shape="NONE",
    )
    create_box(
        "MAUL_TowerBrace_R",
        (0.18, 0.65, 0.95),
        (0.58, 0.08, 1.00),
        materials["rail"],
        collection,
        bevel=0.03,
        parent=root,
        sgw_kind="ROBOT_VISUAL",
        collision_shape="NONE",
    )
    create_box(
        "MAUL_DiagonalBrace_L",
        (0.12, 0.85, 0.12),
        (-0.85, -0.35, 0.95),
        materials["rail"],
        collection,
        rotation=(0.0, 0.0, math.radians(28.0)),
        bevel=0.02,
        parent=root,
        sgw_kind="ROBOT_VISUAL",
        collision_shape="NONE",
    )
    create_box(
        "MAUL_DiagonalBrace_R",
        (0.12, 0.85, 0.12),
        (0.85, -0.35, 0.95),
        materials["rail"],
        collection,
        rotation=(0.0, 0.0, math.radians(-28.0)),
        bevel=0.02,
        parent=root,
        sgw_kind="ROBOT_VISUAL",
        collision_shape="NONE",
    )
    create_cylinder(
        "MAUL_HammerPivot",
        0.15,
        1.45,
        (0.0, 0.08, 1.42),
        materials["weapon"],
        collection,
        rotation=(0.0, math.radians(90.0), 0.0),
        vertices=32,
        bevel=0.02,
        parent=root,
        smooth=True,
        sgw_kind="ROBOT_PART",
        category="WEAPON_MOUNT",
        collision_shape="CYLINDER",
        mass_kg=5.0,
        durability=115.0,
    )
    create_cylinder(
        "MAUL_Bearing_L",
        0.20,
        0.18,
        (-0.60, 0.08, 1.42),
        materials["brushed"],
        collection,
        rotation=(0.0, math.radians(90.0), 0.0),
        vertices=24,
        bevel=0.01,
        parent=root,
        smooth=True,
        sgw_kind="ROBOT_VISUAL",
        collision_shape="NONE",
    )
    create_cylinder(
        "MAUL_Bearing_R",
        0.20,
        0.18,
        (0.60, 0.08, 1.42),
        materials["brushed"],
        collection,
        rotation=(0.0, math.radians(90.0), 0.0),
        vertices=24,
        bevel=0.01,
        parent=root,
        smooth=True,
        sgw_kind="ROBOT_VISUAL",
        collision_shape="NONE",
    )
    create_box(
        "MAUL_HammerStop_Rear",
        (0.60, 0.20, 0.24),
        (0.0, -0.48, 1.48),
        materials["hazard"],
        collection,
        bevel=0.03,
        parent=root,
        sgw_kind="ROBOT_VISUAL",
        collision_shape="NONE",
    )
    create_box(
        "MAUL_HammerStop_Front",
        (0.55, 0.16, 0.18),
        (0.0, 0.55, 1.55),
        materials["hazard_stripe"],
        collection,
        bevel=0.02,
        parent=root,
        sgw_kind="ROBOT_VISUAL",
        collision_shape="NONE",
    )
    # Protected drive / winch mechanism under the tower.
    create_box(
        "MAUL_MechanismCover",
        (1.05, 0.85, 0.38),
        (0.0, -0.20, 0.92),
        materials["brushed"],
        collection,
        bevel=0.04,
        parent=root,
        sgw_kind="ROBOT_VISUAL",
        collision_shape="NONE",
    )
    create_box(
        "MAUL_MechanismGuard",
        (1.15, 0.12, 0.32),
        (0.0, 0.28, 0.95),
        materials["blackened"],
        collection,
        bevel=0.02,
        parent=root,
        sgw_kind="ROBOT_VISUAL",
        collision_shape="NONE",
    )
    create_cylinder(
        "MAUL_DriveDrum",
        0.16,
        0.55,
        (0.0, -0.15, 0.95),
        materials["weapon"],
        collection,
        rotation=(0.0, math.radians(90.0), 0.0),
        vertices=20,
        bevel=0.01,
        parent=root,
        smooth=True,
        sgw_kind="ROBOT_VISUAL",
        collision_shape="NONE",
    )
    weapon_pivot = create_empty(
        "MAUL_HammerWeaponPivot",
        (0.0, 0.08, 1.42),
        collection,
        parent=root,
        display_type="CIRCLE",
        display_size=0.38,
        sgw_kind="RUNTIME_WEAPON_PIVOT",
        runtime_joint="HINGE",
        weapon_type="HAMMER",
        weapon_axis_local=[1.0, 0.0, 0.0],
        max_swing_degrees=115.0,
        server_authority_required=True,
    )
    weapon_pivot.rotation_euler = (math.radians(68.0), 0.0, 0.0)
    hammer_arm = create_box(
        "MAUL_HammerArm-collision",
        (0.26, 2.35, 0.22),
        (0.0, 1.12, 0.0),
        materials["weapon"],
        collection,
        bevel=0.04,
        parent=weapon_pivot,
        sgw_kind="ROBOT_PART",
        part_id="weapon_hammer",
        category="WEAPON",
        collision_shape="BOX",
        mass_kg=10.0,
        durability=90.0,
        weapon_type="HAMMER",
        weapon_axis_local=[1.0, 0.0, 0.0],
        max_swing_degrees=115.0,
        power_draw_kw=5.0,
        server_damage_authority=True,
        runtime_joint="HINGE",
    )
    create_box(
        "MAUL_ArmReinforcement",
        (0.14, 1.75, 0.10),
        (0.0, 1.00, 0.14),
        materials["brushed"],
        collection,
        bevel=0.01,
        parent=weapon_pivot,
        sgw_kind="ROBOT_VISUAL",
        collision_shape="NONE",
        follows_weapon_pivot=True,
    )
    # Impact head — pile-driver mass, not a toy mallet.
    create_box(
        "MAUL_HammerHead-collision",
        (1.25, 0.62, 0.78),
        (0.0, 2.40, 0.05),
        materials["hardened"],
        collection,
        bevel=0.08,
        parent=weapon_pivot,
        sgw_kind="ROBOT_PART",
        part_id="weapon_hammer",
        category="WEAPON",
        collision_shape="BOX",
        mass_kg=5.0,
        durability=95.0,
        weapon_type="HAMMER_HEAD",
        parent_weapon=hammer_arm.name,
        server_damage_authority=True,
        follows_weapon_pivot=True,
    )
    create_box(
        "MAUL_HammerFace",
        (0.95, 0.20, 0.62),
        (0.0, 2.70, 0.05),
        materials["weapon"],
        collection,
        bevel=0.03,
        parent=weapon_pivot,
        sgw_kind="ROBOT_VISUAL",
        collision_shape="NONE",
        follows_weapon_pivot=True,
    )
    create_cylinder(
        "MAUL_ImpactBoss",
        0.22,
        0.35,
        (0.0, 2.78, 0.05),
        materials["hardened"],
        collection,
        rotation=(math.radians(90.0), 0.0, 0.0),
        vertices=24,
        bevel=0.02,
        parent=weapon_pivot,
        smooth=True,
        sgw_kind="ROBOT_VISUAL",
        collision_shape="NONE",
        follows_weapon_pivot=True,
    )
    create_box(
        "MAUL_HammerSpike",
        (0.30, 0.30, 0.55),
        (0.0, 2.62, 0.48),
        materials["hardened"],
        collection,
        bevel=0.03,
        parent=weapon_pivot,
        sgw_kind="ROBOT_VISUAL",
        collision_shape="NONE",
        follows_weapon_pivot=True,
    )
    create_box(
        "MAUL_TopArmor",
        (2.40, 1.25, 0.12),
        (0.0, -0.40, 0.82),
        materials["blackened"],
        collection,
        bevel=0.05,
        parent=root,
        sgw_kind="ROBOT_PART",
        part_id="armor_plate_flat",
        category="ARMOR",
        collision_shape="BOX",
        mass_kg=6.0,
        durability=85.0,
    )
    # Rear counterweight / ballast for swing stability.
    create_box(
        "MAUL_Counterweight",
        (1.65, 0.55, 0.38),
        (0.0, -1.15, 0.58),
        materials["rail"],
        collection,
        bevel=0.04,
        parent=root,
        sgw_kind="ROBOT_VISUAL",
        collision_shape="NONE",
    )
    create_box(
        "MAUL_BallastBar",
        (1.85, 0.18, 0.18),
        (0.0, -1.35, 0.42),
        materials["weapon"],
        collection,
        bevel=0.02,
        parent=root,
        sgw_kind="ROBOT_VISUAL",
        collision_shape="NONE",
    )
    add_lift_eye("MAUL_LiftEye_L", (-1.25, -0.85, 0.88), root, collection, materials)
    add_lift_eye("MAUL_LiftEye_R", (1.25, -0.85, 0.88), root, collection, materials)
    for i, (bx, by, bz) in enumerate(((-1.0, -0.4, 0.90), (1.0, -0.4, 0.90), (0.0, 0.45, 1.70), (-0.45, 0.08, 1.55), (0.45, 0.08, 1.55))):
        add_bolt_detail(f"MAUL_Bolt_{i}", (bx, by, bz), root, collection, materials)
    add_socket(root, collection, "WEAPON_TOP", "WEAPON_TOP", (0.0, 0.20, 1.35), accepts=("weapon_hammer",))
    add_socket(root, collection, "FRONT", "FRONT", (0.0, 1.75, 0.24), accepts=("armor_wedge",))
    add_socket(root, collection, "INTERNAL_POWER", "INTERNAL", (0.0, -0.30, 0.48), accepts=("battery_standard", "motor_drive"))
    add_bot_identity(
        root,
        collection,
        materials,
        class_label=spec.display_name,
        story_name=spec.story_name,
        unit_mark=spec.unit_mark,
        color_material=materials["gold"],
        stripe_z=0.86,
    )
    return root


def build_starter_bots(
    collections: dict[str, bpy.types.Collection],
    materials: dict[str, bpy.types.Material],
) -> dict[str, bpy.types.Object]:
    bots = collections["bots"]
    builders = {
        "rammer": build_rammer,
        "ripper": build_ripper,
        "maul": build_maul,
    }
    roots: dict[str, bpy.types.Object] = {}
    for spec in BOT_SPECS:
        root = builders[spec.bot_id](spec, bots, materials)
        roots[spec.bot_id] = root
    return roots


# ---------------------------------------------------------------------------
# Modular part library
# ---------------------------------------------------------------------------


def build_part_library(
    collections: dict[str, bpy.types.Collection],
    materials: dict[str, bpy.types.Material],
) -> dict[str, str]:
    library = collections["part_library"]
    library.hide_render = True

    root = create_empty(
        "PART_LIBRARY_ROOT",
        (0.0, -15.0, 0.0),
        library,
        display_type="CUBE",
        display_size=0.8,
        sgw_kind="PART_LIBRARY_ROOT",
        catalog_schema="sgw.robot_combat.parts.v1",
    )

    display_map: dict[str, str] = {}
    x_positions = [-8.0, -5.5, -3.0, -0.5, 2.0, 4.5, 7.0, 9.5]

    # Compact chassis.
    compact = create_box(
        "PART_chassis_compact",
        (2.20, 1.75, 0.48),
        (x_positions[0], 0.0, 0.40),
        materials["chassis"],
        library,
        bevel=0.10,
        parent=root,
        sgw_kind="BUILD_PART_TEMPLATE",
        part_id="chassis_compact",
        category="CHASSIS",
        collision_shape="BOX",
    )
    display_map["chassis_compact"] = compact.name

    standard = create_box(
        "PART_chassis_standard",
        (2.75, 2.15, 0.58),
        (x_positions[1], 0.0, 0.46),
        materials["chassis"],
        library,
        bevel=0.12,
        parent=root,
        sgw_kind="BUILD_PART_TEMPLATE",
        part_id="chassis_standard",
        category="CHASSIS",
        collision_shape="BOX",
    )
    display_map["chassis_standard"] = standard.name

    small_wheel = create_cylinder(
        "PART_wheel_drive_small",
        0.32,
        0.27,
        (x_positions[2], 0.0, 0.34),
        materials["rubber"],
        library,
        rotation=(0.0, math.radians(90.0), 0.0),
        vertices=36,
        parent=root,
        smooth=True,
        sgw_kind="BUILD_PART_TEMPLATE",
        part_id="wheel_drive_small",
        category="DRIVE",
        collision_shape="CYLINDER",
    )
    display_map["wheel_drive_small"] = small_wheel.name

    large_wheel = create_cylinder(
        "PART_wheel_drive_large",
        0.43,
        0.34,
        (x_positions[3], 0.0, 0.43),
        materials["rubber"],
        library,
        rotation=(0.0, math.radians(90.0), 0.0),
        vertices=40,
        parent=root,
        smooth=True,
        sgw_kind="BUILD_PART_TEMPLATE",
        part_id="wheel_drive_large",
        category="DRIVE",
        collision_shape="CYLINDER",
    )
    display_map["wheel_drive_large"] = large_wheel.name

    plate = create_box(
        "PART_armor_plate_flat",
        (1.8, 1.0, 0.14),
        (x_positions[4], 0.0, 0.18),
        materials["blue"],
        library,
        bevel=0.05,
        parent=root,
        sgw_kind="BUILD_PART_TEMPLATE",
        part_id="armor_plate_flat",
        category="ARMOR",
        collision_shape="BOX",
    )
    display_map["armor_plate_flat"] = plate.name

    wedge = create_wedge(
        "PART_armor_wedge",
        2.4,
        1.1,
        0.42,
        (x_positions[5], 0.0, 0.05),
        materials["red"],
        library,
        parent=root,
        sgw_kind="BUILD_PART_TEMPLATE",
        part_id="armor_wedge",
        category="ARMOR",
        collision_shape="CONVEX",
    )
    display_map["armor_wedge"] = wedge.name

    spinner = create_cylinder(
        "PART_weapon_vertical_spinner",
        0.78,
        0.28,
        (x_positions[6], 0.0, 0.82),
        materials["weapon"],
        library,
        rotation=(0.0, math.radians(90.0), 0.0),
        vertices=64,
        parent=root,
        smooth=True,
        sgw_kind="BUILD_PART_TEMPLATE",
        part_id="weapon_vertical_spinner",
        category="WEAPON",
        collision_shape="CYLINDER",
    )
    display_map["weapon_vertical_spinner"] = spinner.name

    hammer_arm = create_box(
        "PART_weapon_hammer",
        (0.28, 2.05, 0.24),
        (x_positions[7], 0.0, 0.70),
        materials["weapon"],
        library,
        rotation=(math.radians(-18.0), 0.0, 0.0),
        bevel=0.05,
        parent=root,
        sgw_kind="BUILD_PART_TEMPLATE",
        part_id="weapon_hammer",
        category="WEAPON",
        collision_shape="BOX",
    )
    create_box(
        "PART_weapon_hammer_head",
        (1.0, 0.42, 0.34),
        (x_positions[7], 0.96, 1.02),
        materials["gold"],
        library,
        rotation=(math.radians(-18.0), 0.0, 0.0),
        bevel=0.07,
        parent=root,
        sgw_kind="BUILD_PART_TEMPLATE_CHILD",
        parent_part_id="weapon_hammer",
        category="WEAPON",
        collision_shape="BOX",
    )
    display_map["weapon_hammer"] = hammer_arm.name

    # Internal parts are represented as simple templates for the builder UI.
    battery = create_box(
        "PART_battery_standard",
        (0.90, 0.62, 0.34),
        (-2.0, -2.2, 0.28),
        materials["green"],
        library,
        bevel=0.06,
        parent=root,
        sgw_kind="BUILD_PART_TEMPLATE",
        part_id="battery_standard",
        category="POWER",
        collision_shape="BOX",
    )
    display_map["battery_standard"] = battery.name

    motor = create_cylinder(
        "PART_motor_drive",
        0.28,
        0.55,
        (0.0, -2.2, 0.32),
        materials["weapon"],
        library,
        rotation=(0.0, math.radians(90.0), 0.0),
        vertices=36,
        parent=root,
        smooth=True,
        sgw_kind="BUILD_PART_TEMPLATE",
        part_id="motor_drive",
        category="POWERTRAIN",
        collision_shape="CYLINDER",
    )
    display_map["motor_drive"] = motor.name

    # Attach full part metadata and explicit attachment sockets to every
    # corresponding template. These sockets are exported as named empties and
    # duplicated in the JSON manifest for deterministic server validation.
    for spec in PART_SPECS:
        object_name = display_map.get(spec.part_id)
        if object_name is None:
            continue
        obj = bpy.data.objects[object_name]
        for key, value in asdict(spec).items():
            obj[key] = value
        obj["server_validation_required"] = True
        obj["player_placeable"] = True
        obj["grid_increment_m"] = 0.125

        socket_ids: list[str] = []
        for definition in PART_SOCKET_DEFINITIONS.get(spec.part_id, ()):
            socket = add_socket(
                obj,
                library,
                str(definition["socket_id"]),
                str(definition["socket_group"]),
                definition["location"],
                local_rotation=definition.get("rotation", (0.0, 0.0, 0.0)),
                accepts=definition.get("accepts", ()),
                socket_role=str(definition["socket_role"]),
                owner_part_id=spec.part_id,
            )
            socket_ids.append(str(socket["socket_id"]))
        obj["socket_ids_json"] = json.dumps(socket_ids, separators=(",", ":"))

    return display_map


# ---------------------------------------------------------------------------
# Manifest, exports, and proof render
# ---------------------------------------------------------------------------


def descendants_of(root: bpy.types.Object) -> list[bpy.types.Object]:
    result = [root]
    stack = list(root.children)
    while stack:
        child = stack.pop()
        result.append(child)
        stack.extend(child.children)
    return result


def export_glb(filepath: Path, objects: Iterable[bpy.types.Object]) -> None:
    filepath.parent.mkdir(parents=True, exist_ok=True)
    view_names = {obj.name for obj in bpy.context.view_layer.objects}
    object_list = [obj for obj in objects if obj.name in view_names]
    if not object_list:
        raise RuntimeError(f"No exportable objects supplied for {filepath.name}")

    object_states = {
        obj.name: (obj.hide_viewport, obj.hide_render, obj.hide_get())
        for obj in object_list
    }
    collection_states: dict[str, tuple[bool, bool]] = {}
    for obj in object_list:
        for collection in obj.users_collection:
            if collection.name not in collection_states:
                collection_states[collection.name] = (
                    collection.hide_viewport,
                    collection.hide_render,
                )
            collection.hide_viewport = False
            collection.hide_render = False
        obj.hide_viewport = False
        obj.hide_render = False
        obj.hide_set(False)

    try:
        select_only(object_list)

        # glTF carries object names, hierarchy, transforms, PBR materials, and
        # custom properties (extras). Collision behavior is still created in
        # the runtime from the explicit manifest and object tags.
        bpy.ops.export_scene.gltf(
            filepath=str(filepath),
            export_format="GLB",
            use_selection=True,
            export_extras=True,
            export_apply=True,
            export_cameras=True,
            export_lights=True,
        )
    finally:
        for name, (hide_viewport, hide_render, hidden) in object_states.items():
            obj = bpy.data.objects.get(name)
            if obj is None:
                continue
            obj.hide_viewport = hide_viewport
            obj.hide_render = hide_render
            obj.hide_set(hidden)
        for name, (hide_viewport, hide_render) in collection_states.items():
            collection = bpy.data.collections.get(name)
            if collection is None:
                continue
            collection.hide_viewport = hide_viewport
            collection.hide_render = hide_render

    log(f"Exported {filepath}")


def write_manifest(
    arena_manifest: dict[str, Any],
    roots: dict[str, bpy.types.Object],
    part_display_map: dict[str, str],
) -> Path:
    manifest = {
        "schema_version": SCHEMA_VERSION,
        "build_version": BUILD_VERSION,
        "game": {
            "title": GAME_TITLE,
            "platform_side": "FREE",
            "value_class": "NO_VALUE",
            "public_name_status": "WORKING_TITLE",
            "online_architecture": "SERVER_AUTHORITATIVE",
        },
        "coordinate_system": {
            "source": "BLENDER_Z_UP_METERS",
            "runtime_target": "GODOT_Y_UP_METERS",
            "exchange_format": "GLB_GLTF_2_0",
        },
        "arena": arena_manifest,
        "starter_bots": [asdict(spec) for spec in BOT_SPECS],
        "bot_roots": {bot_id: root.name for bot_id, root in roots.items()},
        "part_catalog": [asdict(spec) for spec in PART_SPECS],
        "part_template_objects": part_display_map,
        "part_socket_catalog": {
            part_id: [dict(definition) for definition in definitions]
            for part_id, definitions in PART_SOCKET_DEFINITIONS.items()
        },
        "builder_rules_v1": {
            "construction_model": "APPROVED_MODULAR_PARTS_WITH_FREE_COMBINATION",
            "grid_increment_m": 0.125,
            "maximum_mass_kg": 120.0,
            "maximum_dimensions_m": [3.8, 3.8, 2.4],
            "maximum_part_count": 64,
            "minimum_drive_wheels": 2,
            "maximum_active_weapons": 2,
            "requires_battery": True,
            "requires_drive_power": True,
            "requires_valid_attachment_graph": True,
            "attachment_compatibility_source": "part_socket_catalog",
            "requires_collision_envelope": True,
            "server_recomputes_mass_power_and_legality": True,
            "client_metadata_is_never_authoritative": True,
            "arbitrary_executable_uploads_allowed": False,
            "custom_visual_shells": "FUTURE_HELD_FEATURE",
        },
        "combat_rules_v1": {
            "match_length_seconds": 180,
            "win_conditions": ["KNOCKOUT", "IMMOBILIZATION", "ARENA_OUT", "JUDGES_DECISION"],
            "damage_authority": "SERVER_ONLY",
            "physics_authority": "SERVER_ONLY",
            "hazards_active": False,
            "disconnect_rule": "BOT_COASTS_TO_STOP_THEN SERVER_SAFE_MODE",
        },
        "exports": {
            "arena": "exports/sgw_robot_combat_arena.glb",
            "rammer": "exports/bot_rammer.glb",
            "ripper": "exports/bot_ripper.glb",
            "maul": "exports/bot_maul.glb",
            "part_library": "exports/sgw_robot_part_library.glb",
            "full_scene": "exports/sgw_robot_combat_full_scene.glb",
            "source_blend": BLEND_PATH.name,
        },
    }

    path = MANIFEST_DIR / "sgw_robot_combat_manifest.json"
    path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    log(f"Wrote {path}")
    return path


def render_proof() -> Path:
    render_path = OUTPUT_ROOT / "SGW_Robot_Combat_Arena_Preview.png"
    scene = bpy.context.scene
    scene.render.filepath = str(render_path)
    scene.render.resolution_x = 1920
    scene.render.resolution_y = 1080
    scene.render.resolution_percentage = 70
    overview = bpy.data.objects.get("CAM_Overview")
    if overview is not None:
        scene.camera = overview
    bpy.ops.render.render(write_still=True)
    log(f"Rendered {render_path}")
    return render_path


def build_collections() -> dict[str, bpy.types.Collection]:
    arena_root = new_collection("SGW_ARENA")
    bots_root = new_collection("SGW_STARTER_BOTS")
    parts_root = new_collection("SGW_PART_LIBRARY")
    environment_root = new_collection("SGW_ENVIRONMENT")
    lights_root = new_collection("SGW_LIGHTS")
    cameras_root = new_collection("SGW_CAMERAS")

    return {
        "arena": arena_root,
        "arena_structure": new_collection("SGW_ARENA_STRUCTURE", arena_root),
        "arena_markings": new_collection("SGW_ARENA_MARKINGS", arena_root),
        "arena_hazards": new_collection("SGW_ARENA_HAZARDS", arena_root),
        "arena_ceremony": new_collection("SGW_ARENA_CEREMONY", arena_root),
        "bots": bots_root,
        "part_library": parts_root,
        "environment": environment_root,
        "loc_cutting_hall": new_collection("SGW_LOC_CUTTING_HALL", environment_root),
        "loc_crane_row": new_collection("SGW_LOC_CRANE_ROW", environment_root),
        "loc_crows_nest": new_collection("SGW_LOC_CROWS_NEST", environment_root),
        "loc_crew_bays": new_collection("SGW_LOC_CREW_BAYS", environment_root),
        "loc_wall_of_wrecks": new_collection("SGW_LOC_WALL_OF_WRECKS", environment_root),
        "loc_exterior": new_collection("SGW_LOC_EXTERIOR", environment_root),
        "lights": lights_root,
        "cameras": cameras_root,
    }


def build() -> None:
    ensure_supported_blender()
    prepare_output_folders()
    reset_scene()
    configure_scene()

    collections = build_collections()
    materials = build_materials()

    arena_manifest = build_arena(collections, materials)
    build_render_backdrop(collections, materials)
    build_lighting_and_cameras(collections, materials)
    roots = build_starter_bots(collections, materials)
    part_display_map = build_part_library(collections, materials)

    # Save source before exports so the generated source is durable even if an
    # individual exporter fails.
    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND_PATH))
    log(f"Saved {BLEND_PATH}")

    write_manifest(arena_manifest, roots, part_display_map)

    arena_export_objects: list[bpy.types.Object] = []
    for key in ("arena", "environment", "lights", "cameras"):
        arena_export_objects.extend(list(collections[key].all_objects))
    export_glb(EXPORT_DIR / "sgw_robot_combat_arena.glb", arena_export_objects)

    for bot_id, root in roots.items():
        export_glb(EXPORT_DIR / f"bot_{bot_id}.glb", descendants_of(root))

    export_glb(
        EXPORT_DIR / "sgw_robot_part_library.glb",
        list(collections["part_library"].all_objects),
    )

    full_scene_objects = [
        obj
        for obj in bpy.context.scene.objects
        if obj.name not in {item.name for item in collections["part_library"].all_objects}
    ]
    export_glb(EXPORT_DIR / "sgw_robot_combat_full_scene.glb", full_scene_objects)

    render_proof()
    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND_PATH))

    log("BUILD COMPLETE")
    log(f"Output folder: {OUTPUT_ROOT}")
    log("Generated arena, three starter bots, modular part library, GLB exports, manifest, and preview.")


if __name__ == "__main__":
    try:
        build()
    except Exception:
        log("BUILD FAILED")
        traceback.print_exc()
        raise
