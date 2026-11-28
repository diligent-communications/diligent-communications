"""Generate the Markdown repository map from the folder contracts."""

import argparse
import json
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
MAP = ROOT / "map" / "README.md"
SHAPES = ROOT / "contracts" / "CONTEXT.md"
FRONTMATTER_KEYS = {"build_step", "status", "consumes", "produces", "writes"}


def routed_shape_name(target):
    """A markdown file directly in contracts/, other than the router."""
    try:
        relative = target.relative_to((ROOT / "contracts").resolve())
    except ValueError:
        return None
    if relative.parts != (relative.name,) or relative.suffix != ".md" or relative.name == "CONTEXT.md":
        return None
    return relative.name


def routed_module_page(target):
    """A markdown page inside a module folder, linked from that folder's contract."""
    if target.suffix != ".md" or target.name == "CONTEXT.md":
        return False
    router = target.parent / "CONTEXT.md"
    try:
        router.resolve().relative_to((ROOT / "modules").resolve())
    except ValueError:
        return False
    if not router.is_file():
        return False
    return f"]({target.name})" in router.read_text(encoding="utf-8")


def edges_from_routed_page(page, node, nodes):
    """A page this folder routes to can still be a read of another module."""
    found = set()
    modules = (ROOT / "modules").resolve()
    home = page.parent.joinpath("CONTEXT.md").resolve()
    for link in re.findall(r"\]\(([^)\s#]+)\)", page.read_text(encoding="utf-8")):
        target = (page.parent / link).resolve()
        if target.name != "CONTEXT.md":
            continue
        try:
            target.relative_to(modules)
        except ValueError:
            continue
        if target in nodes and target != home:
            found.add(f"    {node} --> {nodes[target]}")
    return found


def draft_page_names(path, fields):
    """Same-folder pages this contract routes to, when the page itself is marked draft."""
    names = []
    for dependency in sorted(fields["consumes"]):
        target = (path.parent / dependency).resolve()
        if target.parent != path.parent or target.name == "CONTEXT.md" or target.suffix != ".md":
            continue
        if not target.is_file():
            continue
        if target.read_text(encoding="utf-8").lstrip().startswith("Draft."):
            names.append(target.name)
    return names


def load_routed_shapes():
    """File names the contracts router links to. The map treats those as shapes."""
    names = set(re.findall(r"\]\(([^)/#\s]+\.md)\)", SHAPES.read_text(encoding="utf-8")))
    return {name for name in names if name != "CONTEXT.md"}


LANE_HEADING = re.compile(r"### (.+) · Piece ([1-6]) \((decided|draft)\)")
LANE_SECTIONS = {"#### Inputs", "#### Process", "#### Outputs", "#### Check", "#### Open"}


def array_field(frontmatter, key, relative, *, required=True):
    entries = [line.partition(":")[2] for line in frontmatter if line.startswith(f"{key}:")]
    if not entries and not required:
        return []
    if len(entries) != 1:
        raise ValueError(f"{relative}: expected one {key} array")
    try:
        values = json.loads(entries[0])
    except json.JSONDecodeError as error:
        raise ValueError(f"{relative}: invalid {key} array: {error.msg}") from error
    if not isinstance(values, list) or any(
        not isinstance(value, str) or not value.strip() for value in values
    ):
        raise ValueError(f"{relative}: {key} must be an array of nonempty strings")
    return values


def body_fields(lines, relative):
    fields = {"consumes": set(), "produces": set(), "writes": set()}
    heading = ""
    for line in lines:
        if line.startswith("#"):
            heading = line
        if heading in ("## Inputs", "### Inputs", "#### Inputs") and line.startswith("- Reference: "):
            reference = line.removeprefix("- Reference: ")
            if reference != "None.":
                match = re.fullmatch(r"\[[^\]]+\]\(([^)\s]+)\)", reference)
                if not match:
                    raise ValueError(f"{relative}: list one linked reference per line")
                fields["consumes"].add(match[1])
        if heading in ("## Outputs", "### Outputs") and line.startswith("- "):
            match = re.fullmatch(r"- Handoff: \[[^\]]+\]\(([^)\s]+)\)", line)
            if match:
                fields["writes"].add(match[1])
            else:
                fields["produces"].add(line[2:])
    return fields


