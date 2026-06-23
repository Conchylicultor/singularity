# ultimate-guitar

Ultimate Guitar (UG) input source for Sonata. The source pipeline so far:

- **Task 1 — fetch.** A server endpoint takes a pasted UG tab URL, resolves it
  to a numeric tab id, and fetches the raw tab JSON from UG's private **mobile
  API**. `content` is returned verbatim.
- **Task 2 — parse.** A pure `core/parse.ts` turns that verbatim `content`
  markup into a structured song model (ordered sections → lines, each carrying
  its chords as `symbol` + `charOffset` over the lyric).
- **Task 5 — compile + player-side source.**
  - `web/compile.ts` synthesizes a `Score` from a parsed tab. UG ships no
    timing, so the compiler *owns* a chord-per-bar timeline (one bar per chord,
    synthesized 4/4 at a default tempo): recognised chords become
    `source:"authored"` chord annotations → voiced notes, plus `section` and
    `lyric` annotations.
  - `web/index.ts` registers the source player-side: a `Sonata.Source`
    (`Ultimate Guitar`, wiring the URL loader + `compile`) and an in-player
    editor `Sonata.Section` (`area: "editor"`). `web/loader.tsx` pastes a UG URL
    and fetches its raw `UgTab` (the fetched tab *is* the persisted `raw`).
- **Task 6 — library persistence + hydration + create affordance.**
  - **Persistence.** `server/internal/tables.ts` owns the
    `sonata_songs_ext_ultimate_guitar` side-table (via the entity-extensions
    primitive). Its columns ARE the `UgTab` fields (`tabId`, `songName`,
    `artistName`, `type`, `key`, `capo`, `tuning`, `content`, `urlWeb`), so the
    stored row reconstructs the exact `raw` that `compile()` consumes. We
    deliberately store the parsed source-of-truth (the `content` markup +
    metadata) and **NOT** a cached parse: `parseUgTab` is pure and cheap, so a
    parsed-cache column would only add a staleness footgun.
  - **Endpoints** (`shared/endpoints.ts`, handlers in `server/internal/routes.ts`):
    `POST /api/sonata/songs/ultimate-guitar` (create — writes the generic song
    row via `createSongRow`, title ← `songName` / composer ← `artistName`, then
    the extension row), `GET /api/sonata/songs/:id/ultimate-guitar` (fetch the
    persisted `UgTab` or `null`), `PUT /api/sonata/songs/:id/ultimate-guitar`
    (persist a full snapshot — upsert the extension row + `updateSongMeta`).
  - **Hydration.** `web/hydrate.ts` fetches the persisted `UgTab` and hands it to
    the library's generic `setRawMap` (keyed `"ultimate-guitar"`); `undefined`
    for a song with no UG tab, so the editor section stays hidden for it.
  - **Create affordance.** `web/index.ts` contributes `Library.Source`
    (`sourceId` + `hydrate` + `createOption`). The create option opens the
    **"Import from Ultimate Guitar"** URL-paste dialog
    (`web/components/ug-import-dialog.tsx`) via the imperative-dialog primitive.
    The flow is **fetch-first**: fetch the tab → `compile()` → create → open, so
    a cancel (or a fetch failure) never leaves a half-formed "Untitled" orphan in
    the library. The in-player editor section debounce-persists edits and keeps
    the live header title in sync when a different tab is loaded.

## Markup parser (`core/parse.ts`)

`parseUgTab(tab)` (or `parseUgContent(content)` for the markup alone) maps UG's
raw text into `{ sections, key, capo }`:

