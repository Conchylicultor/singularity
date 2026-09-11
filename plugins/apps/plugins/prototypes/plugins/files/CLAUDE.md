# files

Server-side file serving for the Prototypes app, plus the live-state resources
that drive gallery refresh and iframe auto-reload.

## Where the content lives: the `apps/prototypes` data dir (`prototypesDir`)

This plugin DECLARES it (`data-dirs/index.ts`) and exports it from its server
barrel — it creates the dir, seeds `_template/` into it, serves it and watches
it. `thumbnails` takes the same declaration from here; never re-derive the path.

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

## The id, and the mint that hands it out

A prototype's folder name IS its id, and it is minted rather than invented:
`proto-<epochSeconds>-<4 base36 chars>`, the shape `newId()` already mints for
attempts and conversations. `core/id.ts` is the ONE spelling of that format —
`newPrototypeId()`, `PROTOTYPE_ID_RE` (the unanchored core shape) and
`isPrototypeId()` — and `core/id.test.ts` pins the mint against both, so the
chip that linkifies a bare id in assistant prose cannot silently stop matching
when the mint changes. That is the `att-`/`block-` failure mode, where each chip
re-types the shape three plugins away from the function that produces it.

Why the folder name and why opaque: the filesystem is then the uniqueness
authority (the mint is a `mkdir`), there is no dir↔id map in front of the routes,
the watcher, the thumbnail cache or the backup source, and no wholesale rewrite
of `index.html` can drop the id. Opaque because the folder is minted BEFORE the
agent has designed anything — a slug chosen at that moment is a guess, and
renaming later would change the id. Nothing is lost to a human: every surface
displays `meta.title`, read out of `<title>`.

`shared/mint.ts` — `mintPrototype({ title? })` → `{ id, dir }` — is the one way a
prototype comes into existence. It copies the SEEDED `_template/` (not the
repo's, so it works in a compiled release and inherits an edit the user made to
the template) into a fresh id, then stamps `<title>` when a name was given. It
lives in `shared/` because it touches `fs` (so not `core/`, which the browser
imports) and because `./singularity prototype new` calls it with no backend
running (so not `server/`) — the same split `shared/read-folder.ts` makes.

`shared/template.ts` holds what the two writers into this directory share:
`copyFolderOnce()` (temp-then-rename, never overwrites, treats a lost rename race
as "somebody else got there first") and `seededTemplateDir()`, which seeds the
template on demand for a CLI mint on a host whose backend has never booted. Boot's
`seedTemplate()` and the mint both go through it, so the never-overwrite rule and
the race handling exist once.

Three consequences worth knowing:

- `POST /api/prototypes` (`createPrototype`, body `{ title? }` → `{ id }`) is how
  the gallery mints before it launches an agent, so the agent is handed a folder
  that already exists and is never asked to name anything. It notifies nothing:
  the mint writes into the watched tree, and the watcher is what re-broadcasts
  the list.
- A folder whose name is not a minted id gets a `problems[]` entry naming
  `./singularity prototype new` as the fix. A *problem*, not a refusal —
  prototypes are user content, so a hand-made folder keeps being listed and
  served; what it loses is being referenceable by id.
- That rule skips `_`-prefixed directories, because `check/index.ts` runs
  `validatePrototypeFolder` over `_template` itself.

Design: `research/2026-08-21-global-prototype-ids-and-mint.md`.

## Version history (`shared/history/`)

Every agent turn that changes a prototype is recorded as a version; the detail
pane steps through them and can restore one; `prototype log -p` is how the next
agent reads the evolution. Design:
`research/2026-09-11-apps-prototype-version-history.md`.

**One private bare git repo per prototype, at `_history/<id>.git`, whose work
tree is the prototype folder.** Beside the folder, not in it: a prototype is
flat, and a `.git` inside would churn the signature and the thumbnail
fingerprint. `_history/` is `_`-prefixed, so `listPrototypeDirNames` skips it
like `_template/`, and both file routes refuse it (404). Not the `history/engine`
DB: prototypes are host-global and forever, a worktree DB is neither.

