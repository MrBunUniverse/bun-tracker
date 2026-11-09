/**
 * Splits pending form edits (keyed by form path, e.g. `driftCompensation.amount`)
 * into those whose top-level section is present in a settings response and
 * those that must wait for a response that carries their section.
 */
export function splitPendingEdits<T>(
  edits: Map<string, T>,
  presentSections: Set<string>
) {
  const ready = new Map<string, T>();
  const waiting = new Map<string, T>();
  edits.forEach((value, path) => {
    (presentSections.has(path.split('.')[0]) ? ready : waiting).set(path, value);
  });
  return { ready, waiting };
}
