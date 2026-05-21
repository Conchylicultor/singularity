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
