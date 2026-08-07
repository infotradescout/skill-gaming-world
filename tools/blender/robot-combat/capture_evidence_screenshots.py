"""Capture focused evidence renders from the generated SGW Robot Combat scene.

Supports:
  - foundation set (legacy glass-box / early arena proof)
  - Bay 13 Scrapyard story-blockout set (default)

Story naming: Scrapyard = fight / scrap. Never junkyard / trash labels.
"""

from __future__ import annotations

import json
import math
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Iterable, Sequence

import bpy
from mathutils import Vector


REPO_DOCS_EVIDENCE = Path(__file__).resolve().parents[3] / "docs" / "evidence"
DEFAULT_STORY_EVIDENCE = REPO_DOCS_EVIDENCE / "bay13-scrapyard-story-blockout"
DEFAULT_FOUNDATION_EVIDENCE = REPO_DOCS_EVIDENCE / "robot-combat-foundation-20260807"

# Inside-arena product angles so evidence does not shoot through safety glass.
BOT_CAMERA_OFFSETS = {
    "BOT_RAMMER_ROOT": Vector((2.8, -3.6, 1.7)),
    "BOT_RIPPER_ROOT": Vector((-2.6, -3.8, 1.9)),
    "BOT_MAUL_ROOT": Vector((3.4, -3.2, 2.3)),
}

BOT_STORY_NAMES = {
    "BOT_RAMMER_ROOT": "Yard Mule",
    "BOT_RIPPER_ROOT": "Keelcutter",
    "BOT_MAUL_ROOT": "Pilebreaker",
}

LANDMARK_ALIASES: dict[str, tuple[str, ...]] = {
    "exterior": (
        "STORY_ExteriorScrapyard",
        "LANDMARK_ExteriorScrapyard",
        "STORY_Exterior",
        "EXTERIOR_SCRAPYARD",
        "VENUE_Exterior",
        "ARENA_ExteriorApron",
    ),
    "cutting_hall": (
        "STORY_CuttingHall",
        "LANDMARK_CuttingHall",
        "CUTTING_HALL",
        "STORY_Cutting_Hall",
    ),
    "crane_row": (
        "STORY_CraneRow",
        "LANDMARK_CraneRow",
        "CRANE_ROW",
        "STORY_Crane_Row",
        "STORY_RecoveryCrane",
    ),
    "crows_nest": (
        "STORY_CrowsNest",
        "LANDMARK_CrowsNest",
        "CROWS_NEST",
        "STORY_CrowNest",
        "STORY_ControlRoom",
    ),
    "wall_of_wrecks": (
        "STORY_WallOfWrecks",
        "LANDMARK_WallOfWrecks",
        "WALL_OF_WRECKS",
        "STORY_Wall_Of_Wrecks",
    ),
    "crew_bay_1": (
        "STORY_CrewBay_1",
        "STORY_CrewBay_A",
        "LANDMARK_CrewBay_1",
        "CREW_BAY_1",
        "CREW_BAY_A",
    ),
    "crew_bay_2": (
        "STORY_CrewBay_2",
        "STORY_CrewBay_B",
        "LANDMARK_CrewBay_2",
        "CREW_BAY_2",
        "CREW_BAY_B",
    ),
    "crew_bay_3": (
        "STORY_CrewBay_3",
        "STORY_CrewBay_C",
        "LANDMARK_CrewBay_3",
        "CREW_BAY_3",
        "CREW_BAY_C",
    ),
    "transfer_floor": (
        "STORY_TransferFloor",
        "ARENA_Floor-collision",
        "ARENA_TransferFloor",
        "TRANSFER_FLOOR",
    ),
}


@dataclass
class StoryCameraSpec:
    name: str
    lens: float
    location: tuple[float, float, float]
    look_at: tuple[float, float, float]
    role: str
    landmark_key: str | None = None
    clip_end: float = 280.0


