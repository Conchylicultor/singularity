// The vendored Seti set (`seti/seti.json`, written by
// `scripts/vendor-seti.ts`), imported as an ordinary JSON module — bundled into
// a released `bun --compile` binary like any other module — and loaded lazily,
// so only the sprite server's first Seti request pays for parsing it. Plain JS
// with a hand-written `.d.ts`, so tsc does not type the set by the JSON's
// content.
//
// Not `with { type: "file" }` (as the sprites plugin's `icon-sets.js` does for
// the npm sets): Bun 1.4.2's bundler panics on an in-repo `type: "file"` import
// under a catch-all `onLoad` hook, which is what `importClosure` runs.
export function loadSetiJson() {
  return import("./seti/seti.json").then((m) => m.default);
}
