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

    def test_lane_heading(self):
        self.rejects("sources", "Piece 3 (draft)", "Piece Three (draft)", "invalid lane heading")

    def test_lane_with_two_hashes(self):
        self.rejects(
            "sources", "### Text · Piece 3 (draft)", "## Text · Piece 3 (draft)",
            "must be a ### heading under ## Lanes",
        )

    def test_misspelled_lanes(self):
        self.rejects("sources", "## Lanes", "## Lane", "must be a ### heading under ## Lanes")

    def test_open_under_lane(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            self.copy_workspace(root)
            path = root / "modules" / "sources" / "CONTEXT.md"
            contract = path.read_text(encoding="utf-8")
            original = "verifies that a text is kept once.\n"
            self.assertIn(original, contract)
            opened = f"{original}\n#### Open\n\n- An unsettled handoff.\n"
            path.write_text(contract.replace(original, opened, 1), encoding="utf-8")
            result = subprocess.run(
                [sys.executable, "-I", "-X", "utf8", str(root / "_tools" / "map.py"), "--check"],
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
            contract = path.read_text(encoding="utf-8")
            original = "../../contracts/CONTEXT.md#matter"
            self.assertIn(original, contract)
            path.write_text(contract.replace(original, "../../contracts/not-a-shape.md"), encoding="utf-8")
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
            contract = contract.replace(
                '"../../guides/CONTEXT.md"',
                '"../../guides/CONTEXT.md","inner.md"',
            )
            contract = contract.replace(
                "- Reference: [Guides](../../guides/CONTEXT.md)\n",
                "- Reference: [Guides](../../guides/CONTEXT.md)\n- Reference: [Inner](inner.md)\n",
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


if __name__ == "__main__":
    unittest.main()