| UG element | Parsed into |
| --- | --- |
| `[ch]Cmaj7[/ch]` | a `ParsedChord` `{ symbol, charOffset }` — `symbol` carried **verbatim** (chord *validity* is the compile step's job, via `theory.parseChordSymbol`) |
| `[Verse]` / `[Chorus]` / `[Verse 1]` … | a `ParsedSection.name` (a bracketed label alone on its line) |
| lyric text | a `ParsedLine.lyric` with chords positioned over it by column |
| `[tab]…[/tab]` | whitespace-preservation wrappers — recognised but **zero-width** |
| key / capo | carried through from the UG metadata fields, not the markup |

The load-bearing idea: **markup tokens are zero-width**. The scanner advances a
visible column for every residual character and skips the markup, so a chord's
`charOffset` is the column it aligns to in the lyric — whether the chords float
on the line *above* the lyric (the common case) or are woven *inline* into it.
That also means `[tab]`/`[/tab]` never shift a column (textually stripping them
would). Content before the first header lands in an implicit empty-named
section.

**Fail loud.** Malformed markup is never silently dropped — it throws a
classified [`UgParseError`](core/parse.ts) (`unbalanced-chord` for an
unterminated / nested / stray `[ch]`, `empty-chord` for `[ch][/ch]`,
`unbalanced-tab` for unbalanced `[tab]` blocks), the same loud-failure posture
as the fetch layer. Co-located `core/parse.test.ts` (bun:test, no network).

## ⚠️ Fragility caveat

UG has no public/official API. This targets the undocumented Android **mobile
API** with app-version + per-request signing headers (mobile-API-only, no
fallback). UG can rotate the endpoint, headers, or signing scheme at any time,
which **will break fetch**. The client fails loudly — every breakage becomes a
classified [`UgFetchError`](core/errors.ts), never a silent failure.

## Mobile-API request

```
GET https://api.ultimate-guitar.com/api/v1/tab/info?tab_id=<ID>&tab_access_type=private
```

Headers:

| Header | Value |
| --- | --- |
| `User-Agent` | `UGT_ANDROID/4.11.1 (Pixel; 8.1.0)` |
| `Accept` | `application/json` |
| `Accept-Charset` | `utf-8` |
| `X-UG-CLIENT-ID` | `<deviceId>` — first 16 chars of `randomBytes(16).toString("hex")`, fresh per request |
| `X-UG-API-KEY` | `md5( deviceId + "<UTC yyyy-mm-dd>:<UTC hour int, no leading 0>createLog()" )`, lowercase hex |

The salt literal is exactly `createLog()`; the date/hour are **UTC**; the hour is
an integer with **no leading zero**. The signing logic lives in
[`server/internal/ug-client.ts`](server/internal/ug-client.ts) — if UG rotates
the scheme, that is the single place to update.

## Failure-mode table

| Upstream | UG meaning | `UgFetchError.kind` | HTTP |
| --- | --- | --- | --- |
| (bad URL) | not a UG tab URL / no id | `invalid-url` | 400 |
| 404 | tab id not found | `not-found` | 404 |
| 400 | "Missing required api parameter" — headers/params changed | `bad-request` | 502 |
| 498 | "Token expired/invalid" — **signing scheme rotated** (canary) | `signature-rejected` | 502 |
| other non-2xx | unexpected upstream status | `upstream` | 502 |
| non-JSON / shape mismatch | mobile-API response shape changed | `malformed-response` | 502 |
| SSRF / DNS / timeout | transport failure | `network` | 502 |

The 502 cases are deliberately loud server-side breakages — the kind worth
surfacing as crash tasks, not just toasts.

## Layout

- `core/` — pure, framework-free (depends on nothing but `zod`):
  `UgTab`/`UgTabSchema`, `extractUgTabId`, `UgFetchError`/`UgFetchErrorKind`, and
  the `parseUgTab`/`parseUgContent` markup parser with its
  `UgParseError`/`UgParseErrorKind` taxonomy and `Parsed*` model types.
  Co-located `tab-url.test.ts` + `parse.test.ts` (bun:test, no network).
- `shared/endpoints.ts` — `fetchUgTab` endpoint contract.
- `server/internal/ug-client.ts` — the signing + `safeFetch` + loud-failure
  client (`fetchUgTabContent`).
- `server/internal/routes.ts` — `implement()` handler; maps `UgFetchError.kind`
  → `HttpError`.
- `web/compile.ts` — `compile(raw)` + the pure `synthesizeScore(parsed)`,
  `collectUnrecognisedChords(parsed)` (the deduped set of chord symbols
  `synthesizeScore` drops because `theory.parseChordSymbol` can't recognise
  them — same recognise-gate, so the two can't disagree), and the timing
  constants (`UG_TRACK`, `UG_NOTE_PREFIX`, `UG_BEATS_PER_BAR`,
  `UG_DEFAULT_TEMPO_BPM`). Co-located `compile.test.ts` (bun:test).
- `web/constants.ts` — `UG_SOURCE_ID` (the `rawById` key shared by the source
  registration + editor section).
- `web/loader.tsx` — `UltimateGuitarLoader`: paste-URL + fetch UI (the fetched
  `UgTab` is the persisted `raw`); fetch/markup errors **and** the
  unrecognised-chord set (`collectUnrecognisedChords`) surfaced in a
  `role="alert"` line — never silently dropped, mirroring chord-grid's
  `skipped`.
- `web/components/ug-editor-section.tsx` — `UltimateGuitarEditorSection`: the
  in-player editor, gated to UG songs; debounce-persists edits via the `PUT`
  endpoint and syncs the live header title when a different tab is loaded.
- `web/components/ug-import-dialog.tsx` — `UgImportDialog`: the
  "Import from Ultimate Guitar" URL-paste dialog (fetch → compile → create →
  open), rendered through the imperative-dialog primitive.
- `web/components/ug-create-option.tsx` — `ultimateGuitarCreateOption`: the
  `Library.Source` create affordance opening the import dialog.
- `web/hydrate.ts` — `hydrate(songId)`: fetches the persisted `UgTab` for the
  library's generic raw collection.
- `server/internal/tables.ts` — the `sonata_songs_ext_ultimate_guitar`
  side-table (columns = the `UgTab` fields).
- `web/index.ts` — the player-side barrel: `Sonata.Source`, `Library.Source`
  (hydrate + create), and the editor `Sonata.Section`.

<!-- AUTOGENERATED:BEGIN — do not edit; regenerated by `./singularity build` -->

## Plugin reference

- Description: Player-side Ultimate Guitar source for Sonata: paste a UG tab URL, fetch its raw tab, and compile() the chord/lyric markup into a playable Score (chord-per-bar timing synthesis → annotations + voiced notes, sections, lyrics, synthesized 4/4 tempo). Persists the loaded tab to a per-song side-table, hydrates it on open, and contributes the library 'Import from Ultimate Guitar' URL-paste affordance plus an in-player editor section. Ultimate Guitar source server: fetches raw tabs from UG's private mobile API (fails loudly), and owns the sonata_songs_ext_ultimate_guitar side-table — creating UG-backed songs from a fetched tab and persisting edits (syncing the parent song's title/duration).
- Web:
  - Contributes: `Sonata.Source` "Ultimate Guitar", `Library.Source` "ultimate-guitar", `Sonata.Section` "Ultimate Guitar" → `UltimateGuitarEditorSection`
  - Uses: `apps/sonata/library.Library`, `apps/sonata/library.openSongImperative`, `apps/sonata/shell.Sonata`, `apps/sonata/shell.useSonata`, `infra/endpoints.fetchEndpoint`, `primitives/css/card.Card`, `primitives/css/spacing.Stack`, `primitives/css/surface.Surface`, `primitives/css/ui-kit.Button`, `primitives/css/ui-kit.DialogDescription`, `primitives/css/ui-kit.DialogTitle`, `primitives/imperative-dialog.openDialog`
- Server:
  - Uses: `apps/sonata/library._songs`, `apps/sonata/library.createSongRow`, `apps/sonata/library.updateSongMeta`, `infra/endpoints.HttpError`, `infra/endpoints.implement`, `infra/entity-extensions.defineExtension`, `infra/safe-fetch.safeFetch`, `infra/safe-fetch.SsrfError`
  - DB schema: `plugins/apps/plugins/sonata/plugins/sources/plugins/ultimate-guitar/server/internal/tables.ts`
  - Entity extension of: `apps/sonata/library` (table `sonata_songs_ext_ultimate_guitar`)
  - Exports: Values: `fetchUgTabContent`, `songUltimateGuitar`
  - Routes: `POST /api/sonata/sources/ultimate-guitar/fetch`, `POST /api/sonata/songs/ultimate-guitar`, `GET /api/sonata/songs/:id/ultimate-guitar`, `PUT /api/sonata/songs/:id/ultimate-guitar`
- Core:
  - Exports: Types: `ParsedChord`, `ParsedLine`, `ParsedSection`, `ParsedTab`, `UgFetchErrorKind`, `UgParseErrorKind`, `UgTab`; Values: `extractUgTabId`, `parseUgContent`, `parseUgTab`, `UgFetchError`, `UgParseError`, `UgTabSchema`

<!-- AUTOGENERATED:END -->
