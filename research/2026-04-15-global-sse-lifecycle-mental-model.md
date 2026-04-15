# Unified SSE — Lifecycle & Mental Model

## Context

After unifying SSE under a single multiplexed `/api/events` endpoint
(commit `58a0b95`), users observe bugs like *"a conversation is still
active on the server but its row in the list is greyed-out"* and
*"status updates only arrive after a big delay."*

Before we can fix those symptoms, we need a shared mental model of what
the system is *supposed* to do, step by step — without assuming the
reader knows what SSE is. This doc is an explainer, not a change
proposal. It defines terms, walks the lifecycle, and then names the
hazards the current design creates so future fix-plans can target them
precisely.

---

## Part 1 — Primer: what is SSE, and why does it shape the design?

### SSE in one paragraph

**Server-Sent Events (SSE)** is a plain HTTP/1.1 response with
`Content-Type: text/event-stream` that the server *never closes*. The
server keeps writing framed text messages of the form:

```
event: <name>
data: <payload>

```

…and the browser parses each block and fires a DOM event. It is
one-way: server → client. The browser API is the `EventSource`
constructor:

```js
const es = new EventSource("/api/events?urls=...");
es.addEventListener("foo", (e) => { /* e.data is a string */ });
```

### The three hard constraints SSE imposes

1. **The URL is frozen at construction.** You cannot tell an existing
   `EventSource` "also subscribe me to /bar". To change the set of
   streams you close and reopen, which means a new TCP connection and
   a new server-side subscription.

2. **Browsers cap connections per origin.** Chrome allows ~6 concurrent
   HTTP/1.1 connections per origin. One EventSource per feature would
   starve normal `fetch()`s. This is the single biggest reason to
   multiplex.

3. **The server controls flush timing.** SSE frames are just bytes in
   an HTTP body. Any intermediary (Bun runtime, our Go gateway, a
   reverse proxy) may buffer until flushed. A stream that emits no
   bytes for 30–60s will also be killed by idle-timeouts somewhere in
   the chain. That is why every SSE server emits a **heartbeat** — an
   otherwise-meaningless comment frame (`: ping\n\n`) on a timer just
   to keep the pipe warm.

Everything quirky about our architecture is a reaction to one of these
three constraints.

---

## Part 2 — Anatomy of our pipeline

There are four layers; each has one job.

```
┌─────────────────────────────────────────────────────────┐
│ Plugin server code (e.g. conversations poller)          │
│ calls broadcast(event) → all subscribers receive it     │
└───────────────────────▲─────────────────────────────────┘
                        │
┌───────────────────────┴─────────────────────────────────┐
│ Core /api/events handler (server/src/index.ts)          │
│ Owns one real HTTP SSE response per connected client.   │
│ Iterates ?urls=…, calls each plugin's subscribe(send),  │
│ wraps each emission as  event:<virtualUrl>\ndata:…      │
│ Heartbeats every 20s. Cleans up all subs on disconnect. │
└───────────────────────▲─────────────────────────────────┘
                        │  one EventSource per leader tab
┌───────────────────────┴─────────────────────────────────┐
│ Multiplex (plugin-core/reconnecting-event-source.ts)    │
│ Process-wide singleton. Elected "leader" of the tab via │
│ a Web Lock. Maintains a Set<url>. Whenever the set      │
│ changes it tears down + reopens its single real         │
│ EventSource with the new ?urls= query. Demuxes frames   │
│ by SSE event name back to Coordinators.                 │
└───────────────────────▲─────────────────────────────────┘
                        │
┌───────────────────────┴─────────────────────────────────┐
│ Coordinator (one per virtual URL)                       │
│ Tab-local: fans out to all ReconnectingEventSource subs │
│ in this tab.                                            │
│ Cross-tab: mirrors frames to follower tabs through a    │
│ BroadcastChannel keyed on the URL, so only one tab      │
│ holds a real network connection.                        │
└───────────────────────▲─────────────────────────────────┘
                        │
┌───────────────────────┴─────────────────────────────────┐
│ Feature clients                                         │
│ e.g. ConversationStreamClient (a second layer of        │
│ leader-election + BroadcastChannel fan-out scoped to    │
│ conversations) and React components that hold local     │
│ state derived from the stream.                          │
└─────────────────────────────────────────────────────────┘
```

