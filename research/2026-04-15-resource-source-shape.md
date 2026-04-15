# Resource lifecycle: hooks vs. `source` iterable vs. `fs.watch`

## Context

While migrating `edited-files` to the live-state primitive
([v3](./2026-04-15-global-sse-lifecycle-mental-model-v3.md)), one
question surfaced that v3 didn't fully answer: **how does a resource
whose backing state has no push signal tell the primitive when to
re-publish?** `tasks` and `conversations` are mutation-triggered — the
code that changes state also calls `notify()`. `edited-files` is
filesystem-backed — the server doesn't cause the change and has no
callback.

This doc captures the design space we walked through and what we'd
pick.

## The problem, precisely

Two orthogonal sub-problems, which I kept conflating:

1. **Lifecycle gating.** When should the server start/stop detecting
   changes for a given `(key, params)`? Always? Per subscriber? Once
   per worktree while someone observes?
2. **Detection mechanism.** *How* does the server notice that a
   worktree changed? Poll `git diff` on a timer? Watch the filesystem
   for events?

Every combination below mixes a choice from (1) with a choice from (2).

## Three shapes for (1) — lifecycle gating

### A. Always-on global poller (current for `conversations`)

```ts
// server boot
setInterval(tick, 1000);

async function tick() {
  const next = await collectLive();  // one tmux shell-out
  if (changed) conversationsResource.notify();
}
```

Works because the cost is O(1) per tick regardless of how many
conversations exist or how many clients watch. **Fails for
`edited-files`** because detection is per-worktree: O(conversations)
shell-outs per tick, even with nobody watching.

### B. Lifecycle hooks on `defineResource` (what landed this session)

```ts
defineResource({
  key: "edited-files",
  mode: "invalidate",
  loader: async ({id}) => getEditedFiles(...),
  onFirstSubscribe({id})   { rooms.set(id, {timer: setInterval(...), last: ""}); },
  onLastUnsubscribe({id})  { clearInterval(rooms.get(id)!.timer); rooms.delete(id); },
});
```

The primitive refcounts subscribers per `(key, params)` globally
across sockets and fires the hooks only on 0→1 and N→0 transitions. A
tab closing releases its refs; multiple tabs on one worktree share one
poller.

Correct, but the plugin author carries all the state (a `Map` of
rooms, timer handles, serialized-last-value for diffing) and has to
pair start/stop correctly by hand.

### C. `source` as async iterable

```ts
defineResource({
  key: "edited-files",
  source: async function* ({id}, signal) {
    while (!signal.aborted) {
      yield await getEditedFiles(worktreePathForSync(id));
      await sleep(1000, signal);
    }
  },
});
```

Same refcounting, different surface: on 0→1 the primitive creates an
`AbortController` and runs the generator; on N→0 it aborts. Each
`yield` is a new value; the primitive compares against the last cached
value and broadcasts on diff.

Wins over hooks:

- No module-level `Map<id, Room>` for timer/lastSerialized state —
  lives in the generator's closure.
- Start/stop can't mispair: abort is the only teardown path.
- Push and pull resources look the same shape
  (`yield initial; for await (const ev of changes) yield await load()`).
- Coalescing/diffing moves into the primitive (authors stop writing
  `if (serialize(x) !== last) notify()`).

Doesn't improve correctness — hooks already gate correctly. It's an
ergonomics + consistency win.

## Two choices for (2) — detection

### i. Polling (`setInterval` + `git diff`)

Cheap to implement, wrong cost curve per worktree (shell-out/sec even
when nothing changed). Fine while N is small.

### ii. `fs.watch` / chokidar

Kernel-delivered change events. Debounce + recompute only when files
moved. Removes the timer entirely. This is the real perf win and the
thing production-grade file-backed state usually uses.

## The axes are independent

You can pair any (1) with any (2):

```ts
// source + polling — generator-shaped, still shellouts
source: async function* ({id}, signal) {
  while (!signal.aborted) {
    yield await getEditedFiles(...);
    await sleep(1000, signal);
  }
}

// source + fs.watch — event-driven inside a generator
source: async function* ({id}, signal) {
  yield await getEditedFiles(...);
  for await (const _ of watchWorktree(id, signal)) {
    yield await getEditedFiles(...);
  }
}

// hooks + fs.watch — current primitive, better detection
onFirstSubscribe({id}) {
  watchers.set(id, chokidar.watch(...).on("all", debounce(() => {
    editedFilesResource.notify({id});
  })));
}
```

## Does `source` apply to every resource?

The shape is universal; the benefit is not.

- **`edited-files` (polling-backed)** — clear win. Generator replaces
  timer + `Map` + `lastSerialized`.
- **`conversations` (global poller)** — mild win. Poller body fits
  inside a generator: `while (!aborted) { yield await collectLive();
  await sleep(1000); }`. Same code, different container.
- **`tasks` (mutation-triggered)** — no win. Conversion forces an
  event channel (`EventEmitter`, promise queue) just so the generator
  has something to `await` between yields. Current `loader + notify()`
  from the POST/PATCH handlers is already two lines.

So `source` is opt-in: polling-backed resources benefit, mutation-
backed resources don't.

## Recommendation

Two independent calls:

1. **Detection: switch `edited-files` to `fs.watch` / chokidar.** This
   is the real perf win. Ballpark: ~30-line change inside the
   resource, no primitive churn. Do this regardless of whether we
   adopt `source`.

2. **API shape: add `source` alongside `loader + notify()`.** Coexist;
   migrate opt-in. Ballpark:
   - Primitive: ~60-line diff in `server/src/resources.ts` (add
     `source` field, spawn/abort generator on ref-count transitions,
     wire cached latest into sub-ack + GET fallback).
     Sub-ack waits for the first `yield` instead of calling `loader`
     (same latency as today).
   - Migrate `edited-files` (removes the lifecycle hooks landed this
     session).
   - Leave `conversations` and `tasks` on `loader + notify()` until
     a reason appears to move them.

If we only do one of these, do **#1**. The detection change pays for
itself immediately; the API shape is ergonomic polish.

## What the hooks gave us, and what replaces them

The `onFirstSubscribe` / `onLastUnsubscribe` hooks added this session
solved the "gate pollers on observer interest" problem and are what
makes `edited-files` not waste work. They come out entirely if we
adopt `source`, since the generator's lifecycle (create + abort)
subsumes them. If we *don't* adopt `source`, the hooks stay as they
are — they're not wrong, just lower-level than they could be.

## Open questions

- **Error policy inside `source`.** If the generator throws, do we
  broadcast an error, retry after backoff, or tear down and wait for
  a re-sub? Match existing `loader` policy (log + skip) initially.
- **Backpressure.** If a generator yields faster than we broadcast,
  drop intermediates (latest wins). Same rule as `notify()` coalescing.
- **HTTP GET fallback when a sub is live.** Return cached latest vs.
  run the loader fresh. Return cached — consistency with the WS is
  the point of the primitive.
