// The ONE list both halves of a content-addressed artifact derive from.
//
// An artifact's store address is `<slug>.<kind>.<hash of its OWN files>`, and
// the store serves whatever already sits at that address without rebuilding it.
// That is sound only while the file set the address HASHES is exactly the file
// set whose content REACHES the bytes. Two hand-written tables used to decide
// those two halves independently — `internal/own-files.ts` for the address,
// `externals.ts` for the content — and they disagreed: a `fixtures` artifact
// (the layout harness's former leaf folder) inlined its plugin's whole `web/`
// while hashing `fixtures/` only, so editing `web/` left the store answering
// "unchanged" and serving a bundle built against hour-old sibling code (it surfaced as a compose link failure against
// an export that had been moved away an hour earlier).
// See `research/2026-08-17-global-artifact-address-covers-content.md`.
//
// So the inlined-folder set lives here, once, and both halves read it: the
// address side via `hashedRootsFor`/`listOwnFiles`, the content side via the
// externals predicate and the own-folder-barrel rewrite. Everything else in the
// plugin's own tree is external — routed to that folder's own barrel artifact.
//
// `entry` (the composition root, `web-core/web`) is NOT a plugin: it has no
// `@plugins/<own>/…` self-specifier and its own root is the entry dir itself.
// Both call sites special-case it before consulting this module.

/**
 * `web`, `entry`, or any folder-barrel kind (`core`, `prewarm`, …).
 * Open-ended on purpose: the artifact closure builds whatever folder barrels the
 * EMITTED code statically imports.
 */
export type ArtifactKind = string;

/**
 * Plugin-private DRY, in EVERY kind's inlined set by design: `shared/` has no
 * barrel to route to (most such dirs have no `index.ts`) and is deliberately
 * duplicated into each consuming runtime.
 */
export const SHARED_ROOT = "shared";

/**
 * Folders that are never an artifact of their own: each is built as a SECOND
 * ENTRY of its plugin's host-kind artifact (`exhibits` → the `web` artifact).
 *
 * An exhibit renders its plugin's private `web/` components, so it must share
 * that artifact's module instances (slots, contexts, stores) — a standalone
 * `exhibits` artifact would either refuse the deep import into `web/` or
 * inline a second copy of it. Built multi-entry, rollup puts every module both
 * entries reach into a common chunk, and the import map serves
 * `@plugins/<p>/exhibits` from the host artifact's `<folder>.js`.
 */
export const COBUILT_FOLDERS: Readonly<Record<string, ArtifactKind>> = {
  exhibits: "web",
};

/** The co-built folders a `kind` artifact carries as extra entries. */
export function cobuiltFoldersOf(kind: ArtifactKind): readonly string[] {
  return Object.keys(COBUILT_FOLDERS).filter(
    (folder) => COBUILT_FOLDERS[folder] === kind,
  );
}

/** The host kind a co-built `folder` is an entry of, or null for an ordinary kind. */
export function cobuildHostOf(folder: string): ArtifactKind | null {
  return COBUILT_FOLDERS[folder] ?? null;
}

/**
 * The plugin-relative folders an artifact of `kind` inlines — and therefore
 * exactly the folders its address must hash. Every other own folder (including
 * `plugins/`, which holds different plugins) is external. A host kind also
 * inlines its co-built folders: their bytes are part of the same build.
 */
export function inlinedRootsFor(kind: ArtifactKind): readonly string[] {
  return [kind, SHARED_ROOT, ...cobuiltFoldersOf(kind)];
}

/** First path segment of a plugin-relative path: `web/theme/app.ts` → `web`. */
export function firstSegmentOf(rel: string): string {
  const slash = rel.indexOf("/");
  return slash === -1 ? rel : rel.slice(0, slash);
}