### Why leader-election?

Two tabs pointed at the same app should *not* each open their own
`EventSource` — the server would fan out the same events twice, and
with 3+ tabs you hit the per-origin connection cap. So tabs agree, via
a single exclusive Web Lock (`singularity:sse:multiplex`), on one
leader. Follower tabs listen to a `BroadcastChannel` keyed per URL
(`sse:<url>`) and receive every frame the leader demuxes. If the
leader tab closes, the Web Lock is released and another tab is
promoted automatically.

There is a **second, independent** layer of leader-election inside
`plugins/conversations/web/stream/client.ts`
(`singularity:conversations:stream`). That one exists so only one tab
maintains the conversations-stream consumer state and snapshot; it is
orthogonal to the transport-level election above. Two layers of
leader election is unusual and worth keeping in mind when reasoning
about bugs.

### Why "virtual URLs" at all?

Because we multiplex, the real wire URL is always
`/api/events?urls=…`. But application code still wants to say *"give
me the conversations stream"*. So virtual URLs (`/api/conversations/stream`)
are used as:

- the **subscription key** the client passes in `?urls=`;
- the **SSE `event:` name** the server writes, so the client can
  demux;
- the **BroadcastChannel name** (`sse:<url>`) so follower tabs can
  tell frames apart.

Nothing ever issues an actual HTTP request at the virtual URL.

---

## Part 3 — Lifecycle walkthroughs

### 3.1 First load, single tab

1. React mounts the `ConversationList`. It calls
   `useConversationStream(...)`, which lazily constructs the singleton
   `ConversationStreamClient`.
2. `ConversationStreamClient` requests `singularity:conversations:stream`
   (granted, because no one else holds it) → `becomeLeader()` →
   `openSse()` → `new ReconnectingEventSource({ url: "/api/conversations/stream" })`.
3. The transport-layer `Multiplex` is lazily constructed on first
   `getMultiplex()` call. It requests
   `singularity:sse:multiplex` (granted) → `becomeLeader()` →
   `connect()`.
4. `connect()` builds `?urls=%2Fapi%2Fconversations%2Fstream`,
   constructs the real `EventSource`, registers an
   `addEventListener("/api/conversations/stream", …)`.
5. Server `/api/events` handler splits `?urls=`, resolves each to a
   plugin `SseHandler`, calls `subscribe(send)`. For conversations,
   `subscribe` pushes `send` into a module-local `subscribers` set and
   replays `getSnapshot()` — a `{type: "working", id, working}` for
   every conversation the poller currently thinks is working.
6. Those frames arrive on the wire as
   `event: /api/conversations/stream\ndata: {…}\n\n`, the
   addEventListener fires, the Multiplex routes to the Coordinator,
   which calls `_onMessage` on the `ReconnectingEventSource` instance,
   which calls `ConversationStreamClient.applyEvent` → `fanOut` → the
   React component `setLive(...)`.
7. `EventSource.onopen` fires → `broadcastStatus("open")` runs, which
   publishes to the `wsStatusBus`.

### 3.2 Poller detects a change

1. `plugins/conversations/server/internal/poller.ts` ticks every 1s.
2. When an entry's `working` differs from the previous snapshot, it
   calls `broadcast({type: "working", id, working})`.
3. `broadcast` iterates the module-local `subscribers` set and invokes
   each `send`. `send` is the closure created inside `handleEvents`
   that encodes `event: <url>\ndata: …\n\n` and `enqueue`s it on the
   stream controller.
4. The frame travels the same path as step 6 above.

### 3.3 A second pane mounts — the tricky one

User opens a conversation pane. Its `code` sub-plugin calls
`new ReconnectingEventSource({ url: "/api/conversations/:id/edited-files/stream" })`.

1. A new `Coordinator` is created for the edited-files URL.
2. `getMultiplex().addUrl(editedFilesUrl)` adds it to the Set and
   schedules a microtask `reopen()`.