- `store.ts` — `openHistoryStore(root)`; the caller resolves the root
  (`prototypesDir.path`, per call; the tests pass a temp dir). Ops:
  `ensureHistory` (v0 = the folder as it is; built in a staging dir and renamed
  in, so an existing repo always has its baseline), `adoptAll`, `checkpoint`
  (`add -A`, commit only if `diff --cached` moved; a `messageId` already on a
  commit is `unchanged` — the turn event is at-least-once), `readHistory`
  (versions + `dirty`; adopts on first read), `readVersionFile` (bytes via
  `cat-file blob`), `readVersionPatch`, `restoreVersion` ("Before restore" if
  dirty → `read-tree -u --reset <sha>` → "Restored vN"). Every arg that becomes a
  path or a revision is validated first (`isPrototypeId`, `isVersionSha`,
  `isFlatFileName`).
- `message.ts` — the commit message format, written and read in one module:
  subject (≤ 72), body (the request + agent summary), then `Prototype-Kind` /
  `Prototype-Conversation` / `Prototype-Message` trailers. `n` is the commit's
  position, never stored.
- `git.ts` — hermetic git: the environment is REPLACED (`GIT_CONFIG_GLOBAL=/dev/null`,
  `GIT_CONFIG_NOSYSTEM=1`, no leaked `GIT_DIR`/`GIT_INDEX_FILE`), hooks and
  signing off, fixed identity, `GIT_OPTIONAL_LOCKS=0` so a `status` never takes
  the index lock a write needs. Spelled `git`, not `paths/server`'s `GIT`:
  `shared/` may not import a `server` barrel.
- `lock.ts` — one flock per repo (`_history/<id>.lock`, never unlinked); a
  writer waits ≤ 10 s, then throws `HistoryBusyError` (the job retries).

**How a recorded version reaches every backend.** After each commit the store
writes `_history/<id>.git/latest.json` (`{ n, sha }`, temp-then-rename). Git's
own files have no extension, so they never pass the watcher's extension filter;
this stamp does, and the watcher turns it into a notify of that one id's
`prototypes.history` — without bumping the frame-reload version, since the
prototype's bytes did not move. Folder edits reach it through the signature
gate, which is per folder so it can name the prototypes whose `dirty` may have
flipped. Nothing notifies after a write in-process; the stamp is the one signal.

Adoption: `mintPrototype` calls `ensureHistory` (v0 = the page as minted — the
title is stamped in the staging copy, before the folder is visible); boot and
every real tree change run `adoptAll`, so the prototypes that predate history,
and any folder made by hand, get a v0. Every backend races to do it; the lock
makes one win.

## `./singularity prototype`

Five verbs, contributed as a `cli/` collected dir — auto-discovered, so there is
no registry edit and no codegen edit; `./singularity build` regenerates
`cli.generated.ts` from the filesystem.

- `prototype new [title]` — mint a folder and print its id, its path and its URL.
- `prototype list` — id, title and URL for every prototype on disk, plus any
  `problems[]` the folder carries.
- `prototype log <id> [-p]` — versions newest first, with each request and
  agent summary; `-p` adds each version's diff.
- `prototype checkpoint <id> [-m <msg>]` — record a `manual` version now.
- `prototype restore <id> <vN|sha>` — the pane's Restore button.

**All of them work with no backend running, and that is the point of having them.** The
prototypes tree is host-global and outside every checkout, so `new` calls
`mintPrototype()` straight against the filesystem rather than
`POST /api/prototypes`, and `list` calls `listPrototypeMetas()` rather than
fetching `GET /api/prototypes`. Neither verb has an implementation of its own:
the endpoint and the CLI share the mint, and the list endpoint, the
`prototypes.list` resource and `prototype list` share the lister — so a terminal
answer can never disagree with the gallery.

That sharing is what moved the lister. `listPrototypeMetas()` now lives in
`shared/list-metas.ts`; `server/internal/list.ts` re-exports it, so
`handlers.ts`, `resources.ts` and the server barrel (which `thumbnails` reads it
from) are untouched. Nothing in it was ever server-specific — it reads the data
dir and parses HTML — and `shared/` is where this plugin already keeps the code
a CLI process and the server both run (`read-folder.ts`, `mint.ts`,
`template.ts`).

