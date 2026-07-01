// Ambient types for `@parcel/watcher`'s internal pure-JS wrapper, which ships no
// `.d.ts`. `wrapper.js` exposes `createWrapper(binding)` — the same helper
// `@parcel/watcher`'s own `index.js` uses to turn the native binding into the
// public API. The file-watcher release loader imports it directly so a vendored,
// on-disk `.node` (dlopened inside a `bun --compile` binary) yields the identical
// API as `import("@parcel/watcher")`.
declare module "@parcel/watcher/wrapper" {
  import type * as parcel from "@parcel/watcher";
  export function createWrapper(binding: unknown): typeof parcel;
}
