# curriculum

What the learner practises, and the path that suggests what to practise next.
Design: `research/2026-09-23-apps-chord-trainer-free-curriculum.md` (it
replaced the step ladder of `research/2026-09-19-apps-chord-trainer-curriculum.md`).

## The model: two axes the learner sets, and a path that only suggests

- **Which chords** — every chord is `practice` (its boxes can be blank, it has
  an answer button), `hear` (it can play in a loop, its boxes are always given)
  or `off` (no loop holding it plays). Plus the key modes a loop may be in.
- **How much is blank** (`Blanks`) — `one` (the target's last box), `half`
  (the practised boxes in the loop's second half), `all` (every practised box).

Both are one value, the **selection** (`Selection`: `chords` — every chord
that is not off, with its state —, `blanks`, `modes`), live as
`chord.curriculum`. Nothing gates anything: the learner can change either axis
at any time, and the trainer follows at once.

```ts
askedPositions(boxes, { windowBeats, blanks, practised, target }) → number[]
// only a practised chord's box can be blank; never empty: a rule that picks
// nothing falls back to the last practised box; a target not practised throws
```

## The path

`path.ts` is **plain data**: `CHAPTERS`, each a hand-written list of rows (a
chord, a few chords heard as one idea — both inversions of a chord —, or a key
mode). A **cell** is (chapter, row, blanks); the map shows every cell.

- `routeOf(chapter)`: the cells the path suggests, in order — the first row at
  one, half, all; every later row at one (alone), then all. `ROUTE` is every
  chapter's route; the rest of the map is "off the route", still clickable.
- `cellSelection(cell)`: what a cell means. Everything met before is practised
  (earlier chapters whole, this chapter's earlier rows), except a later row at
  `one`: then this chapter's earlier rows are only heard, so the new chord is
  named alone against known ones. Modes: every mode the rows so far open.
- `cellOf(selection)`: the cell a selection is, or null — free practice. No two
  cells mean the same selection (tested), so it reads back exactly.
- `cellStanding(cell, standing)` / `nextCell(standing)`: a cell is mastered when
  every chord of its row is mastered **at that blanks level** (progress keeps a
  standing per level, `byBlanks`); the next cell is the first route cell not
  mastered. A key-mode row has no chord, so nothing to score — it is never
  "next". The standing is a function the caller passes, so this plugin does not
  depend on progress (progress depends on it, for `Blanks`).

**What a chord IS still comes from `stages.ts`**, the chord families
(`stageOf`, first match wins: major-key triads, minor keys, sevenths,
inversions — only once the root-position twin is known —, secondary dominants,
colour, and the four modal stages, which hold no chord). `path.test.ts` checks
every row's chords belong to one of its chapter's stages, so the hand list
cannot drift from how the app classifies chords. That is why V7 is in Sevenths,
not in Major keys, and borrowed iv / ♭VII are in Minor keys.

## Server surface

```ts
chord.curriculum;                      // live: Selection
POST /api/chord/curriculum/chord       // { token, state }
POST /api/chord/curriculum/chapter     // { chapter, state } — every chord of it, and its modes
POST /api/chord/curriculum/blanks      // { blanks }
POST /api/chord/curriculum/cell        // { cell } — the server computes cellSelection
```

- The writes are pure functions over a selection (`change.ts`:
  `withChordState`, `withChapterState`, `withBlanks`), applied in one
  transaction by `updateSelection`, which locks the row so two tabs apply one
  after the other. None answers the new value: the resource pushes it.
- `chapter` → `off` that would leave no key mode on is refused with a 409 —
  no loop could play.
- A client never sends a whole selection it computed: `cell` takes the cell
  and the server works out what it means.

## `chord_curriculum`

One row (`id = 1`): `chords jsonb`, `blanks text`, `modes jsonb`,
`updated_at`. **No row means nobody has changed anything**: the loader answers
`firstSelection()` (I, IV, V practised, half, major) and the first write
inserts the row — so there is no seed migration.

Kept in worktree forks and backups, and in the change feed (which pushes
`chord.curriculum`): it is the learner's own choice, nothing can rebuild it.
No growth bound: it is one row.

## web

```ts
useCurriculum()        → ResourceResult<Selection>   // pending until the first value
useCurriculumWrites()  → { setChordState, setChapterState, setBlanks, applyCell, pending }
<PathCard selection standing/>   // the folded card holding every control
<PathProgress standing/>         // the step bar of the chapter in hand
```

- **A pending selection is a loading state**, never buttons: the trainer shows
  its skeleton until the selection lands.
- **A refused write is a toast** with the server's sentence.
- **`<PathCard>`**, folded by default. Closed: "Path" and one word on where the
  learner stands (On track / On the path / Off the route / Free practice), plus
  **Resume: ‹row› · ‹blanks›** when they are not on the suggested cell. Open:
  the chord chips (the first chapter's chords and every chord on, in path
  order; a click moves one practise → hear only → off; the **+** menu sets a
  whole chapter), the Blanks control (One · Half · All, each with a tiny loop
  glyph), a sentence on where the path goes next (with Go / Back to the path),
  and the chapter accordion — each chapter opens to its map: rows × blanks,
  cells filled by progress, a check when mastered, a ring for "you are here", a
  pulse for "next", dashed when off the route. Clicking a cell applies it.
- **`standing`** is how the path reads a chord at a blanks level: the trainer
  builds it from `chord.progress` (`byBlanks`).

## e2e

`e2e/curriculum-verify.ts` drives the controls in the real app: it opens the
Path card, switches Blanks to All / One / Half and checks the next round asks
what each promises (All gives only chords not practised; One asks one box;
Half asks the second half), checks a saved round carries its blanks, cycles
vi's chip Off → Practise → Hear only → Off (its answer button comes and goes),
and clicks the vi · One cell (vi practised alone, the home chords heard, one
button). It puts the selection back before the verdict prints, crash included;
the rounds it plays stay in the history. It skips the cell step when the
learner is not in major keys alone, since a cell would change the key modes.

A round nothing was typed into reads exactly like the next one, so after
"next song" it waits for a different (song, boxes) pair, not just a heading.

<!-- AUTOGENERATED:BEGIN — do not edit; regenerated by `./singularity build` -->

## Plugin reference

- Description: The curriculum's browser half: useCurriculum (the live chord.curriculum selection — each chord practised, heard or off, the blanks, the key modes), useCurriculumWrites (its four writes, refusals as toasts), <PathCard> — the folded card holding every practice control: the chord chips, the blanks, where the path goes next, and each chapter's map — and <PathProgress>, the step bar of the chapter in hand. The Chord trainer's curriculum, server side: the chord_curriculum row (each chord practised, heard or off; how much of a loop is blank; the key modes), the live chord.curriculum resource, and the four writes — one chord, a whole chapter, the blanks, or a cell of the path.
- Server:
  - Contributes: `resource.declare` "chord.curriculum"
  - Uses:
    - `database.db`
    - `database/derived-updated-at.deriveUpdatedAt`
    - `database/sql-column.parsedJson`
    - `database/sql-column.parsedText`
    - `infra/endpoints.HttpError`
    - `infra/endpoints.implement`
  - DB schema: `plugins/apps/plugins/chord/plugins/curriculum/server/internal/tables.ts`
  - Resources: `chord.curriculum` (invalidate)
  - Routes:
    - `POST /api/chord/curriculum/chord`
    - `POST /api/chord/curriculum/chapter`
    - `POST /api/chord/curriculum/blanks`
    - `POST /api/chord/curriculum/cell`
- Web:
  - Uses:
    - `apps/chord/vocabulary.ChordNumeral`
    - `apps/chord/vocabulary.chordToneStyle`
    - `infra/endpoints.getEndpointErrorMessage`
    - `infra/endpoints.useEndpointMutation`
    - `primitives/collapsible.Collapsible`
    - `primitives/collapsible.CollapsibleChevron`
    - `primitives/collapsible.CollapsibleContent`
    - `primitives/collapsible.CollapsibleTrigger`
    - `primitives/css/center.Center`
    - `primitives/css/coords.pct`
    - `primitives/css/coords.placedClasses`
    - `primitives/css/coords.placedStyle`
    - `primitives/css/fill.Fill`
    - `primitives/css/grid.Grid`
    - `primitives/css/line.Line`
    - `primitives/css/rigid.rigidClass`
    - `primitives/css/spacing.selfClass`
    - `primitives/css/spacing.Stack`
    - `primitives/css/text.Text`
    - `primitives/css/toggle-chip.SegmentedControl`
    - `primitives/css/ui-kit.Button`
    - `primitives/css/ui-kit.cn`
    - `primitives/css/ui-kit.ControlSizeProvider`
    - `primitives/live-state.ResourceResult`
    - `primitives/live-state.useResource`
    - `primitives/overlay/popover.InlinePopover`
    - `shell/toast.showToast`
  - Exports (types):
    - `CurriculumWrites`
    - `StandingLookup`
  - Exports (values):
    - `BlanksGlyph`
    - `PathCard`
    - `PathProgress`
    - `useCurriculum`
    - `useCurriculumWrites`
- Core:
  - Uses:
    - `apps/chord/song-index.ChordToken`
    - `apps/chord/song-index.chordTokenFromParts`
    - `apps/chord/song-index.ChordTokenParts`
    - `apps/chord/song-index.ChordTokenSchema`
    - `apps/chord/song-index.parseChordToken`
    - `infra/endpoints.defineEndpoint`
    - `integrations/hooktheory.HookpadMode`
    - `integrations/hooktheory.HookpadModeSchema`
    - `primitives/live-state.resourceDescriptor`
  - Exports (types):
    - `AskedBox`
    - `AskedOptions`
    - `Blanks`
    - `Cell`
    - `CellStanding`
    - `Chapter`
    - `ChordState`
    - `PathRow`
    - `SelectedChord`
    - `Selection`
    - `SelectionChange`
    - `Stage`
    - `StageId`
    - `TokenStanding`
  - Exports (values):
    - `ALL_CELLS`
    - `applyCellEndpoint`
    - `askedPositions`
    - `BLANKS`
    - `BLANKS_LABEL`
    - `BlanksSchema`
    - `canonicalSelection`
    - `cellName`
    - `cellOf`
    - `CellSchema`
    - `cellSelection`
    - `cellStanding`
    - `chapterById`
    - `CHAPTERS`
    - `CHORD_STATES`
    - `chordCurriculumResource`
    - `chordState`
    - `ChordStateSchema`
    - `firstSelection`
    - `nextCell`
    - `onRoute`
    - `PATH_TOKENS`
    - `pathOrder`
    - `playableChords`
    - `practisedChords`
    - `ROUTE`
    - `routeOf`
    - `sameCell`
    - `sameSelection`
    - `SelectedChordSchema`
    - `SelectionSchema`
    - `setBlanksEndpoint`
    - `setChapterStateEndpoint`
    - `setChordStateEndpoint`
    - `STAGE_IDS`
    - `stageById`
    - `StageIdSchema`
    - `stageOf`
    - `STAGES`
    - `withBlanks`
    - `withChapterState`
    - `withChordState`
- Cross-plugin:
  - Imported by:
    - `apps/chord/progress`
    - `apps/chord/trainer`

<!-- AUTOGENERATED:END -->
