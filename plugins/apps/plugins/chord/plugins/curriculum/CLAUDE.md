# curriculum

The ladder the learner climbs: which chords and key modes they hear, how much
of a loop they name, and which step comes next. Design:
`research/2026-09-19-apps-chord-trainer-curriculum.md`.

## The model

Two axes, one ladder.

- **What you may hear** — the unlocked chord tokens and key modes. They are
  what `find` draws loops from, so a loop holding a chord you have not unlocked
  never plays.
- **How much you name** — the _ask rule_. The boxes it does not pick are
  **given**: they already show their chord, so a round asks for one notion at a
  time instead of four chords in a row.

A **step** moves one axis. A **level** is how many steps you have taken, plus
one — level 1 is `FIRST_LEVEL`, a constant, so there is never a row for it.

| Level | Step                         | What the round asks                                |
| ----- | ---------------------------- | -------------------------------------------------- |
| 1     | I, IV, V, major keys         | only the boxes of the chord being practised        |
| 2     | ask rule → `half`            | every box in the loop's second half (the cadence)  |
| 3     | ask rule → `all`             | every box                                          |
| 4…    | one chord, or a stage's seed | every box — except while the new chord is settling |

**A NEW chord is asked alone**, until it has `FRESH_ANSWERS` (10) answers, so
every new notion arrives isolated and widens out on its own.

New means "arrived after the learner widened out", not "not practised much":
the chord's unlock level must be **above** `askRuleLevel`, the level the current
rung was set at. Both are steps on one ladder, so they are compared as levels.
Why it matters, and why a bare freshness test is wrong: at level 1 no chord has
any answers, so a freshness test isolated every one of them — the learner paid
for the cadence at level 2 and the whole loop at level 3 and the round still
asked for a single chord until each starting chord had ten answers. An
under-practised old chord needs no isolation; being picked as the target is
already what looks after it.

```ts
askedPositions(boxes, { windowBeats, askRule, target,
                        targetLevel, askRuleLevel, targetAnswers }) → number[]
// "target", or an isolated target → the boxes whose chord is the target
// "half"                         → boxes starting at or after the window's midpoint
// "all"                          → every box
// never empty: a rule that picks nothing falls back to the round's last box
```

## Stages

A **stage** is a family of chords: what it opens (a seed, and key modes), and
which chords belong to it once open. Membership is a predicate over the token's
parts, and the **first stage of `STAGES` that holds a chord owns it** — so a
chord nobody listed still lands in exactly one pool, and a chord in no pool is
never offered.

| Stage                                        | Opens     | Seed         | Pool                                                                                 |
| -------------------------------------------- | --------- | ------------ | ------------------------------------------------------------------------------------ |
| `major-triads`                               | major     | I, IV, V     | root-position triads the major scale builds (ii, iii, vi, vii°)                      |
| `minor-keys`                                 | minor     | i, ♭VII, ♭VI | the other natural-minor triads (ii°, ♭III, iv, v)                                    |
| `sevenths`                                   | —         | —            | root-position sevenths either scale builds (V7, ii7, vi7, Imaj7, viiø7)              |
| `inversions`                                 | —         | —            | any inversion **whose root-position twin is already unlocked**                       |
| `secondary`                                  | —         | —            | a major triad or dominant seventh on a degree that does not have one (V/V, V/vi, I7) |
| `colour`                                     | —         | —            | anything else in root position: sus, sixths, added notes                             |
| `mixolydian`, `dorian`, `lydian`, `phrygian` | that mode | —            | — (the chords are known; the step opens the mode)                                    |

The scale sets are derived, not listed: `diatonicShapes` stacks thirds on each
degree of the major and natural-minor scales, so "the seventh on ♭VII" is
computed rather than typed out.

Two consequences worth knowing:

- **An inversion waits for its twin.** V⁶ belongs to no pool until V is
  unlocked, so it never ranks — no special case needed.
