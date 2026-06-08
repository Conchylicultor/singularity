// The CollectedDir marker. A plugin declares itself a collected runtime by
// calling this function with its dir-name string inside its core/; codegen
// regex-scans core files for that call and generates the runtime's registry.
// (Do NOT write that quoted call form in a comment here — the scanner would match
// it and emit a bogus registry. Use the helper's own name only.)
//
// This is the single canonical home for the marker (previously copy-pasted as a
// local one-liner in every runtime's collected-dir.ts, and defined in codegen/core
// — which the runtimes could not import without forming a cycle through
// plugin-tree/facets).

export interface CollectedDirDef {
  readonly dir: string;
  readonly _brand: "CollectedDirDef";
}

export function defineCollectedDir(dir: string): CollectedDirDef {
  return { dir, _brand: "CollectedDirDef" };
}

export function isCollectedDirDef(value: unknown): value is CollectedDirDef {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as CollectedDirDef)._brand === "CollectedDirDef"
  );
}