def read_contract(folder):
    path = folder / "CONTEXT.md"
    relative = path.relative_to(ROOT).as_posix()
    if not path.is_file():
        raise ValueError(f"Missing folder contract: {relative}")

    lines = path.read_text(encoding="utf-8").splitlines()
    if not lines or lines[0] != "---" or "---" not in lines[1:]:
        raise ValueError(f"{relative}: missing frontmatter")
    end = lines.index("---", 1)
    frontmatter = lines[1:end]
    body = lines[end + 1:]

    for line in frontmatter:
        key, separator, _ = line.partition(":")
        if line.strip() and not line.lstrip().startswith("#") and (not separator or key not in FRONTMATTER_KEYS):
            raise ValueError(f"{relative}: unknown or indented frontmatter key {key!r}")

    statuses = [line for line in frontmatter if line.startswith("status:")]
    if statuses not in ([], ["status: draft"]):
        raise ValueError(f"{relative}: status must be draft if present")

    step = ""
    if folder.parent == ROOT / "modules":
        steps = [line for line in frontmatter if line.startswith("build_step:")]
        if len(steps) != 1 or not re.fullmatch(r"build_step: (?:[1-6]|1 to 2)", steps[0]):
            raise ValueError(f"{relative}: expected one build_step from 1 to 6, or 1 to 2")
        step = steps[0].removeprefix("build_step: ")

    fields = {}
    for key, items in body_fields(body, relative).items():
        values = array_field(frontmatter, key, relative, required=key != "writes")
        if set(values) != items:
            raise ValueError(f"{relative}: {key} disagrees with its Inputs or Outputs section")
        fields[key] = values
    section = ""
    for line in body:
        if line.startswith("## "):
            section = line
        if line.startswith("#") and " · Piece " in line and not (
            section == "## Lanes" and line.startswith("### ")
        ):
            raise ValueError(f"{relative}: lane heading {line!r} must be a ### heading under ## Lanes")
    lanes = []
    if "## Lanes" in body:
        for line in body[body.index("## Lanes") + 1:]:
            if line.startswith("## "):
                break
            if not line.lstrip().startswith("#") or line in LANE_SECTIONS:
                continue
            match = LANE_HEADING.fullmatch(line)
            if not match:
                raise ValueError(f"{relative}: invalid lane heading {line!r}")
            lanes.append(match.groups())
        if not lanes:
            raise ValueError(f"{relative}: expected a lane heading under ## Lanes")
    return path, step, bool(statuses), lanes, fields