- **The modal stages hold no chord.** They open a key mode, and the chords heard
  in it are ones the learner already knows. `locrian`, `harmonicMinor` and
  `phrygianDominant` have no stage: nothing opens them today.

## Which step comes next

`chooseNextStep` is **pure over supplied counts** — no database, no HTTP — so
the whole ordering can be checked in a unit test. `server/internal/next.ts`
gathers the numbers; this decides. In order:

1. **The ask ladder first.** While the round does not yet ask for the whole
   loop, the next step is the next rung. No new chord arrives until the learner
   names what they already hear.
2. **Finish the stage in hand** — the stage the last chord step came from —
   while its best pool chord is worth at least `minStepWindows` **and** at
   least a fifth of the best step available anywhere (`STAGE_HOLD_SHARE`). One
   notion is finished before the next starts, but a family's rare leftovers
   never hold up a much bigger one: vii° opens a few dozen loops where minor
   keys open thousands, so it waits and comes back once the families ahead of
   it have run down.
3. **Otherwise the best step anywhere**: each open stage's best pool chord, and
   each unopened stage's seed. Ties go to the earlier stage, then the earlier
   token, so the same counts always give the same answer.

Nothing above the bar is `done`.

**The bar is a share of the index, not a count.** `minStepWindows` is one
window in 10,000, and at least 5. A worktree loads a 5 % sample of the songs,
so a fixed count would stall there where main's full index flows.

Measured on a 5 % sample, the ladder after I, IV, V runs **vi, ii, iii**, then
the **minor-keys seed** — minor keys are 44 % of the sample's windows, so they
arrive long before sevenths or inversions. That ordering comes from the songs,
not from anyone's taste, which is the point of ranking by window count.

## Server surface

```ts
chord.curriculum; // live: { level, askRule, askRuleLevel, modes, unlocked[], stage }
POST / api / chord / curriculum / next; // → not-ready | step | done
POST / api / chord / curriculum / unlock; // { expected: NextStep } → { level }
POST / api / chord / curriculum / undo; //                        → { level }
```

- **`next` is an endpoint, not a live resource.** Working the step out scans the
  loop windows once for the candidate chords, plus one count per unopened stage.
  A resource over those tables would recompute it on every row an index load
  writes.
- **`next` answers `not-ready` whenever the index is not loaded**, never `done`
  — with no windows to count, "nothing is worth unlocking" and "I cannot tell
  yet" are the same answer, and only one of them is true.
- **`unlock` takes the step the learner was shown.** The server works the next
  step out again and refuses with a 409 when it differs: the index may have
  grown, or another tab may have stepped first. A client never invents a step.
- **`undo`** drops the last row, so a mis-click costs nothing. At level 1 it
  refuses — there is no step to take back.

The counts come from the song index's server barrel directly
(`countLoopsByNextChord`, `countLoopsInSet`). HTTP between two server plugins
would be the wrong seam.

## web

Four hooks and two components. Nothing here decides anything — the ladder is
worked out on the server; this is how a screen reads it and moves it.

```ts
useCurriculum()  → ResourceResult<Curriculum>   // live: pending until the first value
useNextStep()    → { read, refetch }            // loading | error | answer
useUnlockStep()  → { unlock(step), pending }
useUndoStep()    → { run, pending }
stepReadiness(unlocked, progress) → "unknown" | "early" | "ready"
```

- **A pending curriculum is a loading state, never an empty palette.** The
  trainer shows its skeleton until the standing lands: drawing three chord
  buttons that are about to become four is a claim about what this learner has.
- **The next step is re-read by the writes themselves**, on success and on
  failure alike, so a surface cannot forget to and go on offering a step that
  has already been taken. It is not asked for on a timer or on focus — only
  after a write.
- **A refused unlock is a toast**, never a silent nothing: "The next step has
  changed" with the server's sentence under it (the index grew, or another tab
  stepped first), and the step is read again straight away.

