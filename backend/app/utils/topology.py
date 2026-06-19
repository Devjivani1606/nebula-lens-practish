from __future__ import annotations

import math
from typing import Any, Dict, List

DEFAULT_CONTAINER_PADDING = 60
DEFAULT_CONTAINER_WIDTH = 400
DEFAULT_CONTAINER_HEIGHT = 300
DEFAULT_LEAF_WIDTH = 180
DEFAULT_LEAF_HEIGHT = 100
DEFAULT_GRID_GAP_X = 70
DEFAULT_GRID_GAP_Y = 70

CONTAINER_TYPES = {
    "vpcNode",
    "subnetNode",
    "availabilityZoneNode",
    "azNode",
    "clusterNode",
    "vpc",
    "subnet",
}


def normalize_topology_nodes(nodes: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Normalize topology nodes for React Flow nested/group rendering."""
    node_by_id = {node["id"]: node for node in nodes}
    _normalize_parent_keys(nodes)
    _ensure_child_extent(nodes)
    children_map = _build_children_map(nodes)
    _assign_child_positions(nodes, node_by_id, children_map)
    _apply_container_dimensions(nodes, node_by_id, children_map)
    return nodes


def _normalize_parent_keys(nodes: List[Dict[str, Any]]) -> None:
    for node in nodes:
        if "parentID" in node:
            node["parentId"] = node.pop("parentID")
        if node.get("parentId") is None and "parentId" in node:
            node.pop("parentId")


def _ensure_child_extent(nodes: List[Dict[str, Any]]) -> None:
    for node in nodes:
        if node.get("parentId"):
            node["extent"] = "parent"
        elif node.get("extent") == "parent":
            node.pop("extent", None)


def _build_children_map(nodes: List[Dict[str, Any]]) -> Dict[str, List[Dict[str, Any]]]:
    children_map: Dict[str, List[Dict[str, Any]]] = {}
    for node in nodes:
        parent_id = node.get("parentId")
        if parent_id:
            children_map.setdefault(parent_id, []).append(node)
    return children_map


def _assign_child_positions(
    nodes: List[Dict[str, Any]],
    node_by_id: Dict[str, Dict[str, Any]],
    children_map: Dict[str, List[Dict[str, Any]]]
) -> None:
    for node in nodes:
        parent_id = node.get("parentId")
        if not parent_id:
            continue
        parent = node_by_id.get(parent_id)
        if not parent:
            continue
        if _looks_like_absolute(node, parent):
            _translate_to_parent_space(node, parent)

    for parent_id, children in children_map.items():
        if not children:
            continue
        if _are_children_unplaced(children):
            _layout_children(children)

        _shift_children_into_padding(children)


def _looks_like_absolute(child: Dict[str, Any], parent: Dict[str, Any]) -> bool:
    position = child.get("position")
    parent_position = parent.get("position")
    if not position or not parent_position:
        return False

    cx = position.get("x", 0)
    cy = position.get("y", 0)
    px = parent_position.get("x", 0)
    py = parent_position.get("y", 0)

    if cx == 0 and cy == 0:
        return False

    parent_style = parent.get("style", {}) or {}
    parent_width = parent_style.get("width", DEFAULT_CONTAINER_WIDTH)
    parent_height = parent_style.get("height", DEFAULT_CONTAINER_HEIGHT)

    if cx > px + 500 or cy > py + 500:
        return True

    if cx > px + parent_width or cy > py + parent_height:
        return True

    if cx > 1000 or cy > 1000:
        return True

    return False


def _translate_to_parent_space(child: Dict[str, Any], parent: Dict[str, Any]) -> None:
    position = child.get("position", {})
    parent_position = parent.get("position", {})
    cx = position.get("x", 0)
    cy = position.get("y", 0)
    px = parent_position.get("x", 0)
    py = parent_position.get("y", 0)
    child["position"] = {
        "x": max(0, cx - px),
        "y": max(0, cy - py)
    }


def _are_children_unplaced(children: List[Dict[str, Any]]) -> bool:
    return all(
        child.get("position", {}).get("x", 0) == 0 and child.get("position", {}).get("y", 0) == 0
        for child in children
    )


def _layout_children(children: List[Dict[str, Any]]) -> None:
    count = len(children)
    columns = max(1, int(math.sqrt(count)))
    row_gap = DEFAULT_LEAF_HEIGHT + DEFAULT_GRID_GAP_Y
    col_gap = DEFAULT_LEAF_WIDTH + DEFAULT_GRID_GAP_X

    for index, child in enumerate(sorted(children, key=_child_sort_key)):
        child["position"] = {
            "x": DEFAULT_CONTAINER_PADDING + (index % columns) * col_gap,
            "y": DEFAULT_CONTAINER_PADDING + (index // columns) * row_gap,
        }


def _child_sort_key(node: Dict[str, Any]) -> str:
    return f"{node.get('type','')}-{node.get('data',{}).get('name','')}"


def _shift_children_into_padding(children: List[Dict[str, Any]]) -> None:
    min_x = min(child.get("position", {}).get("x", 0) for child in children)
    min_y = min(child.get("position", {}).get("y", 0) for child in children)
    shift_x = max(0, DEFAULT_CONTAINER_PADDING - min_x)
    shift_y = max(0, DEFAULT_CONTAINER_PADDING - min_y)

    if shift_x == 0 and shift_y == 0:
        return

    for child in children:
        pos = child.setdefault("position", {})
        pos["x"] = pos.get("x", 0) + shift_x
        pos["y"] = pos.get("y", 0) + shift_y


def _apply_container_dimensions(
    nodes: List[Dict[str, Any]],
    node_by_id: Dict[str, Dict[str, Any]],
    children_map: Dict[str, List[Dict[str, Any]]]
) -> None:
    for node in nodes:
        if node.get("id") not in children_map:
            continue
        children = children_map[node["id"]]
        if not children:
            style = node.setdefault("style", {})
            style.setdefault("width", DEFAULT_CONTAINER_WIDTH)
            style.setdefault("height", DEFAULT_CONTAINER_HEIGHT)
            continue

        width, height = _calculate_container_size(children)
        style = node.setdefault("style", {})
        style["width"] = max(style.get("width", 0) or 0, width)
        style["height"] = max(style.get("height", 0) or 0, height)


def _calculate_container_size(children: List[Dict[str, Any]]) -> tuple[int, int]:
    min_x = min(child.get("position", {}).get("x", 0) for child in children)
    min_y = min(child.get("position", {}).get("y", 0) for child in children)

    max_x = 0
    max_y = 0
    for child in children:
        position = child.get("position", {})
        x = position.get("x", 0)
        y = position.get("y", 0)
        child_width = child.get("style", {}).get("width", DEFAULT_LEAF_WIDTH)
        child_height = child.get("style", {}).get("height", DEFAULT_LEAF_HEIGHT)
        max_x = max(max_x, x + child_width)
        max_y = max(max_y, y + child_height)

    width = max(DEFAULT_CONTAINER_WIDTH, max_x + DEFAULT_CONTAINER_PADDING)
    height = max(DEFAULT_CONTAINER_HEIGHT, max_y + DEFAULT_CONTAINER_PADDING)

    return width, height
