function defineCollectedDir(dir: string) { return { dir, _brand: "CollectedDirDef" as const }; }
export const centralCollectedDir = defineCollectedDir("central");