# Dedicated story cameras. Capture prefers these; generator also creates them.
STORY_CAMERA_SPECS: tuple[StoryCameraSpec, ...] = (
    StoryCameraSpec(
        "CAM_STORY_Exterior",
        22.0,
        (34.0, -42.0, 16.5),
        (0.0, 2.0, 2.8),
        "STORY_EXTERIOR",
        "exterior",
    ),
    StoryCameraSpec(
        "CAM_STORY_ArenaOverview",
        26.0,
        (18.5, -26.0, 12.8),
        (0.0, 1.0, 0.55),
        "STORY_ARENA_OVERVIEW",
        "transfer_floor",
    ),
    StoryCameraSpec(
        "CAM_STORY_FloorScale",
        24.0,
        (9.2, -10.4, 1.35),
        (-0.8, 1.6, 0.95),
        "STORY_FLOOR_SCALE",
        "transfer_floor",
    ),
    StoryCameraSpec(
        "CAM_STORY_CuttingHall",
        32.0,
        (0.0, 2.5, 3.2),
        (0.0, 14.5, 3.8),
        "STORY_CUTTING_HALL",
        "cutting_hall",
    ),
    StoryCameraSpec(
        "CAM_STORY_CraneRow",
        28.0,
        (-14.0, -8.0, 7.8),
        (0.0, 0.0, 5.5),
        "STORY_CRANE_ROW",
        "crane_row",
    ),
    StoryCameraSpec(
        "CAM_STORY_CrowsNest",
        35.0,
        (8.5, -10.0, 6.5),
        (0.0, 12.5, 7.2),
        "STORY_CROWS_NEST",
        "crows_nest",
    ),
    StoryCameraSpec(
        "CAM_STORY_WallOfWrecks",
        32.0,
        (-4.0, -6.0, 3.4),
        (16.0, 0.0, 3.0),
        "STORY_WALL_OF_WRECKS",
        "wall_of_wrecks",
    ),
    StoryCameraSpec(
        "CAM_STORY_CrewBays",
        28.0,
        (0.0, -18.5, 5.2),
        (0.0, -10.5, 1.8),
        "STORY_CREW_BAYS",
        None,
    ),
    StoryCameraSpec(
        "CAM_STORY_CrewBay_1",
        35.0,
        (-8.5, -16.0, 3.6),
        (-6.0, -11.0, 1.4),
        "STORY_CREW_BAY_1",
        "crew_bay_1",
    ),
    StoryCameraSpec(
        "CAM_STORY_CrewBay_2",
        35.0,
        (0.0, -16.5, 3.6),
        (0.0, -11.0, 1.4),
        "STORY_CREW_BAY_2",
        "crew_bay_2",
    ),
    StoryCameraSpec(
        "CAM_STORY_CrewBay_3",
        35.0,
        (8.5, -16.0, 3.6),
        (6.0, -11.0, 1.4),
        "STORY_CREW_BAY_3",
        "crew_bay_3",
    ),
    StoryCameraSpec(
        "CAM_STORY_YardMule",
        40.0,
        (-1.2, -5.8, 1.7),
        (-4.4, -2.2, 0.55),
        "STORY_YARD_MULE",
        None,
    ),
    StoryCameraSpec(
        "CAM_STORY_Keelcutter",
        40.0,
        (7.4, -5.6, 1.85),
        (4.4, -2.2, 0.55),
        "STORY_KEELCUTTER",
        None,
    ),
    StoryCameraSpec(
        "CAM_STORY_Pilebreaker",
        40.0,
        (3.6, 6.4, 2.1),
        (0.0, 2.8, 0.75),
        "STORY_PILEBREAKER",
        None,
    ),
    StoryCameraSpec(
        "CAM_STORY_ModularParts",
        45.0,
        (3.8, -18.5, 3.2),
        (0.0, -16.0, 1.0),
        "STORY_MODULAR_PARTS",
        None,
    ),
    # Main broadcast composition: three machines, transfer floor, landmarks,
    # enclosure scale, FG/MG/BG depth, no overhead cutting the focal area.
    StoryCameraSpec(
        "CAM_STORY_Composition",
        26.0,
        (17.8, -24.8, 11.6),
        (0.0, 0.8, 0.65),
        "STORY_COMPOSITION",
        "transfer_floor",
    ),
    StoryCameraSpec(
        "CAM_STORY_Silhouette_YardMule",
        50.0,
        (-4.4, -6.8, 1.1),
        (-4.4, -2.2, 0.55),
        "STORY_SILHOUETTE_YARD_MULE",
        None,
    ),
    StoryCameraSpec(
        "CAM_STORY_Silhouette_Keelcutter",
        50.0,
        (4.4, -6.9, 1.15),
        (4.4, -2.2, 0.55),
        "STORY_SILHOUETTE_KEELCUTTER",
        None,
    ),
    StoryCameraSpec(
        "CAM_STORY_Silhouette_Pilebreaker",
        50.0,
        (4.6, 2.8, 1.25),
        (0.0, 2.8, 0.75),
        "STORY_SILHOUETTE_PILEBREAKER",
        None,
    ),
)


@dataclass
class ShotResult:
    shot_id: str
    file: str
    camera: str
    story_purpose: str
    status: str
    notes: str = ""
    targets_found: list[str] = field(default_factory=list)
    targets_missing: list[str] = field(default_factory=list)


def read_cli_arguments(argv: list[str]) -> tuple[str | None, str | None, str]:
    """Return (output_root, evidence_root, mode) where mode is story|foundation."""
    mode = "story"
    trailing: list[str] = []
    if "--" in argv:
        trailing = argv[argv.index("--") + 1 :]
    elif len(argv) >= 2:
        trailing = argv[1:]

    cleaned: list[str] = []
    for token in trailing:
        lowered = token.lower()
        if lowered in {"--story", "story"}:
            mode = "story"
            continue
        if lowered in {"--foundation", "foundation"}:
            mode = "foundation"
            continue
        cleaned.append(token)

    output_root = cleaned[0] if len(cleaned) >= 1 else None
    evidence_root = cleaned[1] if len(cleaned) >= 2 else None
    return output_root, evidence_root, mode


def look_at(camera: bpy.types.Object, target: Vector) -> None:
    direction = target - camera.location
    camera.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


def object_world_center(obj: bpy.types.Object) -> Vector:
    try:
        return Vector(obj.matrix_world.translation)
    except Exception:
        return Vector(obj.location)


def find_object_by_aliases(aliases: Sequence[str]) -> bpy.types.Object | None:
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
        story_loc = str(obj.get("sgw_story_location", "") or obj.get("story_location", "")).lower()
        landmark_id = str(obj.get("landmark_id", "") or obj.get("sgw_landmark", "")).lower()
        for alias in lowered:
            token = alias.replace("story_", "").replace("landmark_", "").replace("_", " ")
            if token and (token in story_loc or token in landmark_id):
                return obj
    return None


def landmark_present(key: str) -> bpy.types.Object | None:
    return find_object_by_aliases(LANDMARK_ALIASES.get(key, ()))


def cameras_collection() -> bpy.types.Collection:
    collection = bpy.data.collections.get("SGW_CAMERAS")
    if collection is None:
        collection = bpy.data.collections.new("SGW_CAMERAS")
        bpy.context.scene.collection.children.link(collection)
    return collection


