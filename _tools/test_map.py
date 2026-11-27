"""Regression checks for malformed map declarations."""

import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent


class MapValidationTests(unittest.TestCase):
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
        self.rejects("commands", "status: draft", "stauts: draft", "frontmatter key 'stauts'")

    def test_indented_status(self):
        self.rejects("commands", "status: draft", "  status: draft", "frontmatter key '  status'")

    def test_lane_heading(self):
        self.rejects("capture", "Step 3 (draft)", "Step Three (draft)", "invalid lane heading")


if __name__ == "__main__":
    unittest.main()
