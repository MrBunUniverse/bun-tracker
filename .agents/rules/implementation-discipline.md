# Implementation Discipline

Understand the affected flow before editing. Read `git status --short` and the files directly involved, then trace the shared caller or boundary responsible for the behavior and fix it once rather than patching each symptom.

Prefer, in order:

1. Existing project behavior or helper.
2. Standard library or native platform capability.
3. An already-installed dependency.
4. A small local implementation.

Avoid speculative abstractions, duplicate utilities, and new dependencies without a concrete benefit. Minimal means the smallest correct, maintainable change, not the fewest lines regardless of edge cases.

Keep edits focused. Do not combine a feature or bug fix with unrelated formatting, renaming, deletion, or repository cleanup.

Non-trivial logic needs a focused automated check. Do not compromise input validation, error handling, security, accessibility, user data, or real-hardware requirements to reduce a diff.