def ensure_camera_object(
    name: str,
    *,
    lens: float,
    location: Sequence[float],
    look: Sequence[float],
    role: str,
    clip_end: float = 280.0,
    reaim: bool = True,
) -> bpy.types.Object:
    camera = bpy.data.objects.get(name)
    if camera is None:
        data = bpy.data.cameras.new(f"{name}_Data")
        camera = bpy.data.objects.new(name, data)
        cameras_collection().objects.link(camera)
    if camera.data is not None:
        camera.data.lens = lens
        camera.data.sensor_width = 36.0
        if hasattr(camera.data, "clip_start"):
            camera.data.clip_start = 0.1
        if hasattr(camera.data, "clip_end"):
            camera.data.clip_end = clip_end
    if reaim or name not in bpy.data.objects:
        camera.location = Vector(location)
        look_at(camera, Vector(look))
    camera["sgw_kind"] = "CAMERA"
    camera["camera_role"] = role
    camera["sgw_story_camera"] = True
    return camera


def ensure_story_cameras(*, refresh_aim: bool = True) -> dict[str, str]:
    """Create/refresh CAM_STORY_* cameras. Returns camera -> aim source note."""
    notes: dict[str, str] = {}
    for spec in STORY_CAMERA_SPECS:
        look = Vector(spec.look_at)
        aim_note = "fallback_spatial"
        if spec.landmark_key:
            landmark = landmark_present(spec.landmark_key)
            if landmark is not None:
                look = object_world_center(landmark) + Vector((0.0, 0.0, 1.2))
                aim_note = f"landmark:{landmark.name}"
        # Bot-facing story close-ups / silhouettes track live roots when present.
        bot_map = {
            "CAM_STORY_YardMule": "BOT_RAMMER_ROOT",
            "CAM_STORY_Silhouette_YardMule": "BOT_RAMMER_ROOT",
            "CAM_STORY_Keelcutter": "BOT_RIPPER_ROOT",
            "CAM_STORY_Silhouette_Keelcutter": "BOT_RIPPER_ROOT",
            "CAM_STORY_Pilebreaker": "BOT_MAUL_ROOT",
            "CAM_STORY_Silhouette_Pilebreaker": "BOT_MAUL_ROOT",
        }
        bot_name = bot_map.get(spec.name)
        if bot_name:
            bot = bpy.data.objects.get(bot_name)
            if bot is not None:
                origin = object_world_center(bot)
                look = origin + Vector((0.0, 0.0, 0.55))
                aim_note = f"bot:{bot_name}"
                if "Silhouette" in spec.name:
                    facing = bot.rotation_euler.z
                    right = Vector((math.cos(facing), -math.sin(facing), 0.0))
                    location = origin + right * 4.6 + Vector((0.0, 0.0, 1.15))
                else:
                    facing = bot.rotation_euler.z
                    forward = Vector((math.sin(facing), math.cos(facing), 0.0))
                    right = Vector((math.cos(facing), -math.sin(facing), 0.0))
                    location = origin + forward * 3.6 + right * 2.6 + Vector((0.0, 0.0, 1.55))
                ensure_camera_object(
                    spec.name,
                    lens=spec.lens,
                    location=location,
                    look=look,
                    role=spec.role,
                    clip_end=spec.clip_end,
                    reaim=True,
                )
                notes[spec.name] = aim_note
                continue

        if spec.name == "CAM_STORY_CrewBays":
            bay_objs = [landmark_present(k) for k in ("crew_bay_1", "crew_bay_2", "crew_bay_3")]
            found = [obj for obj in bay_objs if obj is not None]
            if found:
                center = sum((object_world_center(obj) for obj in found), Vector()) / len(found)
                look = center + Vector((0.0, 0.0, 1.2))
                aim_note = "landmarks:" + ",".join(obj.name for obj in found)

        if spec.name == "CAM_STORY_ModularParts":
            part = bpy.data.objects.get("PART_chassis_standard")
            if part is not None:
                look = object_world_center(part) + Vector((0.0, 0.0, 0.25))
                aim_note = "part:PART_chassis_standard"

        ensure_camera_object(
            spec.name,
            lens=spec.lens,
            location=spec.location,
            look=look,
            role=spec.role,
            clip_end=spec.clip_end,
            reaim=refresh_aim,
        )
        notes[spec.name] = aim_note
    return notes


def ensure_evidence_camera(scene: bpy.types.Scene) -> bpy.types.Object:
    camera = bpy.data.objects.get("EvidenceCamera")
    if camera is None:
        camera_data = bpy.data.cameras.new("EvidenceCamera_Data")
        camera = bpy.data.objects.new("EvidenceCamera", camera_data)
        bpy.context.scene.collection.objects.link(camera)
    scene.camera = camera
    return camera


def configure_render(scene: bpy.types.Scene, path: Path) -> None:
    for engine in ("BLENDER_EEVEE", "BLENDER_EEVEE_NEXT"):
        try:
            scene.render.engine = engine
            break
        except Exception:
            continue
    scene.render.resolution_x = 1600
    scene.render.resolution_y = 900
    scene.render.resolution_percentage = 100
    scene.render.filepath = str(path)
    scene.render.image_settings.file_format = "PNG"
    scene.view_settings.view_transform = "Standard"
    scene.view_settings.exposure = -0.10


def unhide_for_render(obj: bpy.types.Object) -> None:
    obj.hide_render = False
    obj.hide_viewport = False
    obj.hide_set(False)
    for collection in obj.users_collection:
        collection.hide_render = False
        collection.hide_viewport = False


def ensure_material(name: str, rgba: tuple[float, float, float, float], *, emission: float = 0.0) -> bpy.types.Material:
    material = bpy.data.materials.get(name)
    if material is None:
        material = bpy.data.materials.new(name=name)
        material.use_nodes = True
    principled = material.node_tree.nodes.get("Principled BSDF") if material.use_nodes else None
    if principled is not None:
        if "Base Color" in principled.inputs:
            principled.inputs["Base Color"].default_value = rgba
        if "Alpha" in principled.inputs:
            principled.inputs["Alpha"].default_value = rgba[3]
        emission_strength = principled.inputs.get("Emission Strength")
        if emission_strength is not None:
            emission_strength.default_value = emission
        emission_color = principled.inputs.get("Emission Color") or principled.inputs.get("Emission")
        if emission_color is not None and emission > 0:
            emission_color.default_value = rgba
    if rgba[3] < 1.0 and hasattr(material, "blend_method"):
        material.blend_method = "BLEND"
    return material


