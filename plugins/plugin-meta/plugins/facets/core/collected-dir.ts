function defineCollectedDir(dir: string) { return { dir, _brand: "CollectedDirDef" as const }; }
export const facetCollectedDir = defineCollectedDir("facet");
