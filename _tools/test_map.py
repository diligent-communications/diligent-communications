"""Regression checks for malformed map declarations."""

import re
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
FOLDERS = ("_tools", "contracts", "map", "modules", "guides")
LANE_CONTRACT = """---
build_step: 1
status: draft
consumes: []
produces: []
---
# sources — What exists at each source

## Lanes

### Text · Piece 3 (draft)

#### Check

verifies that a text is kept once.

#### Open

- An unsettled handoff.
"""


class MapValidationTests(unittest.TestCase):
    def copy_workspace(self, root):
        for folder in FOLDERS:
            shutil.copytree(ROOT / folder, root / folder)

    def rejects(self, module, original, replacement, message):
        relative = Path("modules") / module / "CONTEXT.md"
        contract = (ROOT / relative).read_text(encoding="utf-8")
        self.assertIn(original, contract)

        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            path = root / relative
            path.parent.mkdir(parents=True)
            path.write_text(contract.replace(original, replacement, 1), encoding="utf-8")
            script = root / "_tools" / "map.py"
            script.parent.mkdir()
            shutil.copyfile(ROOT / "_tools" / "map.py", script)
            result = subprocess.run(
                [sys.executable, "-I", "-X", "utf8", str(script), "--check"],
                capture_output=True, text=True, encoding="utf-8",
            )
            self.assertEqual(result.returncode, 1, result.stderr)
            self.assertIn(message, result.stderr)

    def test_misspelled_status(self):
        self.rejects("operations", "status: draft", "stauts: draft", "frontmatter key 'stauts'")

    def test_indented_status(self):
        self.rejects("operations", "status: draft", "  status: draft", "frontmatter key '  status'")

    def run_fixture(self, relative, text, check):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            path = root / relative
            path.parent.mkdir(parents=True)
            path.write_text(text, encoding="utf-8")
            script = root / "_tools" / "map.py"
            script.parent.mkdir()
            shutil.copyfile(ROOT / "_tools" / "map.py", script)
            command = [sys.executable, "-I", "-X", "utf8", str(script)]
            if check:
                command.append("--check")
            return subprocess.run(command, capture_output=True, text=True, encoding="utf-8")

    def test_lane_heading(self):
        result = self.run_fixture(
            "modules/sources/CONTEXT.md", LANE_CONTRACT.replace("Piece 3 (draft)", "Piece Three (draft)"), True,
        )
        self.assertEqual(result.returncode, 1, result.stderr)
        self.assertIn("invalid lane heading", result.stderr)

    def test_lane_with_two_hashes(self):
        result = self.run_fixture(
            "modules/sources/CONTEXT.md",
            LANE_CONTRACT.replace("### Text · Piece 3 (draft)", "## Text · Piece 3 (draft)"),
            True,
        )
        self.assertEqual(result.returncode, 1, result.stderr)
        self.assertIn("must be a ### heading under ## Lanes", result.stderr)

    def test_misspelled_lanes(self):
        result = self.run_fixture(
            "modules/sources/CONTEXT.md", LANE_CONTRACT.replace("## Lanes", "## Lane"), True,
        )
        self.assertEqual(result.returncode, 1, result.stderr)
        self.assertIn("must be a ### heading under ## Lanes", result.stderr)

    def test_open_under_lane(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            self.copy_workspace(root)
            path = root / "modules" / "sources" / "CONTEXT.md"
            path.write_text(LANE_CONTRACT, encoding="utf-8")
            result = subprocess.run(
                [sys.executable, "-I", "-X", "utf8", str(root / "_tools" / "map.py")],
                capture_output=True, text=True, encoding="utf-8",
            )
            self.assertEqual(result.returncode, 0, result.stderr)

    def test_top_level_node_modules_needs_no_contract(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            self.copy_workspace(root)
            (root / "node_modules" / "typescript").mkdir(parents=True)
            result = subprocess.run(
                [sys.executable, "-I", "-X", "utf8", str(root / "_tools" / "map.py"), "--check"],
                capture_output=True, text=True, encoding="utf-8",
            )
            self.assertEqual(result.returncode, 0, result.stderr)

    def test_unrouted_shape_file_is_rejected(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            self.copy_workspace(root)
            path = root / "modules" / "brief" / "CONTEXT.md"
            path.write_text(
                "---\nbuild_step: 1\nstatus: draft\n"
                "consumes: [\"../../contracts/not-a-shape.md\"]\nproduces: []\n---\n"
                "# brief — The matters\n\n## Inputs\n\n"
                "- Reference: [Missing](../../contracts/not-a-shape.md)\n",
                encoding="utf-8",
            )
            result = subprocess.run(
                [sys.executable, "-I", "-X", "utf8", str(root / "_tools" / "map.py"), "--check"],
                capture_output=True, text=True, encoding="utf-8",
            )
            self.assertEqual(result.returncode, 1, result.stderr)
            self.assertIn("unknown shared shape", result.stderr)

    def test_a_draft_page_is_marked_and_can_draw_an_arrow(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            self.copy_workspace(root)
            page = root / "modules" / "app" / "inner.md"
            page.write_text("Draft.\n\nSee [store](../store/CONTEXT.md).\n", encoding="utf-8")
            path = root / "modules" / "app" / "CONTEXT.md"
            contract = path.read_text(encoding="utf-8")
            contract = contract.replace("consumes: []", 'consumes: ["inner.md"]', 1)
            contract = contract.replace(
                "# app — The screens\n",
                "# app — The screens\n\n## Inputs\n\n- Reference: [Inner](inner.md)\n",
                1,
            )
            path.write_text(contract, encoding="utf-8")
            result = subprocess.run(
                [sys.executable, "-I", "-X", "utf8", str(root / "_tools" / "map.py")],
                capture_output=True, text=True, encoding="utf-8",
            )
            self.assertEqual(result.returncode, 0, result.stderr)
            text = (root / "map" / "README.md").read_text(encoding="utf-8")

            def node(name):
                match = re.search(rf'(\w+)\["modules/{name}"\]', text)
                self.assertIsNotNone(match, name)
                return match.group(1)

            self.assertIn(f"    {node('app')} --> {node('store')}", text)
            self.assertIn("inner.md draft", text)

    def test_no_arrows_sentence_matches_whether_the_map_draws_any(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            self.copy_workspace(root)
            script = [sys.executable, "-I", "-X", "utf8", str(root / "_tools" / "map.py")]
            result = subprocess.run(script, capture_output=True, text=True, encoding="utf-8")
            self.assertEqual(result.returncode, 0, result.stderr)
            text = (root / "map" / "README.md").read_text(encoding="utf-8")
            self.assertIn("There are no arrows yet.", text)
            diagram = text.split("```", 2)[1]
            self.assertNotIn("-->", diagram)

            path = root / "modules" / "brief" / "CONTEXT.md"
            contract = path.read_text(encoding="utf-8")
            contract = contract.replace("consumes: []", 'consumes: ["../store/CONTEXT.md"]', 1)
            contract = contract.replace(
                "# brief — The matters\n",
                "# brief — The matters\n\n## Inputs\n\n- Reference: [Store](../store/CONTEXT.md)\n",
                1,
            )
            path.write_text(contract, encoding="utf-8")
            result = subprocess.run(script, capture_output=True, text=True, encoding="utf-8")
            self.assertEqual(result.returncode, 0, result.stderr)
            text = (root / "map" / "README.md").read_text(encoding="utf-8")
            self.assertNotIn("There are no arrows yet", text)
            self.assertIn("-->", text)

    def test_piece_span_status_uses_piece_words(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            self.copy_workspace(root)
            path = root / "modules" / "operations" / "CONTEXT.md"
            contract = path.read_text(encoding="utf-8")
            self.assertIn("build_step: 1\n", contract)
            path.write_text(contract.replace("build_step: 1\n", "build_step: 1 to 2\n", 1), encoding="utf-8")
            result = subprocess.run(
                [sys.executable, "-I", "-X", "utf8", str(root / "_tools" / "map.py")],
                capture_output=True, text=True, encoding="utf-8",
            )
            self.assertEqual(result.returncode, 0, result.stderr)
            text = (root / "map" / "README.md").read_text(encoding="utf-8")
            self.assertIn("Piece 1 complete, piece 2 draft", text)

    def test_table_says_piece(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            self.copy_workspace(root)
            result = subprocess.run(
                [sys.executable, "-I", "-X", "utf8", str(root / "_tools" / "map.py")],
                capture_output=True, text=True, encoding="utf-8",
            )
            self.assertEqual(result.returncode, 0, result.stderr)
            text = (root / "map" / "README.md").read_text(encoding="utf-8")
            self.assertIn(
                "| Folder contract | Piece | Contract status | Outputs | Writes to |",
                text,
            )
            self.assertNotIn("Build step", text)
            self.assertIn("An arrow appears when a piece writes a contract that reads another part.", text)
            self.assertNotIn("Every arrow points toward", text)
            self.assertNotIn("points toward the contract", text)


if __name__ == "__main__":
    unittest.main()