def clear_temp_markers(prefix: str = "EVIDENCE_TMP_") -> None:
    for obj in list(bpy.data.objects):
        if obj.name.startswith(prefix):
            bpy.data.objects.remove(obj, do_unlink=True)


def spawn_socket_markers() -> list[bpy.types.Object]:
    clear_temp_markers("EVIDENCE_TMP_SOCKET_")
    material = ensure_material("MAT_EvidenceSocket", (0.15, 0.85, 0.55, 1.0), emission=0.45)
    markers: list[bpy.types.Object] = []
    for obj in bpy.data.objects:
        kind = obj.get("sgw_kind")
        if kind not in {"ATTACHMENT_SOCKET", "RUNTIME_WEAPON_PIVOT"} and not (
            obj.name.startswith("SOCKET_") or "WeaponPivot" in obj.name or obj.name.endswith("HammerPivot")
        ):
            continue
        if obj.name.startswith("PART_"):
            continue
        bpy.ops.mesh.primitive_uv_sphere_add(radius=0.12, location=obj.matrix_world.translation)
        marker = bpy.context.active_object
        marker.name = f"EVIDENCE_TMP_SOCKET_{obj.name}"
        marker.data.materials.append(material)
        markers.append(marker)
    return markers


def apply_collision_overlay() -> list[tuple[bpy.types.Object, list]]:
    material = ensure_material("MAT_EvidenceCollision", (0.95, 0.22, 0.08, 0.42), emission=0.15)
    previous: list[tuple[bpy.types.Object, list]] = []
    for obj in bpy.data.objects:
        if obj.type != "MESH":
            continue
        if "-collision" not in obj.name and obj.get("collision_shape") in {None, "NONE"}:
            continue
        if "-collision" not in obj.name and obj.get("sgw_kind") not in {
            "ARENA_STATIC",
            "ROBOT_PART",
        }:
            continue
        previous.append((obj, list(obj.data.materials)))
        obj.data.materials.clear()
        obj.data.materials.append(material)
    return previous


def restore_materials(previous: list[tuple[bpy.types.Object, list]]) -> None:
    for obj, materials in previous:
        if obj.name not in bpy.data.objects:
            continue
        obj.data.materials.clear()
        for material in materials:
            obj.data.materials.append(material)


def set_world_for_silhouette(enable: bool, previous: dict[str, Any] | None = None) -> dict[str, Any]:
    world = bpy.context.scene.world
    if world is None:
        world = bpy.data.worlds.new("EvidenceWorld")
        bpy.context.scene.world = world
    if not world.use_nodes:
        world.use_nodes = True
    background = world.node_tree.nodes.get("Background")
    state = previous or {
        "color": tuple(background.inputs[0].default_value) if background else (0.05, 0.05, 0.05, 1.0),
        "strength": background.inputs[1].default_value if background else 0.3,
    }
    if background is None:
        return state
    if enable:
        background.inputs[0].default_value = (0.02, 0.02, 0.03, 1.0)
        background.inputs[1].default_value = 0.08
    else:
        background.inputs[0].default_value = state["color"]
        background.inputs[1].default_value = state["strength"]
    return state


def use_named_camera(scene: bpy.types.Scene, name: str) -> bool:
    camera = bpy.data.objects.get(name)
    if camera is None or camera.type != "CAMERA":
        return False
    scene.camera = camera
    return True


