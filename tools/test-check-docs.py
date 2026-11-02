#!/usr/bin/env python3
"""Runs tools/check-docs.py against throwaway git repositories."""
import os
import subprocess
import sys
import tempfile
import unittest

CHECK = os.path.join(os.path.dirname(os.path.abspath(__file__)), "check-docs.py")


class CheckDocs(unittest.TestCase):
    def run_check(self, files, untracked=()):
        """Returns (exit status, output) for a repository holding `files` and `untracked`."""
        with tempfile.TemporaryDirectory() as root:
            for name, text in {**files, **{name: "x\n" for name in untracked}}.items():
                path = os.path.join(root, name)
                os.makedirs(os.path.dirname(path), exist_ok=True)
                with open(path, "w", encoding="utf-8") as file:
                    file.write(text)
            subprocess.run(["git", "init", "-q"], cwd=root, check=True)
            subprocess.run(["git", "add", "--", *files], cwd=root, check=True)
            result = subprocess.run(
                [sys.executable, CHECK], cwd=root, capture_output=True, text=True
            )
            return result.returncode, result.stdout + result.stderr

    def assert_passes(self, files, untracked=()):
        status, output = self.run_check(files, untracked)
        self.assertEqual(status, 0, output)

    def assert_fails(self, expected, files, untracked=()):
        status, output = self.run_check(files, untracked)
        self.assertEqual(status, 1, output)
        self.assertIn(expected, output)

    def test_valid_tracked_links_pass(self):
        self.assert_passes({
            "README.md": "[a](docs/My%20Guide.md#set-up--run) [dir](docs/) ![i](docs/i.png)\n"
            "[title](docs/My%20Guide.md \"Guide\") [ref][r]\n\n[r]: <docs/My Guide.md>\n"
            "[root](/README.md) [self](#top) [line](tool.py#L3)\n\n# Top\n",
            "docs/My Guide.md": "# Set up — run\n",
            "docs/i.png": "x",
            "tool.py": "x\n",
        })

    def test_untracked_target_fails_even_though_it_exists(self):
        self.assert_fails(
            "README.md:1: not tracked: local.md",
            {"README.md": "[a](local.md)\n"},
            untracked=["local.md"],
        )

    def test_missing_target_fails(self):
        self.assert_fails("not tracked: docs/gone.md", {"README.md": "[a](docs/gone.md)\n"})

    def test_missing_fragment_fails(self):
        self.assert_fails(
            "missing fragment: b.md#nope",
            {"README.md": "[a](b.md#nope)\n", "b.md": "# Real\n"},
        )
        self.assert_fails("missing fragment: #nope", {"README.md": "# Real\n\n[a](#nope)\n"})

    def test_repeated_headings_and_html_anchors_resolve(self):
        self.assert_passes({"README.md": "# Same\n\n# Same\n\n<a name=\"x\"></a>\n\n[a](#same-1) [b](#x)\n"})
        self.assert_fails("missing fragment: #same-2", {"README.md": "# Same\n\n# Same\n\n[a](#same-2)\n"})

    def test_external_links_and_code_are_skipped(self):
        self.assert_passes({
            "README.md": "[a](https://example.com/x.md) [b](mailto:a@b.c)\n"
            "`[c](gone.md)`\n\n```md\n[d](gone.md)\n# Not a heading\n```\n",
        })

    def test_headings_in_code_are_not_anchors(self):
        self.assert_fails(
            "missing fragment: #fake",
            {"README.md": "```\n# Fake\n```\n\n[a](#fake)\n"},
        )

    def test_only_the_named_evidence_folders_are_skipped(self):
        self.assert_passes({"reports/old.md": "[a](/Users/me/gone.md)\n"})
        self.assert_fails("not tracked", {"docs/new.md": "[a](/Users/me/gone.md)\n"})


if __name__ == "__main__":
    unittest.main()