**Readiness has three answers, not two.** `stepReadiness` returns `unknown`
while the learner's progress has not landed — not a quiet "no". A control
reading "Add anyway" during the load tells this learner they are behind and
then takes it back, which is the wrong-state-while-loading bug the repo bans
(`live-state/no-pending-data-collapse`). Both components render `unknown` as
their own waiting form.

The two places the locked step shows:

- **`<NextStepPad step level readiness adding onAdd/>`** — the ghost chord
  button at the end of the grid: the numeral greyed, a padlock and "Level N",
  or the numeral bright and **Add it** once every unlocked chord is mastered.
  **Chords only** — a key-mode or ask-rule step has no numeral, so it draws
  nothing and shows in the row instead. Accessible name: `Next step`.
- **`<NextStepRow step level readiness adding onAdd/>`** — the row at the foot
  of "Your chords", which draws **every** kind of step: a chord by its numeral,
  a key mode by the stage's name, an ask-rule step as "Name the cadence" /
  "Name the whole loop".

Both are live once the readiness is known. Mastered everything: the button
reads **Add** and is the prominent one; not yet: **Add anyway** — going faster
than the trainer suggests is the learner's call, not a mistake. The accessible
name stays `Add` either way, so it is one control however it reads.

## `chord_unlocks`

```
position integer primary key   -- the level it reached: 2, 3, 4…
step     jsonb not null        -- the NextStep, decoded on every read and write
unlocked_at timestamptz not null
```

**The step is stored, not a stage index**, so a later edit to the stage list
cannot rewrite what someone already unlocked. The standing is read back from the
rows by `curriculumFromSteps`, which is pure: level 1 plus what each step added,
a chord keeping the level it first arrived at.

The table is **kept** in worktree forks and in backups, and **stays in the
change feed** (which is what pushes `chord.curriculum`). It is the learner's own
history of decisions, and nothing can rebuild it. **No growth bound is
declared**: a row is written only when a person presses Add, so the table grows
at the speed of someone learning, and the retention monitor's silencing set must
only hold bounds that are real.

`position` is the primary key, so two tabs unlocking at once cannot both take
the same level — the second fails loudly instead of quietly writing a second
step at the same rung.

## e2e

`e2e/ladder-preview.ts` walks the ladder in memory and prints the order it
produces (above). It writes nothing.

`e2e/curriculum-verify.ts` plays the trainer and moves the ladder for real:
level 1 asks one chord and gives the rest (the saved round counts them as
`givenCount`); Add raises the level and the next round asks the loop's second
half, then every box; the chord step's ghost pad adds a fourth chord button and
a round asks only the fresh chord's boxes; Undo puts it back. It starts from
level 1, and undoes every step it takes before the verdict prints, crash
included — the rounds it played cannot be undone, so it prints what it left.

Two traps it had to solve, for whoever writes the next one:

- **The rungs are invisible on a new learner**: a fresh chord is asked alone
  whatever the rung says, so the script first plays rounds until every chord is
  past `FRESH_ANSWERS` (bounded by `--warmup-rounds`, a failure if unreached).
- **A round nothing was typed into reads exactly like the next one**, so
  waiting on the heading after "next song" reads the OLD round back — and then
  asserts about the rule it was built with. Wait for a different (song, boxes)
  pair.

<!-- AUTOGENERATED:BEGIN — do not edit; regenerated by `./singularity build` -->

## Plugin reference

- Description: The curriculum's browser half: useCurriculum (the live chord.curriculum standing), useNextStep (the step on offer, re-read after every write), useUnlockStep / useUndoStep (the two writes, whose conflicts surface as a toast), and the two places the locked next step shows — <NextStepPad>, the ghost chord button at the end of the grid, and <NextStepRow>, the panel row that draws every kind of step. The Chord trainer's curriculum: the chord_unlocks ladder the learner climbs, the live chord.curriculum standing (what they hear and how much of a loop they name), the next step ranked by how many real songs it opens, and the unlock / undo writes.
- Server:
  - Contributes: `resource.declare` "chord.curriculum"
  - Uses:
    - `apps/chord/song-index.countLoopsByNextChord`
    - `apps/chord/song-index.countLoopsInSet`
    - `apps/chord/song-index.loadIndexStatus`
    - `database.db`
    - `database/sql-column.parsedJson`
    - `infra/endpoints.HttpError`
    - `infra/endpoints.implement`
  - DB schema: `plugins/apps/plugins/chord/plugins/curriculum/server/internal/tables.ts`
  - Resources: `chord.curriculum` (invalidate)
  - Routes:
    - `POST /api/chord/curriculum/next`
    - `POST /api/chord/curriculum/unlock`
    - `POST /api/chord/curriculum/undo`