def render_to(path: Path, *, mode: str, target_name: str | None = None) -> None:
    scene = bpy.context.scene
    configure_render(scene, path)
    clear_temp_markers()
    collision_restore: list[tuple[bpy.types.Object, list]] = []
    world_state: dict[str, Any] | None = None

    try:
        if mode == "story_camera" and target_name:
            if not use_named_camera(scene, target_name):
                raise RuntimeError(f"Missing story camera {target_name}")
        elif mode == "story_silhouette" and target_name:
            if not use_named_camera(scene, target_name):
                raise RuntimeError(f"Missing silhouette camera {target_name}")
            world_state = set_world_for_silhouette(True)
        elif mode == "story_parts":
            library = bpy.data.collections.get("SGW_PART_LIBRARY")
            if library is not None:
                library.hide_render = False
                library.hide_viewport = False
            markers = spawn_socket_markers()
            if not use_named_camera(scene, "CAM_STORY_ModularParts"):
                camera = ensure_evidence_camera(scene)
                part = bpy.data.objects.get("PART_chassis_standard")
                origin = object_world_center(part) if part else Vector((0.0, -16.0, 1.0))
                camera.location = origin + Vector((3.2, -3.6, 2.1))
                look_at(camera, origin + Vector((0.0, 0.0, 0.25)))
                if camera.data is not None:
                    camera.data.lens = 50.0
                scene.camera = camera
            if not markers and bpy.data.objects.get("PART_chassis_standard") is None:
                raise RuntimeError("No modular parts / sockets available for evidence capture")
        elif mode == "overview":
            overview = bpy.data.objects.get("CAM_Overview")
            if overview is not None:
                scene.camera = overview
            else:
                camera = ensure_evidence_camera(scene)
                camera.location = Vector((17.5, -20.5, 10.8))
                look_at(camera, Vector((0.0, 0.4, 0.55)))
                scene.camera = camera
        elif mode == "arena_level":
            low = bpy.data.objects.get("CAM_ArenaLevel")
            if low is not None:
                scene.camera = low
            else:
                camera = ensure_evidence_camera(scene)
                camera.location = Vector((12.0, -13.5, 1.85))
                look_at(camera, Vector((-0.5, 0.8, 0.90)))
                if camera.data is not None:
                    camera.data.lens = 28.0
                scene.camera = camera
        elif mode == "bot" and target_name:
            camera = ensure_evidence_camera(scene)
            target_obj = bpy.data.objects.get(target_name)
            if target_obj is None:
                raise RuntimeError(f"Missing bot root {target_name}")
            unhide_for_render(target_obj)
            origin = target_obj.matrix_world.translation.copy()
            facing = target_obj.rotation_euler.z
            forward = Vector((math.sin(facing), math.cos(facing), 0.0))
            right = Vector((math.cos(facing), -math.sin(facing), 0.0))
            camera.location = origin + forward * 3.8 + right * 2.8 + Vector((0.0, 0.0, 1.55))
            look_at(camera, origin + forward * 0.35 + Vector((0.0, 0.0, 0.55)))
            if camera.data is not None:
                camera.data.lens = 40.0
            scene.camera = camera
        elif mode == "parts" and target_name:
            camera = ensure_evidence_camera(scene)
            library = bpy.data.collections.get("SGW_PART_LIBRARY")
            if library is not None:
                library.hide_render = False
                library.hide_viewport = False
            target_obj = bpy.data.objects.get(target_name)
            if target_obj is None:
                raise RuntimeError(f"Missing part object {target_name}")
            unhide_for_render(target_obj)
            if bpy.data.objects.get("Evidence_PartLight") is None:
                light_data = bpy.data.lights.new("Evidence_PartLight_Data", type="AREA")
                light_data.energy = 1400.0
                light_data.size = 4.0
                if hasattr(light_data, "use_shadow"):
                    light_data.use_shadow = False
                light = bpy.data.objects.new("Evidence_PartLight", light_data)
                bpy.context.scene.collection.objects.link(light)
                light.location = target_obj.matrix_world.translation + Vector((2.0, -3.0, 3.0))
                look_at(light, target_obj.matrix_world.translation)
            origin = target_obj.matrix_world.translation.copy()
            camera.location = origin + Vector((3.2, -3.6, 2.1))
            look_at(camera, origin + Vector((0.0, 0.0, 0.25)))
            if camera.data is not None:
                camera.data.lens = 50.0
            scene.camera = camera
        elif mode == "sockets":
            markers = spawn_socket_markers()
            camera = ensure_evidence_camera(scene)
            ripper = bpy.data.objects.get("BOT_RIPPER_ROOT")
            origin = ripper.matrix_world.translation.copy() if ripper else Vector((5.2, -2.8, 0.0))
            camera.location = origin + Vector((-3.2, -3.8, 2.4))
            look_at(camera, origin + Vector((0.0, 0.6, 0.85)))
            if camera.data is not None:
                camera.data.lens = 40.0
            scene.camera = camera
            if not markers:
                raise RuntimeError("No socket/pivot markers available for evidence capture")
        elif mode == "collision":
            collision_restore = apply_collision_overlay()
            overview = bpy.data.objects.get("CAM_Overview")
            if overview is not None:
                scene.camera = overview
            else:
                camera = ensure_evidence_camera(scene)
                camera.location = Vector((13.8, -16.2, 8.6))
                look_at(camera, Vector((0.0, 0.15, 0.75)))
                scene.camera = camera
        else:
            camera = ensure_evidence_camera(scene)
            camera.location = Vector((13.8, -16.2, 8.6))
            look_at(camera, Vector((0.0, 0.15, 0.75)))
            scene.camera = camera

        path.parent.mkdir(parents=True, exist_ok=True)
        bpy.ops.render.render(write_still=True)
    finally:
        if collision_restore:
            restore_materials(collision_restore)
        if world_state is not None:
            set_world_for_silhouette(False, world_state)
        clear_temp_markers()


def story_geometry_readiness() -> dict[str, Any]:
    landmark_hits = {key: (landmark_present(key).name if landmark_present(key) else None) for key in LANDMARK_ALIASES}
    bots = {root: (bpy.data.objects.get(root) is not None) for root in BOT_STORY_NAMES}
    story_landmarks = ("cutting_hall", "crane_row", "crows_nest", "wall_of_wrecks", "crew_bay_1", "crew_bay_2", "crew_bay_3")
    present_count = sum(1 for key in story_landmarks if landmark_hits.get(key))
    return {
        "bots": bots,
        "landmarks": landmark_hits,
        "story_landmark_count": present_count,
        "story_geometry_ready": present_count >= 4 and all(bots.values()),
        "transfer_floor": landmark_hits.get("transfer_floor"),
    }


def classify_shot_status(
    *,
    file_written: bool,
    required_objects: Sequence[str],
    found: Sequence[str],
    missing: Sequence[str],
    used_fallback_aim: bool,
    critical: bool = True,
) -> str:
    if not file_written:
        return "FAIL"
    if critical and missing:
        # Rendered, but required story subjects absent → FAIL for that shot.
        return "FAIL"
    if used_fallback_aim or (required_objects and not found):
        return "UNVERIFIED"
    return "PASS"