`cli/index.ts` is the DECLARATION and is loaded on every single `./singularity`
invocation, `build` included, because commander needs the names and flags before
it parses argv. It therefore imports `defineCliCommand` and nothing else; every
body sits behind `run: () => import("./<verb>")`.
`cli:command-declarations-light` fails the declaration if its static closure
reaches an npm package or a `web`/`server` barrel.

`cli/prototype-url.ts` builds
`http://<namespace>.localhost:9000/prototypes/proto/<id>` from parts rather than
by hand: the namespace is minted with `checkoutNamespace(root)` off the CHECKOUT
(a CLI process never sets `SINGULARITY_WORKTREE` for itself, so reading it would
print main's URL from every worktree), `.localhost:9000` comes from
`namespaceUrl`, and `/prototypes` from `prototypesApp.basePath`. The one literal
is the detail pane's own `proto/:name/:stage?` segment — it is declared in
`gallery/web`, which a terminal verb must not import.

## The contract this serves

A prototype is one folder holding a **self-contained `index.html`** plus
whatever flat files it references. Nothing is shared: there is no
`prototypes/_shared/`, no harness, and no `meta.json`. The invariant that
defines it — double-clicking `prototypes/<name>/index.html` in Finder opens and
renders it. If it only works through this API, it isn't self-contained.

Metadata is therefore read out of the HTML, not a sidecar file:

- `<title>` → `title` (default: `UNTITLED_PROTOTYPE`, never the directory
  name — that is an opaque id)
- `<meta name="description">` → `blurb` (default: `""`)
- `<meta name="prototype-viewport" content="WxH">` → `viewport` (default: 1280x800)
- `<meta name="mocks" content="<kind>:<ref>">` → `mocks` (default: `{ kind: "none" }`)
- every `<meta name="prototype-option" content="<name>: <v> | <v>">`, with its
  default read off `<html data-<name>>` → `options` (default: `[]`)

`mocks` is the real app thing this prototype is a mockup OF — the pairing the
Compare stage reads: `fixture:control-panel/setting-rail` (a layout-harness
fixture), `route:/agents/c/123` (the running app at a path). `core/mocks.ts`
parses it (`parseMocks`, pinned by `mocks.test.ts`) into a three-way value on
the wire: `none`, `malformed { raw, reason }`, or `declared { tag, ref }` — split
at the FIRST colon, so a ref may carry its own.

Syntax is all that is judged here. The kind set is open (each kind is a web
plugin contributed into the compare plugin's registry) and the ref is resolved
only there — fixtures and panes are per-worktree code while prototypes are
host-global and outside git, so the pairing can only ever be a runtime lookup,
and a prototype naming a kind or a ref this worktree does not have is a thing
that surface renders, not a problem with the folder.

Absent is the ordinary answer — most prototypes mock nothing — and is never a
`problems[]` entry. A **malformed** line IS one (`validatePrototypeFolder`,
wording from `mocksProblemDetail`): the bare legacy form `control-panel/…` with
no `<kind>:` prefix, an empty half, a kind that is not lowercase letters, digits
and dashes. It surfaces on the card and the Focus banner, where the author is
looking, and the Compare stage repeats it beside the syntax.

`options` are the variants a reader flips between (the contract is in
`prototypes/CLAUDE.md` § Options). `core/options.ts` is pure (parse, fold,
resolve picks, query → picks; pinned by `options.test.ts`);
`core/option-source.ts` is the ONE HTML read of the declaration, shared by the
list, `validatePrototypeFolder` and the server's stamping so they cannot
disagree. The default lives on `<html>` — not "the first value" — so the page
carries the attribute in every context (off disk, thumbnail, app) and the app
only ever overwrites it. A line that cannot be an option is dropped from
`options` and reported in `problems[]`.

Parsed with `HTMLRewriter`; every value it yields is decoded once via
`@plugins/infra/plugins/html-decode/core` — the rewriter decodes nothing.

Design: `research/2026-08-15-global-prototypes-self-contained.md`.

## Routes

- `GET /api/prototypes` → `PrototypeMeta[]` (every `prototypes/<name>/index.html`,
  skipping `_`-prefixed and dot-dirs; the dir name is the `name`). JSON, so it
  goes through `implement()`.
- `POST /api/prototypes` → `{ id }`, body `{ title? }`. Mints a folder from the
  template. JSON, so it goes through `implement()` too.
- `GET /api/prototypes/:name` → **302** to `…/:name/index.html`, carrying the
  query across. Only for hand-typed URLs; nothing in the app links here.
- `GET /api/prototypes/:name/:file` → `prototypes/<name>/<file>` verbatim,
  Content-Type by extension, `Cache-Control: no-store`. Raw handler (custom
  Content-Type, per-file bytes). Path-traversal-guarded to stay under
  `prototypes/`; 400 on escape, 404 on missing. **Except** `index.html` asked
  for with option picks (`?palette=azure`, any key but `v`): the picks are
  checked against the page's own declaration and stamped onto `<html>` as
  `data-*` — the one HTMLRewriter *rewrite* in the repo (every other use only
  extracts). An undeclared name or value is a **400** rendered in the frame: a
  broken variant link must say so, not quietly show the default. The file is
  read whole first because `<html>` streams before the `<meta>` tags that say
  what is valid. With no picks the file streams through untouched.

**Why the extra path segment.** Serving the document at `<name>/index.html`
rather than at `<name>` is what makes a relative `href="styles.css"` inside it
resolve to `/api/prototypes/<name>/styles.css` — the same relative reference
that works off `file://`.

**Why `no-store`.** The version query cache-busts only the document; without it
the browser keeps the old `styles.css` and an edit looks like it didn't land.

- `GET /api/prototypes/:name/versions/:sha/:file` → that file as recorded in
  that version, read out of git; `Cache-Control: immutable` (the sha addresses
  the content); 404 for anything that does not name a version's file. A path
  prefix per version, so its relative `styles.css` resolves to the same version.
  Built by `prototypeVersionUrl(name, sha)`.
- `POST /api/prototypes/:name/versions/:sha/restore` → the new `restore`
  version (`restorePrototypeVersion`, via `implement()`).

Each `:param` matches exactly one segment and the router has no wildcard, so a
prototype folder is flat by construction — `<name>/assets/x.svg` is unserveable.
The router matches on the segment count, so the six-segment version routes
never compete with the four-segment file route.

## Live state

- `prototypes.list` — the prototype list (push).
- `prototypes.version` — a timestamp bumped when a prototype's bytes change;
  iframes append it to their `src` so an agent's edit reloads them
  automatically.
- `prototypes.history` — one prototype's versions + `dirty` (push, keyed by
  `name`); see Version history.

`onReady` starts a `createFileWatcher` over `prototypes/`, watching every
extension a prototype can ship (`.html/.css/.js/.json` plus images and
`.woff2`); `onShutdown` stops it. No polling.

**Nothing bumps the version unless the tree really moved.** Every wake-up — a
watcher event, the 30s reconcile — runs the same gate: re-read
`readPrototypesSignature()` (every file's size + mtime) and return early when it
matches the last one. The version is a RELOAD of every open prototype iframe,
and a prototype is a live app somebody is clicking through, so a reload costs
the author the state they built up on screen. A watcher event only says
something *might* have changed (a touch, a chmod, an atomic save's temp file),
which is not enough of a reason.

That gate is also why the reconcile is affordable at all: it is a backstop for
an fsevent parcel dropped, and on an idle machine it is a few stats that agree
with the last few stats and end there.

**This is the only watcher over that tree, so the signal is exported rather than
re-derived**: `onPrototypesChanged` (plus `prototypesDir` and
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
`prototypesResource` / `prototypesVersionResource` / `prototypeHistoryResource`
(descriptors), `prototypeUrl()` / `prototypeVersionUrl()`, the `listPrototypes` /
`createPrototype` / `restorePrototypeVersion` endpoints, the version shapes
(`PrototypeVersion`, `PrototypeHistory`), and the id format (`newPrototypeId`,
`PROTOTYPE_ID_RE`, `isPrototypeId`). The server barrel adds `checkpointPrototype`
for the `checkpoints` plugin's end-of-turn job.

<!-- AUTOGENERATED:BEGIN — do not edit; regenerated by `./singularity build` -->

## Plugin reference

- Description: Serves raw prototype files from the host-global prototypes data dir (the `apps/prototypes` declaration — shared by every worktree and main, so a mock is visible without a build and without being committed), seeds the repo's _template/ into it, declares the list + version live-state resources, watches the dir to auto-reload open iframes on edit, stamps a document's picked options (?<option>=<value>) onto its <html data-*>, and keeps each prototype's version history (a private git repo per prototype under _history/: the per-prototype history resource, a version's files, restore, and checkpointPrototype).
- Server:
  - Contributes:
    - `resource.declare` "prototypes.list"
    - `resource.declare` "prototypes.version"
    - `resource.declare` "prototypes.history"
  - Uses:
    - `infra/endpoints.HttpError`
    - `infra/endpoints.implement`
    - `infra/file-watcher.createFileWatcher`
    - `infra/file-watcher.FileWatcher`
    - `infra/paths.REPO_ROOT`
  - Exports (values):
    - `checkpointPrototype`
    - `listPrototypeMetas`
    - `onPrototypesChanged`
    - `prototypesDir`
  - Resources:
    - `prototypes.history` (push)
    - `prototypes.list` (push)
    - `prototypes.version` (push)
  - Routes:
    - `GET /api/prototypes`
    - `POST /api/prototypes`
    - `POST /api/prototypes/:name/versions/:sha/restore`
- Core:
  - Uses:
    - `infra/endpoints.defineEndpoint`
    - `infra/html-decode.decodeHtmlText`
    - `infra/html-decode.readHtmlAttr`
    - `primitives/live-state.resourceDescriptor`
  - Exports (types):
    - `MocksDeclaration`
    - `OptionDeclaration`
    - `OptionPicks`
    - `OptionSource`
    - `PrototypeFolder`
    - `PrototypeHistory`
    - `PrototypeMeta`
    - `PrototypeOption`
    - `PrototypeProblem`
    - `PrototypeVersion`
    - `PrototypeVersionKind`
  - Exports (values):
    - `createPrototype`
    - `foldOptions`
    - `humanizeToken`
    - `isPrototypeId`
    - `isScannableFile`
    - `listPrototypes`
    - `MocksDeclarationSchema`
    - `mocksProblemDetail`
    - `newPrototypeId`
    - `parseMocks`
    - `parseOptionDeclaration`
    - `pickedValue`
    - `picksFromQuery`
    - `PROTOTYPE_ASSET_ROUTE`
    - `PROTOTYPE_ENTRY_FILE`
    - `PROTOTYPE_FILE_ROUTE`
    - `PROTOTYPE_ID_RE`
    - `PROTOTYPE_VERSION_FILE_ROUTE`
    - `PROTOTYPE_VERSION_KINDS`
    - `prototypeHistoryResource`
    - `PrototypeHistorySchema`
    - `PrototypeMetaSchema`
    - `PrototypeOptionSchema`
    - `PrototypeProblemSchema`
    - `PROTOTYPES_API_BASE`
    - `prototypesResource`
    - `prototypesVersionResource`
    - `prototypeUrl`
    - `PrototypeVersionSchema`
    - `prototypeVersionUrl`
    - `readOptionSource`
    - `readPrototypeOptions`
    - `resolvePicks`
    - `restorePrototypeVersion`
    - `UNTITLED_PROTOTYPE`
    - `validatePrototypeFolder`
- Cross-plugin:
  - Imported by:
    - `active-data/prototype`
    - `apps/prototypes/checkpoints`
    - `apps/prototypes/gallery`
    - `apps/prototypes/thumbnails`

<!-- AUTOGENERATED:END -->