- Web:
  - Uses:
    - `apps/chord/vocabulary.ChordNumeral`
    - `apps/chord/vocabulary.chordToneStyle`
    - `infra/endpoints.endpointQueryKey`
    - `infra/endpoints.getEndpointErrorMessage`
    - `infra/endpoints.useEndpoint`
    - `infra/endpoints.useEndpointMutation`
    - `primitives/css/center.Center`
    - `primitives/css/fill.Fill`
    - `primitives/css/line.Line`
    - `primitives/css/rigid.rigidClass`
    - `primitives/css/spacing.Stack`
    - `primitives/css/text.Text`
    - `primitives/css/ui-kit.Button`
    - `primitives/css/ui-kit.cn`
    - `primitives/css/ui-kit.ControlSizeProvider`
    - `primitives/live-state.ResourceResult`
    - `primitives/live-state.useResource`
    - `shell/toast.showToast`
  - Exports (types):
    - `NextStepRead`
    - `StepReadiness`
    - `StepWrite`
  - Exports (values):
    - `NextStepPad`
    - `NextStepRow`
    - `stepReadiness`
    - `useCurriculum`
    - `useNextStep`
    - `useUndoStep`
    - `useUnlockStep`
- Core:
  - Uses:
    - `apps/chord/song-index.ChordToken`
    - `apps/chord/song-index.chordTokenFromParts`
    - `apps/chord/song-index.ChordTokenParts`
    - `apps/chord/song-index.ChordTokenSchema`
    - `apps/chord/song-index.IndexStatusSchema`
    - `apps/chord/song-index.parseChordToken`
    - `infra/endpoints.defineEndpoint`
    - `integrations/hooktheory.HookpadModeSchema`
    - `primitives/live-state.resourceDescriptor`
  - Exports (types):
    - `AskedBox`
    - `AskedOptions`
    - `AskRule`
    - `ChordCandidate`
    - `Curriculum`
    - `CurriculumLevel`
    - `FirstLevel`
    - `LadderCounts`
    - `LadderState`
    - `NextStep`
    - `NextStepAnswer`
    - `NextStepChoice`
    - `Stage`
    - `StageEntry`
    - `StageId`
    - `UnlockedChord`
    - `UnlockStepBody`
  - Exports (values):
    - `ASK_RULES`
    - `askedPositions`
    - `AskRuleSchema`
    - `askRuleStep`
    - `chooseNextStep`
    - `chordCurriculumResource`
    - `curriculumFromSteps`
    - `CurriculumSchema`
    - `FIRST_LEVEL`
    - `firstCurriculum`
    - `FRESH_ANSWERS`
    - `minStepWindows`
    - `nextAskRule`
    - `nextCurriculumStepEndpoint`
    - `NextStepAnswerSchema`
    - `NextStepSchema`
    - `sameStep`
    - `STAGE_HOLD_SHARE`
    - `STAGE_IDS`
    - `stageById`
    - `StageIdSchema`
    - `stageIsOpen`
    - `stageOf`
    - `stageOrder`
    - `STAGES`
    - `targetIsIsolated`
    - `undoCurriculumStepEndpoint`
    - `unlockCurriculumStepEndpoint`
    - `UnlockedChordSchema`
    - `UnlockStepBodySchema`
    - `unopenedStages`
- Cross-plugin:
  - Imported by: `apps/chord/trainer`

<!-- AUTOGENERATED:END -->
