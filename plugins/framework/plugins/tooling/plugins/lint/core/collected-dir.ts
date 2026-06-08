// Unlike the other runtimes' markers, this one is NOT consolidated onto the
// canonical defineCollectedDir in
// @plugins/framework/plugins/tooling/plugins/collected-dir/core: eslint.config.ts
// statically imports lint/core through jiti, which cannot resolve `@plugins/*`
// tsconfig aliases. So lint/core must stay alias-free and inline the marker — the
// same jiti constraint that forces the `lint/` loader in eslint.config.ts to
// reconstruct absolute paths instead of using the shared loadCollectedDir helper.
function defineCollectedDir(dir: string) { return { dir, _brand: "CollectedDirDef" as const }; }
export const lintCollectedDir = defineCollectedDir("lint");