def render():
    modules = ROOT / "modules"
    if not modules.is_dir():
        raise ValueError("Missing modules directory")
    folders = sorted(
        path for parent in (ROOT, modules) for path in parent.iterdir()
        if path.is_dir() and not path.name.startswith(("_", "."))
        and path not in (modules, MAP.parent, ROOT / "node_modules")
    )
    contracts = [read_contract(folder) for folder in folders]
    nodes = {contract[0].resolve(): f"folder{index}" for index, contract in enumerate(contracts)}
    routed_shapes = load_routed_shapes()
    shape_anchors = {
        title.lower().replace(" ", "-")
        for title in re.findall(r"^### ([a-zA-Z0-9 -]+)$", SHAPES.read_text(encoding="utf-8"), re.M)
    }
    lines = [
        "# Repository map",
        "",
        "<!-- Generated by python -I _tools/map.py -->",
        "",
        "There are no arrows yet. An arrow appears when a piece writes a contract that reads another part. The **Writes to** column below lists write handoffs separately.",
        "",
        "A shared shape is added in [contracts](../contracts/CONTEXT.md) by the piece whose code first uses it. Until then the [target map](target.md) is the plan.",
        "",
        "See the [target map](target.md) for how the finished application will work. That picture points along a call.",
        "",
        "```mermaid",
        "flowchart TD",
    ]
    edges = set()
    table = [
        "| Folder contract | Piece | Contract status | Outputs | Writes to |",
        "| --- | --- | --- | --- | --- |",
    ]
    for path, step, draft, lanes, fields in contracts:
        if path == SHAPES:
            continue
        folder = path.parent.relative_to(ROOT).as_posix()
        if not re.fullmatch(r"(?:modules/)?[A-Za-z0-9][A-Za-z0-9_.-]*", folder):
            raise ValueError(f"Invalid folder name: {folder}")
        node = nodes[path.resolve()]
        lines.append(f'    {node}["{folder}"]')
        write_links = []
        for key in ("consumes", "writes"):
            for dependency in fields[key]:
                target_path, _, anchor = dependency.partition("#")
                if Path(target_path).is_absolute():
                    raise ValueError(f"{folder}/CONTEXT.md: unknown contract {dependency}")
                target = (path.parent / target_path).resolve()
                shape_name = routed_shape_name(target)
                if shape_name is not None:
                    if key != "consumes" or anchor or shape_name not in routed_shapes:
                        raise ValueError(f"{folder}/CONTEXT.md: unknown shared shape {dependency}")
                    continue
                if routed_module_page(target):
                    if key != "consumes" or anchor:
                        raise ValueError(f"{folder}/CONTEXT.md: unknown module page {dependency}")
                    owner = (target.parent / "CONTEXT.md").resolve()
                    if owner != path.resolve() and owner in nodes:
                        edges.add(f"    {node} --> {nodes[owner]}")
                    elif owner == path.resolve():
                        edges.update(edges_from_routed_page(target, node, nodes))
                    continue
                if target not in nodes:
                    raise ValueError(f"{folder}/CONTEXT.md: unknown contract {dependency}")
                if target == SHAPES:
                    if key != "consumes" or anchor not in shape_anchors:
                        raise ValueError(f"{folder}/CONTEXT.md: unknown shared shape {dependency}")
                    continue
                if anchor:
                    raise ValueError(f"{folder}/CONTEXT.md: expected a folder contract path: {dependency}")
                if key == "consumes":
                    edges.add(f"    {node} --> {nodes[target]}")
                else:
                    destination = target.parent.relative_to(ROOT).as_posix()
                    write_links.append(f"[{target.parent.name}](../{destination}/CONTEXT.md)")
        outputs = ", ".join(fields["produces"]).replace("|", r"\|") or "None"
        if step == "":
            build_step = "—"
        elif step == "1 to 2":
            build_step = "1 (complete) to 2 (draft)"
        elif draft:
            build_step = f"{step} (draft)"
        else:
            build_step = f"{step} (complete)"
        if lanes:
            build_step += "<br>" + ", ".join(
                f"{name}: {number} ({'proposed, draft' if lane_status == 'draft' else lane_status})"
                for name, number, lane_status in lanes
            )
        status = "Draft" if draft else "Complete"
        if step == "1 to 2" and draft:
            status = "Piece 1 complete, piece 2 draft"
        elif step == "1" and not draft and any(lane[2] == "draft" for lane in lanes):
            status = "Piece 1 complete, later pieces draft"
        inner = draft_page_names(path, fields)
        if inner:
            status += "; " + ", ".join(inner) + " draft"
        table.append(
            f"| [{folder}](../{folder}/CONTEXT.md) | {build_step} | {status} | {outputs} | "
            f"{', '.join(write_links) or '—'} |"
        )
    if edges:
        lines[4] = (
            "An arrow appears when a piece writes a contract that reads another part. "
            "The **Writes to** column below lists write handoffs separately."
        )
    return "\n".join([*lines, *sorted(edges), "```", "", *table, ""])


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="Fail if the committed map needs updating.")
    args = parser.parse_args()
    try:
        generated = render()
        if args.check:
            if not MAP.is_file() or MAP.read_text(encoding="utf-8") != generated:
                raise ValueError("map/README.md needs updating. Run python -I _tools/map.py.")
            print("Folder contracts and generated map are current.")
        else:
            MAP.parent.mkdir(exist_ok=True)
            MAP.write_text(generated, encoding="utf-8", newline="\n")
    except (OSError, ValueError) as error:
        parser.exit(1, f"{error}\n")


if __name__ == "__main__":
    main()