3. Because an `EventSource`'s URL is immutable, `reopen()` closes the
   existing `EventSource` *(covering `/api/conversations/stream`)* and
   constructs a new one carrying *both* URLs in `?urls=`.
4. Server teardown runs: the old response's `cancel()` fires →
   `cleanup()` calls every unsubscribe → conversations' subscribe-returned
   teardown removes the `send` from `subscribers`.
5. Server sets up the new connection: iterates `virtualUrls`,
   re-subscribes conversations *and* edited-files.
6. Conversations' subscribe replays `getSnapshot()` again.

Between 3 and 5 there is a **connection gap**. Anything the poller
broadcasts during that microsecond-to-millisecond window goes to zero
subscribers — the old one is gone, the new one hasn't arrived.

### 3.4 Server restarts

1. Server closes → TCP FIN → browser `EventSource.onerror` fires.
2. `Multiplex.es.onerror` closes the ES and schedules a retry with
   exponential backoff (`[500, 1000, 2000, 5000]`), incrementing
   `attempt`.
3. Next `connect()` runs with `attempt > 0`, so its status broadcast
   is `"reconnecting"` — this is the status the "refresh on reconnect"
   watcher in `conversation-list.tsx` is designed around.
4. Health plugin's `ReconnectWatcher` also detects restart via
   `/api/health` version change and toasts.
5. When the server accepts again, `es.onopen` fires →
   `broadcastStatus("open")` → watcher sees
   `reconnecting → open` and calls `refresh()`.

### 3.5 Tab-switch / BFCache

Switching tabs does not tear down anything (EventSource is not paused
by visibility). BFCache eviction (e.g. navigating back/forward) *does*
close the tab's JS context, releases the Web Lock, and promotes
another tab to leader. The new leader opens its own real EventSource;
everything else is business as usual.

---

## Part 4 — Why re-subscribes need "reset" semantics

The conversations stream has **level-triggered state** (who is
currently working) but transmits **edge-triggered events** (changes).
That is a classic distributed-systems mismatch and the source of most
of the hazards below.

- `subscribe()` replays *a snapshot of currently-working entries*.
- The poller broadcasts "working" only on transition and "gone" only
  when an entry leaves the snapshot.

What the consumer really wants after each (re)subscribe is: *"forget
what you thought you knew; here is the authoritative set."* But we
don't send that marker. The server emits N "working" events and goes
silent about everything else. If the client was holding state for an
id that is *no longer* in the new snapshot, it has no way to know the
id should be dropped. Symmetrically, if its state is *missing* an id
(e.g. because a "working" event was lost during a gap), only the next
transition will repair it — and transitions happen rarely.

The leader client does clear its own `liveCache` on `"open"`, but only
for the *leader*'s benefit: cross-tab followers get a `"reset"` fan-out,
but **no React component ever receives a reset signal**. The React
`live` map keeps whatever it had.

---

## Part 5 — Hazards the current design creates

The reported symptom — *"a conversation is still working on the server
but the list shows it as inactive / grey"* — can originate from any of
the following, and very likely from a combination:

### H1 — Events lost in the reopen gap (§3.3)

Every new `addUrl`/`removeUrl` — including any mount/unmount churn of
a pane that uses SSE — tears down the single shared EventSource and
opens a new one. A `broadcast(...)` that fires during the gap reaches
zero subscribers. Because the poller only re-emits on *change*, the
next event for that id may not arrive for seconds or minutes. Until
then the UI is stale.

This especially bites "working" transitions: the conversation went
`working=true → working=false → working=true` while you were
reopening; the net truth is `true`, but the client only saw `true`
once on the initial snapshot (which was already showing `true`), so
its view doesn't diverge until the *next* transition.

### H2 — Local React state is not reset on reconnect

`ConversationList.live` is a React `useState<Record<id, RuntimeLive>>`.
Nothing ever clears it. On every (re)subscribe the server replays the
working snapshot, which *adds* entries — but cannot *remove* entries
that have since fallen out of the snapshot. The UI can drift toward
"everything ever seen was working" (stale active) or "missed a
transition" (stale inactive) depending on timing.

### H3 — The refresh watcher is keyed on `"reconnecting" → "open"` only

