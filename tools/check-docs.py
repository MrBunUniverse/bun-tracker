#!/usr/bin/env python3
"""Checks relative Markdown links and #fragments in tracked docs against `git ls-files`.

A link passes only if its target is tracked, so a file that exists locally but was never
committed still fails. External URLs are skipped. Run from anywhere inside the repository.
Tests: tools/test-check-docs.py
"""
import os
import re
import subprocess
import sys
from urllib.parse import unquote

# Dated evidence and vendored reference text, kept as written. Their absolute links are not ours to fix.
SKIPPED = (
    ".agents/skills/apple-design/references/hig/",
    "reports/",
    "research_notes/",
)

FENCE = re.compile(r"^ {0,3}(`{3,}|~{3,})(.*)$")
CODE_SPAN = re.compile(r"(?<!`)(`+)(?!`).*?(?<!`)\1(?!`)")
# [text](target "title"), with one level of parentheses allowed in the target.
INLINE = re.compile(r"\]\(\s*(<[^>\n]*>|(?:[^\s()]|\([^\s()]*\))*)(?:\s+[\"'(][^\n]*?)?\s*\)")
REFERENCE = re.compile(r"^ {0,3}\[[^\]]+\]:\s*(<[^>\n]*>|\S+)")
HEADING = re.compile(r"^ {0,3}#{1,6}[ \t]+(.+?)[ \t]*#*[ \t]*$")
HTML_ANCHOR = re.compile(r"""<a\s[^>]*\b(?:id|name)=["']([^"']+)["']""", re.I)
SCHEME = re.compile(r"^(?:[a-zA-Z][a-zA-Z0-9+.-]*:|//)")


def prose_lines(text):
    """Yields (line number, line) outside fenced code, with inline code removed."""
    fence = ""
    for number, line in enumerate(text.splitlines(), 1):
        match = FENCE.match(line)
        if fence:
            if match and match[1].startswith(fence) and not match[2].strip():
                fence = ""
        elif match:
            fence = match[1]
        else:
            yield number, CODE_SPAN.sub("", line)


def slug(heading):
    """GitHub's heading anchor: lowercase, punctuation removed, spaces become hyphens."""
    text = re.sub(r"!?\[([^\]]*)\]\([^)]*\)", r"\1", heading)  # links keep their text
    text = re.sub(r"[*`]|<[^>]+>", "", text)
    return re.sub(r"[^\w\- ]", "", text.strip().lower()).replace(" ", "-")


def anchors(text):
    found = set()
    counts = {}
    for _, line in prose_lines(text):
        found.update(HTML_ANCHOR.findall(line))
        heading = HEADING.match(line)
        if heading:
            base = slug(heading[1])
            count = counts.get(base, 0)
            counts[base] = count + 1
            found.add(f"{base}-{count}" if count else base)
    return found


def links(text):
    for number, line in prose_lines(text):
        for match in INLINE.finditer(line):
            yield number, match[1].strip("<>")
        reference = REFERENCE.match(line)
        if reference:
            yield number, reference[1].strip("<>")


def check_link(source, target, tracked, read):
    if not target or SCHEME.match(target):
        return None
    path, _, fragment = target.partition("#")
    path = unquote(path.partition("?")[0])
    # A leading slash means the repository root, as on GitHub.
    base = "" if path.startswith("/") else os.path.dirname(source)
    resolved = os.path.normpath(os.path.join(base, path.lstrip("/"))) if path else source
    folder = resolved + "/"
    if resolved not in tracked and not any(name.startswith(folder) for name in tracked):
        return f"not tracked: {target}"
    if fragment and resolved.endswith(".md") and resolved in tracked:
        if unquote(fragment) not in anchors(read(resolved)):
            return f"missing fragment: {target}"
    return None


def main():
    root = subprocess.run(
        ["git", "rev-parse", "--show-toplevel"], capture_output=True, text=True, check=True
    ).stdout.strip()
    listed = subprocess.run(
        ["git", "-C", root, "ls-files", "-z"], capture_output=True, text=True, check=True
    ).stdout
    # A tracked file deleted from the working tree is a dead link too.
    tracked = {name for name in listed.split("\0") if os.path.lexists(os.path.join(root, name))}

    def read(name):
        with open(os.path.join(root, name), encoding="utf-8") as file:
            return file.read()

    docs = sorted(n for n in tracked if n.endswith(".md") and not n.startswith(SKIPPED))
    problems = []
    for doc in docs:
        for number, target in links(read(doc)):
            problem = check_link(doc, target, tracked, read)
            if problem:
                problems.append(f"{doc}:{number}: {problem}")

    print("\n".join(problems) if problems else f"Docs: {len(docs)} files, links OK.")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
