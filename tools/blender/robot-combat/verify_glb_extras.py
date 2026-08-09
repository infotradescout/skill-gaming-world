"""Verify GLB custom-property extras survive export."""

from __future__ import annotations

import json
import struct
import sys
from pathlib import Path


def read_output_argument(argv: list[str]) -> str | None:
    if "--" in argv:
        trailing = argv[argv.index("--") + 1 :]
        return trailing[0] if trailing else None
    return argv[1] if len(argv) == 2 else None


def read_glb_json_chunk(path: Path) -> dict:
    data = path.read_bytes()
    if data[:4] != b"glTF":
        raise ValueError(f"{path} is not a GLB file")
    offset = 12
    while offset < len(data):
        chunk_length = struct.unpack("<I", data[offset : offset + 4])[0]
        chunk_type = data[offset + 4 : offset + 8]
        chunk_data = data[offset + 8 : offset + 8 + chunk_length]
        if chunk_type == b"JSON":
            return json.loads(chunk_data.decode("utf-8"))
        offset += 8 + chunk_length
    raise ValueError(f"{path} has no JSON chunk")


def extras_for_named_nodes(gltf: dict, names: set[str]) -> dict[str, dict]:
    nodes = gltf.get("nodes", [])
    result: dict[str, dict] = {}
    for index, node in enumerate(nodes):
        name = node.get("name")
        if name in names and node.get("extras"):
            result[name] = node["extras"]
    return result


def main() -> int:
    output_argument = read_output_argument(sys.argv)
    if output_argument is None:
        print("Usage: verify_glb_extras.py <generated-output-folder>")
        return 2

    root = Path(output_argument).expanduser().resolve()
    glb_paths = {
        "arena": root / "exports/sgw_robot_combat_arena.glb",
        "rammer": root / "exports/bot_rammer.glb",
        "ripper": root / "exports/bot_ripper.glb",
        "maul": root / "exports/bot_maul.glb",
        "parts": root / "exports/sgw_robot_part_library.glb",
        "full_scene": root / "exports/sgw_robot_combat_full_scene.glb",
    }

    report: dict[str, object] = {"root": str(root), "files": {}}
    failures: list[str] = []

    for label, path in glb_paths.items():
        if not path.is_file():
            failures.append(f"Missing GLB: {path.name}")
            continue
        gltf = read_glb_json_chunk(path)
        nodes = gltf.get("nodes", [])
        extras_count = sum(1 for node in nodes if node.get("extras"))
        report["files"][label] = {
            "path": str(path),
            "node_count": len(nodes),
            "extras_node_count": extras_count,
            "sample_extras": [
                {"name": node.get("name"), "extras": node.get("extras")}
                for node in nodes
                if node.get("extras")
            ][:5],
        }
        if extras_count <= 0:
            failures.append(f"No GLB extras found in {path.name}")

    targeted = extras_for_named_nodes(
        read_glb_json_chunk(glb_paths["rammer"]),
        {"BOT_RAMMER_ROOT", "RAMMER_FrontWedge-collision"},
    )
    report["rammer_target_extras"] = targeted
    if not targeted:
        failures.append("Expected Rammer root or wedge collision extras missing.")

    report_path = root / "manifest" / "glb_extras_report.json"
    report["status"] = "FAIL" if failures else "PASS"
    report["failures"] = failures
    report_path.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report, indent=2))
    print(f"GLB extras report: {report_path}")
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