def capture_story_set(evidence: Path, camera_aim_notes: dict[str, str]) -> list[ShotResult]:
    readiness = story_geometry_readiness()
    results: list[ShotResult] = []

    def aim_fallback(camera_name: str) -> bool:
        return camera_aim_notes.get(camera_name, "").startswith("fallback")

    def run_shot(
        shot_id: str,
        filename: str,
        camera_name: str,
        purpose: str,
        *,
        mode: str = "story_camera",
        required: Sequence[str] = (),
        critical_missing_fails: bool = True,
    ) -> ShotResult:
        found = [name for name in required if bpy.data.objects.get(name) is not None]
        # Also accept landmark alias hits listed as logical keys in required via LANDMARK_ALIASES.
        logical_found: list[str] = []
        logical_missing: list[str] = []
        for item in required:
            if item in LANDMARK_ALIASES:
                obj = landmark_present(item)
                if obj is not None:
                    logical_found.append(obj.name)
                else:
                    logical_missing.append(item)
            elif bpy.data.objects.get(item) is not None:
                logical_found.append(item)
            else:
                logical_missing.append(item)

        output_path = evidence / filename
        error = ""
        try:
            render_to(output_path, mode=mode, target_name=camera_name if mode != "story_parts" else None)
            written = output_path.is_file()
        except Exception as exc:  # noqa: BLE001 - evidence capture must continue
            written = False
            error = str(exc)

        status = classify_shot_status(
            file_written=written,
            required_objects=required,
            found=logical_found,
            missing=logical_missing,
            used_fallback_aim=aim_fallback(camera_name),
            critical=critical_missing_fails,
        )
        if error and status != "FAIL":
            status = "FAIL"
        note = camera_aim_notes.get(camera_name, "")
        if error:
            note = f"{note}; error={error}".strip("; ")
        result = ShotResult(
            shot_id=shot_id,
            file=filename,
            camera=camera_name,
            story_purpose=purpose,
            status=status,
            notes=note,
            targets_found=logical_found,
            targets_missing=logical_missing,
        )
        results.append(result)
        return result

    run_shot(
        "exterior_establishing",
        "01_exterior_establishing.png",
        "CAM_STORY_Exterior",
        "Exterior Scrapyard establishing — coastal shipbreaking berth scale, not trash dump.",
        required=("exterior",),
        critical_missing_fails=False,
    )
    run_shot(
        "arena_overview",
        "02_arena_overview.png",
        "CAM_STORY_ArenaOverview",
        "Arena overview of Bay 13 transfer-floor combat enclosure.",
        required=("transfer_floor", "BOT_RAMMER_ROOT", "BOT_RIPPER_ROOT", "BOT_MAUL_ROOT"),
    )
    run_shot(
        "floor_level_scale",
        "03_floor_level_scale.png",
        "CAM_STORY_FloorScale",
        "Low floor-level scale — machine size vs hull-armor enclosure.",
        required=("transfer_floor",),
    )
    run_shot(
        "cutting_hall",
        "04_cutting_hall.png",
        "CAM_STORY_CuttingHall",
        "Cutting Hall — warm industrial hull-cutting bay backdrop.",
        required=("cutting_hall",),
    )
    run_shot(
        "crane_row",
        "05_crane_row.png",
        "CAM_STORY_CraneRow",
        "Crane Row — overhead lift / recovery industrial landmark.",
        required=("crane_row",),
    )
    run_shot(
        "crows_nest",
        "06_crows_nest.png",
        "CAM_STORY_CrowsNest",
        "Crow's Nest — shipyard control room / match control.",
        required=("crows_nest",),
    )
    run_shot(
        "wall_of_wrecks",
        "07_wall_of_wrecks.png",
        "CAM_STORY_WallOfWrecks",
        "Wall of Wrecks — yard culture display of damaged fictional components.",
        required=("wall_of_wrecks",),
    )

    # Crew bays: group shot always; individuals when cameras/targets exist.
    run_shot(
        "crew_bays",
        "08_crew_bays.png",
        "CAM_STORY_CrewBays",
        "All three crew bays — staging / freight gate stalls.",
        required=("crew_bay_1", "crew_bay_2", "crew_bay_3"),
        critical_missing_fails=False,
    )
    for index, (filename, camera_name, key) in enumerate(
        (
            ("08a_crew_bay_1.png", "CAM_STORY_CrewBay_1", "crew_bay_1"),
            ("08b_crew_bay_2.png", "CAM_STORY_CrewBay_2", "crew_bay_2"),
            ("08c_crew_bay_3.png", "CAM_STORY_CrewBay_3", "crew_bay_3"),
        ),
        start=1,
    ):
        run_shot(
            f"crew_bay_{index}",
            filename,
            camera_name,
            f"Crew Bay {index} close framing.",
            required=(key,),
            critical_missing_fails=False,
        )

    run_shot(
        "yard_mule_closeup",
        "09_yard_mule_closeup.png",
        "CAM_STORY_YardMule",
        "Yard Mule (Rammer class) close-up — yard tractor / harbor tug language.",
        required=("BOT_RAMMER_ROOT",),
    )
    run_shot(
        "keelcutter_closeup",
        "10_keelcutter_closeup.png",
        "CAM_STORY_Keelcutter",
        "Keelcutter (Ripper class) close-up — ship-hull cutting equipment language.",
        required=("BOT_RIPPER_ROOT",),
    )
    run_shot(
        "pilebreaker_closeup",
        "11_pilebreaker_closeup.png",
        "CAM_STORY_Pilebreaker",
        "Pilebreaker (Maul class) close-up — dock pile-driving / forging language.",
        required=("BOT_MAUL_ROOT",),
    )

    parts_result_path = evidence / "12_modular_parts_attachments.png"
    parts_error = ""
    try:
        render_to(parts_result_path, mode="story_parts")
        parts_written = parts_result_path.is_file()
    except Exception as exc:  # noqa: BLE001
        parts_written = False
        parts_error = str(exc)
    parts_found = []
    parts_missing = []
    if bpy.data.objects.get("PART_chassis_standard"):
        parts_found.append("PART_chassis_standard")
    else:
        parts_missing.append("PART_chassis_standard")
    socket_count = sum(1 for obj in bpy.data.objects if obj.name.startswith("SOCKET_"))
    if socket_count:
        parts_found.append(f"SOCKETS×{socket_count}")
    else:
        parts_missing.append("SOCKET_*")
    results.append(
        ShotResult(
            shot_id="modular_parts_attachments",
            file="12_modular_parts_attachments.png",
            camera="CAM_STORY_ModularParts",
            story_purpose="Modular parts library and attachment sockets / pivots.",
            status=classify_shot_status(
                file_written=parts_written,
                required_objects=("PART_chassis_standard",),
                found=parts_found,
                missing=parts_missing,
                used_fallback_aim=aim_fallback("CAM_STORY_ModularParts"),
            ),
            notes=parts_error or camera_aim_notes.get("CAM_STORY_ModularParts", ""),
            targets_found=parts_found,
            targets_missing=parts_missing,
        )
    )

    # Composition test — structural checks (not visual AI judgment).
    landmark_keys = ("cutting_hall", "crane_row", "crows_nest", "wall_of_wrecks")
    landmark_hits = [key for key in landmark_keys if landmark_present(key) is not None]
    bots_ok = all(bpy.data.objects.get(name) is not None for name in BOT_STORY_NAMES)
    floor_ok = landmark_present("transfer_floor") is not None
    composition_required = [
        "BOT_RAMMER_ROOT",
        "BOT_RIPPER_ROOT",
        "BOT_MAUL_ROOT",
        "transfer_floor",
    ]
    comp = run_shot(
        "camera_composition_test",
        "13_camera_composition_test.png",
        "CAM_STORY_Composition",
        (
            "Main broadcast composition: all three machines; transfer floor; "
            "≥2 landmarks; enclosure scale; FG/MG/BG depth; no overhead cutting focal area."
        ),
        required=composition_required,
    )
    if comp.status == "PASS":
        if not bots_ok or not floor_ok or len(landmark_hits) < 2:
            comp.status = "UNVERIFIED"
            comp.notes = (
                f"{comp.notes}; composition_checks bots={bots_ok} floor={floor_ok} "
                f"landmarks={landmark_hits}"
            ).strip("; ")
        else:
            # Visual FG/MG/BG and overhead clearance remain human-verified.
            comp.status = "UNVERIFIED"
            comp.notes = (
                f"{comp.notes}; structural subjects present (landmarks={landmark_hits}); "
                "FG/MG/BG + overhead-clearance need visual review"
            ).strip("; ")

    for filename, preferred_cameras, root, label in (
        (
            "14_silhouette_yard_mule.png",
            ("CAM_SILHOUETTE_YARD_MULE", "CAM_STORY_Silhouette_YardMule"),
            "BOT_RAMMER_ROOT",
            "Yard Mule",
        ),
        (
            "15_silhouette_keelcutter.png",
            ("CAM_SILHOUETTE_KEELCUTTER", "CAM_STORY_Silhouette_Keelcutter"),
            "BOT_RIPPER_ROOT",
            "Keelcutter",
        ),
        (
            "16_silhouette_pilebreaker.png",
            ("CAM_SILHOUETTE_PILEBREAKER", "CAM_STORY_Silhouette_Pilebreaker"),
            "BOT_MAUL_ROOT",
            "Pilebreaker",
        ),
    ):
        camera_name = next((name for name in preferred_cameras if bpy.data.objects.get(name)), preferred_cameras[-1])
        run_shot(
            f"silhouette_{label.lower().replace(' ', '_')}",
            filename,
            camera_name,
            f"Individual silhouette test — {label}.",
            mode="story_silhouette",
            required=(root,),
        )

    # Attach readiness for manifest consumers.
    results.append(
        ShotResult(
            shot_id="_readiness",
            file="",
            camera="",
            story_purpose="Scene readiness probe (not a screenshot).",
            status="PASS" if readiness["story_geometry_ready"] else "UNVERIFIED",
            notes=json.dumps(readiness),
        )
    )
    return results


