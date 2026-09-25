"""Recover only the source-bound grass group channels that have exact UE mappings.

The group still uses translucency that the provisional UE material cannot reproduce.
Any changed graph or UV transform must fail closed for native material review.
"""


EXPECTED_IMAGES = {
    "base_color": ("Diffuse", "grass_medium_01_diff.png"),
    "roughness": ("Rough", "grass_medium_01_rough.png"),
    "normal": ("Normal", "grass_medium_01_nor_gl.png"),
    "alpha": ("Alpha", "grass_medium_01_alpha.png"),
}


def _source(socket, node_type, output_name):
    if socket is None or len(socket.links) != 1:
        raise ValueError("Grass graph link missing or ambiguous")
    link = socket.links[0]
    if link.from_node.type != node_type or link.from_socket.name != output_name:
        raise ValueError("Grass graph source changed")
    return link.from_node


def _default(node, name, expected):
    socket = node.inputs.get(name)
    if socket is None or socket.is_linked:
        raise ValueError("Grass group control changed: " + name)
    value = socket.default_value
    if abs(float(value) - expected) > 0.0001:
        raise ValueError("Grass group control changed: " + name)


def _identity_uv(image_node):
    reroute = _source(image_node.inputs.get("Vector"), "REROUTE", "Output")
    mapping = _source(reroute.inputs.get("Input"), "MAPPING", "Vector")
    _source(mapping.inputs.get("Vector"), "TEX_COORD", "UV")
    for name, expected in (
        ("Location", (0.0, 0.0, 0.0)),
        ("Rotation", (0.0, 0.0, 0.0)),
        ("Scale", (1.0, 1.0, 1.0)),
    ):
        socket = mapping.inputs.get(name)
        if socket is None or socket.is_linked or any(abs(a - b) > 0.0001 for a, b in zip(socket.default_value, expected)):
            raise ValueError("Grass UV mapping changed: " + name)


def recover_grass_channels(material, texture_ids):
    """Return source texture channels and the still-open translucency warning."""
    if material.name != "grass_medium_01" or not material.use_nodes or not material.node_tree:
        raise ValueError("Not the exact source grass material")
    outputs = [n for n in material.node_tree.nodes if n.type == "OUTPUT_MATERIAL" and n.is_active_output]
    if len(outputs) != 1:
        raise ValueError("Grass material output changed")
    group = _source(outputs[0].inputs.get("Surface"), "GROUP", "Shader")
    if not group.node_tree or group.node_tree.name != "grass_medium_01":
        raise ValueError("Grass shader group changed")
    for name, expected in (
        ("Dead Amount", 0.0),
        ("Wetness", 0.0),
        ("Hue", 0.5),
        ("Saturation", 1.0),
        ("Value", 1.0),
        ("Translucency", 0.4),
    ):
        _default(group, name, expected)
    _source(group.inputs.get("Diffuse Dead"), "TEX_IMAGE", "Color")

    channels = {}
    for channel, (input_name, image_name) in EXPECTED_IMAGES.items():
        image_node = _source(group.inputs.get(input_name), "TEX_IMAGE", "Color")
        if not image_node.image or image_node.image.name != image_name:
            raise ValueError("Grass source image changed: " + input_name)
        if image_name not in texture_ids:
            raise ValueError("Grass source image not packed: " + image_name)
        _identity_uv(image_node)
        channels[channel] = {"texture": texture_ids[image_name], "output": "rgb"}
    channels["metallic"] = {"constant": 0.0}
    channels["normal"]["normal_strength"] = 1.0
    warnings = ["Source grass group translucency (0.4) requires native material review"]
    return channels, warnings