`conversation-list.tsx:110-120` only marks `wasReconnecting = true`
when it observes status `"reconnecting"`. But URL-set-change reopens
go through `connect()` with `attempt === 0`, which broadcasts
`"connecting"`, not `"reconnecting"` (see `reconnecting-event-source.ts`
`const phase = this.attempt === 0 ? "connecting" : "reconnecting"`).
So the most common form of reopen — opening a new pane — never
triggers the `refresh()` that would repair DB-backed fields (status,
title). Only true network/server failures do.

### H4 — Coalesced reopens hide the "churn" to debuggers but not to data

`scheduleReopen` uses `queueMicrotask` to coalesce bursts of
add/remove into one reopen per tick. That collapses three reconnects
(StrictMode mount→unmount→mount) into zero, which is good for dev
sanity — but when the churn is *real* (a user opens three panes in
quick succession in prod) the single coalesced reopen still has the
full gap described in H1.

### H5 — Heartbeat silence under the gateway

The core emits `: ping\n\n` every 20s. The Go gateway and any future
proxies must forward it with minimal buffering; otherwise clients may
see long silent periods during which they wrongly believe the
connection is healthy. If the stream is *actually* dead but no frame
has been attempted, neither the server nor the client notices until
the next heartbeat or the next broadcast. A user-reported "big delay"
can look like this: the events existed but sat in a buffer until
something flushed it.

### H6 — Two overlapping leader elections

The transport Multiplex and `ConversationStreamClient` each hold their
own Web Lock and their own BroadcastChannel with partially-overlapping
responsibilities (both can fan conversations events across tabs). A
future bug here would be easy to miss because the system would still
mostly work — one of the two fan-outs would deliver the message even
if the other failed. Worth keeping in mind when debugging.

### H7 — `getSnapshot()` is a "working-only" view

The server's replay only emits `working` frames. It does not emit
`title`, `status`, or `gone`. So a client that has stale `status` on a
conversation (say, `"working"` from a past session, but the server now
has `"gone"`) will only be corrected by the next *transition* the
poller catches — which may never happen for a long-dead id. This is
the DB-side cousin of H2.

---

## Part 6 — Invariants we should be able to state (but currently can't)

A clean mental model of this subsystem should let us answer yes/no to
each of the following. Today the answer is "not really":

1. *After any (re)subscribe, will the client eventually converge to
   the server's current truth without requiring a user action?*
   — No. H1, H2, H7.

2. *Does adding or removing a feature-level subscription only affect
   the stream for that feature?*
   — No. Adding any URL reopens the shared EventSource, affecting
   every feature using SSE.

3. *Is there a single "the stream reconnected, please reconcile"
   signal a feature can subscribe to?*
   — No. There are status events, but they conflate "first connect"
   with "URL-set-change reconnect" with "network-failure reconnect",
   and feature code has to guess which one it saw.

These three questions are the likely north star for the next design
pass; this doc stops at naming them.

---

## Critical files (for future fix plans)

- `server/src/index.ts` — the `/api/events` multiplex handler.
- `server/src/types.ts` — `SseHandler<T>` shape.
- `plugin-core/reconnecting-event-source.ts` — `Multiplex`, `Coordinator`,
  status broadcasting, the `attempt === 0 → "connecting"` choice.
- `plugins/conversations/server/internal/sse.ts` — subscribers set,
  snapshot replay on subscribe.
- `plugins/conversations/server/internal/poller.ts` — change-only
  broadcast semantics.
- `plugins/conversations/web/stream/client.ts` — second leader election,
  liveCache reset on `"open"`, cross-tab fan-out.
- `plugins/conversations/plugins/conversations-view/web/components/conversation-list.tsx`
  — React `live` state, `wasReconnecting` watcher.

## Verification

This is an explainer doc; "verification" means reading it should let a
newcomer predict, for each of the reported symptoms, which hazard it
most likely stems from. A suggested exercise:

> *"A user opens a second pane. The conversation in the list is
> active on the server but shows grey for 30 seconds, then snaps back
> to active."* — Which hazards are consistent with this? (Expected
> answer: H1 + H2 as root causes; H3 explains why no refresh repaired
> it; the "snap back" is the next poller transition.)