def capture_foundation_set(evidence: Path) -> list[ShotResult]:
    preview_source = Path(bpy.data.filepath).parent / "SGW_Robot_Combat_Arena_Preview.png"
    if not preview_source.is_file():
        preview_source = Path(bpy.path.abspath("//")) / "SGW_Robot_Combat_Arena_Preview.png"
    results: list[ShotResult] = []
    if preview_source.is_file():
        target = evidence / "01_blender_generated_preview.png"
        target.write_bytes(preview_source.read_bytes())
        results.append(
            ShotResult(
                "preview",
                "01_blender_generated_preview.png",
                "CAM_Overview",
                "Generator preview copy.",
                "PASS" if target.is_file() else "FAIL",
            )
        )

    shots = [
        ("02_complete_arena.png", "overview", None, "CAM_Overview", "Complete arena overview."),
        ("03_bot_rammer.png", "bot", "BOT_RAMMER_ROOT", "EvidenceCamera", "Rammer close-up."),
        ("04_bot_ripper.png", "bot", "BOT_RIPPER_ROOT", "EvidenceCamera", "Ripper close-up."),
        ("05_bot_maul.png", "bot", "BOT_MAUL_ROOT", "EvidenceCamera", "Maul close-up."),
        ("06_modular_parts.png", "parts", "PART_chassis_standard", "EvidenceCamera", "Modular parts."),
        ("07_attachment_sockets_pivots.png", "sockets", None, "EvidenceCamera", "Sockets / pivots."),
        ("08_collision_objects.png", "collision", None, "CAM_Overview", "Collision overlay."),
        ("09_arena_level_scale.png", "arena_level", None, "CAM_ArenaLevel", "Arena-level scale."),
    ]
    for filename, mode, target_name, camera, purpose in shots:
        path = evidence / filename
        try:
            render_to(path, mode=mode, target_name=target_name)
            status = "PASS" if path.is_file() else "FAIL"
            notes = ""
        except Exception as exc:  # noqa: BLE001
            status = "FAIL"
            notes = str(exc)
        results.append(ShotResult(filename, filename, camera, purpose, status, notes=notes))
    return results


