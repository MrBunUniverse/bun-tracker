# Graphify

Graphify is an optional local tool. Skip this file if `graphify` or its cache is not present.

Use the Graphify cache only when a task spans several subsystems and the source call graph is expensive to reconstruct manually. Query it with `graphify query "<question>"` or `graphify explain "<concept>"`; do not read `graphify-out/` directly.

Graphify output is a cache, not authoritative source. Confirm important conclusions against current files. Run `graphify update .` only when explicitly requested or after a substantial source-tree reorganization.

For current-structure queries, exclude `solarxr-protocol/`, `bindings-provider/openvr/`, and build/output directories unless they are explicitly in scope.
