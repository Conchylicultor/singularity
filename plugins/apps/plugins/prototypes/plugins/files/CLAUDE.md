# files

Server-side file serving for the Prototypes app, plus the live-state resources
that drive gallery refresh and iframe auto-reload.

## Where the content lives: `~/.singularity/prototypes/` (`PROTOTYPES_DIR`)

Host-global, outside every checkout, and NOT in git. One shared set that every
worktree backend and main serve, so a mock is visible on the always-running main
app the moment it is written — no build, no commit, no merge — and it survives
the worktree that authored it. Recoverable through the `prototypes` backup
source (git no longer is the safety net).

The one exception is `_template/`, which IS code: it ships in the repo and
`seedTemplate()` copies it into the data dir on boot (temp-then-rename, because
every backend races to do it; never overwrites an existing one).

Enforcement splits the same way. The `prototypes:self-contained` check now only
guards the repo half — the template is valid, and no prototype folder is
committed. Authored prototypes are validated at read time by
`validatePrototypeFolder` (`core/validate.ts`, shared with the check) and their
problems ride out on `PrototypeMeta.problems` to the gallery card. A throwaway
mockup must never be able to fail somebody's code push.

## The contract this serves

A prototype is one folder holding a **self-contained `index.html`** plus
whatever flat files it references. Nothing is shared: there is no
`prototypes/_shared/`, no harness, and no `meta.json`. The invariant that
defines it — double-clicking `prototypes/<name>/index.html` in Finder opens and
renders it. If it only works through this API, it isn't self-contained.

Metadata is therefore read out of the HTML, not a sidecar file:

- `<title>` → `title` (default: the directory name)
- `<meta name="description">` → `blurb` (default: `""`)
- `<meta name="prototype-viewport" content="WxH">` → `viewport` (default: 1280x800)

Parsed with `HTMLRewriter`; every value it yields is decoded once via
`@plugins/infra/plugins/html-decode/core` — the rewriter decodes nothing.

Design: `research/2026-08-15-global-prototypes-self-contained.md`.

## Routes

- `GET /api/prototypes` → `PrototypeMeta[]` (every `prototypes/<name>/index.html`,
  skipping `_`-prefixed and dot-dirs; the dir name is the `name`). JSON, so it
  goes through `implement()`.
- `GET /api/prototypes/:name` → **302** to `…/:name/index.html`, carrying the
  query across. Only for hand-typed URLs; nothing in the app links here.
- `GET /api/prototypes/:name/:file` → `prototypes/<name>/<file>` verbatim,
  Content-Type by extension, `Cache-Control: no-store`. Raw handler (custom
  Content-Type, per-file bytes). Path-traversal-guarded to stay under
  `prototypes/`; 400 on escape, 404 on missing.

**Why the extra path segment.** Serving the document at `<name>/index.html`
rather than at `<name>` is what makes a relative `href="styles.css"` inside it
resolve to `/api/prototypes/<name>/styles.css` — the same relative reference
that works off `file://`.

**Why `no-store`.** The version query cache-busts only the document; without it
the browser keeps the old `styles.css` and an edit looks like it didn't land.

Each `:param` matches exactly one segment and the router has no wildcard, so a
prototype folder is flat by construction — `<name>/assets/x.svg` is unserveable.

## Live state

- `prototypes.list` — the prototype list (push).
- `prototypes.version` — a timestamp bumped on every file change; iframes append
  it to their `src` so an agent's edit reloads them automatically.

`onReady` starts a `createFileWatcher` over `prototypes/`, watching every
extension a prototype can ship (`.html/.css/.js/.json` plus images and
`.woff2`); each change notifies both resources and bumps the version.
`onShutdown` stops it. No polling.

**This is the only watcher over that tree, so the signal is exported rather than
re-derived**: `onPrototypesChanged` (plus `PROTOTYPES_DIR` and
`listPrototypeMetas`) is what lets `thumbnails` react to an edit without a
second `@parcel/watcher` subscription doubling every filesystem event.

## The check

`check/index.ts` contributes `prototypes:self-contained` — the machine-checkable
half. Fails on: no `index.html`, no non-empty `<title>`, a subdirectory, a
leftover `meta.json`, a file referencing `_shared`, `../`, or another
prototype's folder, and `<script type="text/babel" src="…">`.

That last one is the trap worth knowing: Babel-standalone fetches a `src` with
XHR, Chrome blocks file→file XHR, so an external `.jsx` works perfectly through
this server and renders nothing on double-click. JSX goes inline. (A plain
`<script src="fixtures.js">` is an ordinary script load and is fine.)

`_template/` is checked the same way (the seed must itself be self-contained)
but its name is not a forbidden reference target. The check catches copied
*files*, never copied *design*.

The `core` barrel exports the shared contracts the web consumes: `PrototypeMeta`,
`prototypesResource` / `prototypesVersionResource` (descriptors), `prototypeUrl()`,
and the `listPrototypes` endpoint.

<!-- AUTOGENERATED:BEGIN — do not edit; regenerated by `./singularity build` -->

## Plugin reference

- Description: Serves raw prototype files from the host-global prototypes data dir (PROTOTYPES_DIR — shared by every worktree and main, so a mock is visible without a build and without being committed), seeds the repo's _template/ into it, declares the list + version live-state resources, and watches the dir to auto-reload open iframes on edit.
- Server:
  - Contributes:
    - `resource.declare` "prototypes.list"
    - `resource.declare` "prototypes.version"
  - Uses:
    - `infra/endpoints.implement`
    - `infra/file-watcher.createFileWatcher`
    - `infra/file-watcher.FileWatcher`
    - `infra/paths.PROTOTYPES_DIR`
    - `infra/paths.REPO_ROOT`
  - Exports (values):
    - `listPrototypeMetas`
    - `onPrototypesChanged`
  - Resources:
    - `prototypes.list` (push)
    - `prototypes.version` (push)
  - Routes: `GET /api/prototypes`
- Core:
  - Uses:
    - `infra/endpoints.defineEndpoint`
    - `infra/html-decode.decodeHtmlText`
    - `infra/html-decode.readHtmlAttr`
    - `primitives/live-state.resourceDescriptor`
  - Exports (types):
    - `PrototypeFolder`
    - `PrototypeMeta`
    - `PrototypeProblem`
  - Exports (values):
    - `isScannableFile`
    - `listPrototypes`
    - `PROTOTYPE_ASSET_ROUTE`
    - `PROTOTYPE_ENTRY_FILE`
    - `PROTOTYPE_FILE_ROUTE`
    - `PrototypeMetaSchema`
    - `PrototypeProblemSchema`
    - `PROTOTYPES_API_BASE`
    - `prototypesResource`
    - `prototypesVersionResource`
    - `prototypeUrl`
    - `validatePrototypeFolder`
- Cross-plugin:
  - Imported by: `apps/prototypes/thumbnails`

<!-- AUTOGENERATED:END -->
