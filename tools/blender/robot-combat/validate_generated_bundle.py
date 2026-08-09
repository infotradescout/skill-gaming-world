"""Validate the files produced by sgw_robot_combat_arena.py."""

from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path

EXPECTED = (
    "SGW_Robot_Combat_Arena_v0_1.blend",
    "SGW_Robot_Combat_Arena_Preview.png",
    "exports/sgw_robot_combat_arena.glb",
    "exports/bot_rammer.glb",
    "exports/bot_ripper.glb",
    "exports/bot_maul.glb",
    "exports/sgw_robot_part_library.glb",
    "exports/sgw_robot_combat_full_scene.glb",
    "manifest/sgw_robot_combat_manifest.json",
)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def read_output_argument(argv: list[str]) -> str | None:
    """Accept a normal Python argument or Blender arguments after ``--``."""
    if "--" in argv:
        separator = argv.index("--")
        trailing = argv[separator + 1 :]
        return trailing[0] if trailing else None
    return argv[1] if len(argv) == 2 else None


def main() -> int:
    output_argument = read_output_argument(sys.argv)
    if output_argument is None:
        print("Usage: validate_generated_bundle.py <generated-output-folder>")
        print("Blender usage: blender --background --python validate_generated_bundle.py -- <folder>")
        return 2

    root = Path(output_argument).expanduser().resolve()
    failures: list[str] = []
    report: list[dict[str, object]] = []

    for relative in EXPECTED:
        path = root / relative
        if not path.is_file():
            failures.append(f"Missing file: {relative}")
            continue
        size = path.stat().st_size
        if size <= 0:
            failures.append(f"Empty file: {relative}")
            continue
        report.append(
            {
                "file": relative.replace("\\", "/"),
                "bytes": size,
                "sha256": sha256(path),
            }
        )

    manifest_path = root / "manifest/sgw_robot_combat_manifest.json"
    if manifest_path.is_file():
        try:
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
            if manifest.get("schema_version") != "sgw.robot_combat.assets.v1":
                failures.append("Manifest schema_version is missing or incorrect.")
            game = manifest.get("game", {})
            if game.get("platform_side") != "FREE":
                failures.append("Manifest platform_side must be FREE.")
            if game.get("value_class") != "NO_VALUE":
                failures.append("Manifest value_class must be NO_VALUE.")
            bots = {item.get("bot_id") for item in manifest.get("starter_bots", [])}
            if bots != {"rammer", "ripper", "maul"}:
                failures.append(f"Starter bot set is incorrect: {sorted(bots)}")
            catalog_ids = {item.get("part_id") for item in manifest.get("part_catalog", [])}
            sockets = manifest.get("part_socket_catalog", {})
            if set(sockets) != catalog_ids:
                failures.append("Every catalog part must have an explicit socket definition.")
            for chassis_id in ("chassis_compact", "chassis_standard"):
                chassis_sockets = sockets.get(chassis_id, [])
                parent_slots = {
                    item.get("socket_id")
                    for item in chassis_sockets
                    if item.get("socket_role") == "PARENT_SLOT"
                }
                required = {"WHEEL_FL", "WHEEL_FR", "WHEEL_RL", "WHEEL_RR", "FRONT", "TOP_A", "INTERNAL_A"}
                if not required.issubset(parent_slots):
                    failures.append(f"{chassis_id} is missing required construction sockets.")

            rules = manifest.get("builder_rules_v1", {})
            if rules.get("server_recomputes_mass_power_and_legality") is not True:
                failures.append("Server blueprint recomputation rule is missing.")
            if rules.get("attachment_compatibility_source") != "part_socket_catalog":
                failures.append("Builder attachment compatibility source is missing.")
            if rules.get("arbitrary_executable_uploads_allowed") is not False:
                failures.append("Executable player uploads must remain denied.")
        except (OSError, json.JSONDecodeError) as exc:
            failures.append(f"Manifest could not be parsed: {exc}")

    report_path = root / "manifest/validation_report.json"
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(
        json.dumps(
            {
                "status": "FAIL" if failures else "PASS",
                "root": str(root),
                "files": report,
                "failures": failures,
            },
            indent=2,
        ),
        encoding="utf-8",
    )

    if failures:
        for failure in failures:
            print(f"FAIL: {failure}")
        print(f"Validation report: {report_path}")
        return 1

    print("PASS: Generated SGW Robot Combat bundle is structurally complete.")
    for item in report:
        print(f"  {item['file']} — {item['bytes']} bytes — {item['sha256']}")
    print(f"Validation report: {report_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