def write_story_manifest(
    evidence: Path,
    results: list[ShotResult],
    *,
    camera_aim_notes: dict[str, str],
    blend_path: Path,
) -> Path:
    shot_rows = [
        {
            "shot": result.shot_id,
            "file": result.file,
            "camera": result.camera,
            "story_purpose": result.story_purpose,
            "status": result.status,
            "notes": result.notes,
            "targets_found": result.targets_found,
            "targets_missing": result.targets_missing,
        }
        for result in results
        if result.shot_id != "_readiness"
    ]
    readiness_row = next((r for r in results if r.shot_id == "_readiness"), None)
    readiness = json.loads(readiness_row.notes) if readiness_row and readiness_row.notes else {}

    status_counts = {"PASS": 0, "FAIL": 0, "UNVERIFIED": 0}
    for row in shot_rows:
        status_counts[row["status"]] = status_counts.get(row["status"], 0) + 1

    manifest = {
        "title": "Bay 13 Scrapyard — Story Blockout Evidence",
        "naming": {
            "venue": "Bay 13: The Scrapyard",
            "scrap_means": "fight / brawl",
            "avoid": "junkyard trash / dump branding",
        },
        "evidence_root": str(evidence),
        "blend_path": str(blend_path),
        "camera_contract": "CAM_STORY_Composition",
        "camera_aim_notes": camera_aim_notes,
        "readiness": readiness,
        "status_counts": status_counts,
        "shots": shot_rows,
        "visual_approval": "FAIL",
        "authority_gate": "HELD until OWNER PREVIEW: PASS",
        "notes": (
            "Dedicated story-blockout evidence folder (separate from rejected glass-box foundation shots). "
            "PASS = file written and required subjects found with landmark/bot aim. "
            "FAIL = missing critical subjects or render error. "
            "UNVERIFIED = rendered via spatial fallback or needs human composition review."
        ),
    }
    path = evidence / "CAPTURE_MANIFEST.json"
    path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    return path


def main() -> int:
    output_root, evidence_root, mode = read_cli_arguments(sys.argv)
    if output_root is None:
        print(
            "Usage: capture_evidence_screenshots.py <generated-output-folder> "
            "[evidence-folder] [--story|--foundation]"
        )
        return 2

    root = Path(output_root).expanduser().resolve()
    if evidence_root:
        evidence = Path(evidence_root).expanduser().resolve()
    else:
        evidence = DEFAULT_STORY_EVIDENCE if mode == "story" else DEFAULT_FOUNDATION_EVIDENCE
    evidence.mkdir(parents=True, exist_ok=True)

    blend_path = root / "SGW_Robot_Combat_Arena_v0_1.blend"
    if not blend_path.is_file():
        print(f"FAIL: Missing blend file at {blend_path}")
        return 1

    bpy.ops.wm.open_mainfile(filepath=str(blend_path))

    if mode == "foundation":
        results = capture_foundation_set(evidence)
        manifest = {
            "evidence_root": str(evidence),
            "captured_files": [str(evidence / r.file) for r in results if r.file],
            "camera_contract": "CAM_Overview",
            "shots": [
                {
                    "shot": r.shot_id,
                    "file": r.file,
                    "camera": r.camera,
                    "story_purpose": r.story_purpose,
                    "status": r.status,
                    "notes": r.notes,
                }
                for r in results
            ],
            "visual_approval": "FAIL",
            "authority_gate": "HELD until OWNER PREVIEW: PASS",
        }
        report_path = evidence / "capture_manifest.json"
        report_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
        print(json.dumps(manifest, indent=2))
        return 0 if all(r.status != "FAIL" for r in results) else 1

    # Story blockout path.
    readiness = story_geometry_readiness()
    print(json.dumps({"phase": "preflight", "readiness": readiness}, indent=2))

    camera_aim_notes = ensure_story_cameras(refresh_aim=True)
    results = capture_story_set(evidence, camera_aim_notes)

    # One retry if story geometry was not ready at first open — sibling may have
    # rewritten the blend while we prepared. Reload once and recapture.
    readiness_after = story_geometry_readiness()
    if not readiness.get("story_geometry_ready") and blend_path.is_file():
        # Re-check file mtime / reopen once.
        bpy.ops.wm.open_mainfile(filepath=str(blend_path))
        readiness_retry = story_geometry_readiness()
        if readiness_retry.get("story_geometry_ready") or readiness_retry != readiness_after:
            print(json.dumps({"phase": "retry", "readiness": readiness_retry}, indent=2))
            camera_aim_notes = ensure_story_cameras(refresh_aim=True)
            results = capture_story_set(evidence, camera_aim_notes)

    manifest_path = write_story_manifest(
        evidence,
        results,
        camera_aim_notes=camera_aim_notes,
        blend_path=blend_path,
    )
    summary = {
        "manifest": str(manifest_path),
        "evidence_root": str(evidence),
        "status_counts": {
            "PASS": sum(1 for r in results if r.shot_id != "_readiness" and r.status == "PASS"),
            "FAIL": sum(1 for r in results if r.shot_id != "_readiness" and r.status == "FAIL"),
            "UNVERIFIED": sum(1 for r in results if r.shot_id != "_readiness" and r.status == "UNVERIFIED"),
        },
        "shots": [
            {"shot": r.shot_id, "file": r.file, "status": r.status, "camera": r.camera}
            for r in results
            if r.shot_id != "_readiness"
        ],
    }
    print(json.dumps(summary, indent=2))
    # Exit 0 even with UNVERIFIED (geometry may still be landing); FAIL shots → 1.
    return 0 if summary["status_counts"]["FAIL"] == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
