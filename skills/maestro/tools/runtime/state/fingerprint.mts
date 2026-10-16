// Shared fingerprint identity without importing higher-level verdict rules.
// Both ordinary and repeated-run verification use the same path normalization.

/** JSON objects in state have a stable serialization independent of key order. */
export function sameFingerprint(left: unknown, right: unknown): boolean {
  if (!left || !right || typeof left !== 'object' || typeof right !== 'object') return false;
  const a = left as Record<string, unknown>;
  const b = right as Record<string, unknown>;
  const keys = ['reference', 'build', 'data', 'runtime', 'acceptanceInput'];
  if (!keys.every(key => a[key] === b[key])) return false;
  const pathsA = a['relevantPaths'];
  const pathsB = b['relevantPaths'];
  const hashesA = a['inputHashes'];
  const hashesB = b['inputHashes'];
  if (!Array.isArray(pathsA) || !Array.isArray(pathsB)
    || !hashesA || !hashesB || typeof hashesA !== 'object' || typeof hashesB !== 'object') return false;
  const paths = [...new Set([...pathsA, ...pathsB])].sort();
  return pathsA.length === pathsB.length
    && pathsA.every(path => pathsB.includes(path))
    && paths.every(path => (hashesA as Record<string, unknown>)[String(path)]
      === (hashesB as Record<string, unknown>)[String(path)]);
}
