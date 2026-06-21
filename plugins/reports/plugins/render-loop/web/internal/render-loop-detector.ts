/**
 * Framework-free render-loop / DOM-rebuild-thrash detector — TWO tiers off one
 * global `MutationObserver` on `document.body`. The pathological element fires
 * continuous mutations — those callbacks ARE the push signal (no
 * `setInterval`/`setTimeout` loop; satisfies the no-polling rule).
 *
 * **Leaf tier** — each `MutationRecord` is attributed to a stable **culprit
 * signature** (DOM node + attr) with per-signature sliding-window rate counters.
 * Catches a CONCENTRATED loop on one node. A deduped `render-loop` report is
 * filed when ALL gates hold:
 *   1. Sustained — one signature stays above its class threshold for SUSTAINED_MS.
 *   2. Idle — no pointer/keyboard/scroll input within IDLE_MS.
 *   3. Visible — `document.visibilityState === "visible"`.
 *   4. Wasted-work — no-op/oscillating attribute writes (4a) or an identical
 *      childList rebuild whose tag+marker multisets match (4b).
 *
 * **Aggregate (subtree-cascade) tier** — sums mutations across a stable ancestor
 * (the `aggregateRoot`, preferring `pane:<paneId>`), keyed by leaf signature.
 * Catches a DIFFUSE cascade spread thin across MANY nodes where no single leaf
 * crosses threshold. Fires (`mutationClass: "subtree-cascade"`) on:
 *   1. Sustained — summed rate over its class threshold for SUSTAINED_MS (split
 *      AGG_REBUILD_PER_SEC vs AGG_ATTR_PER_SEC: a childList rebuild is ~2 records
 *      yet far costlier than an attr write, so a diffuse rebuild cascade at only
 *      ~8 records/s is a real loop while attr churn runs ~300/s).
 *   2/3. Idle + Visible (shared with the leaf tier).
 *   4. Breadth — ≥ AGG_MIN_LEAVES distinct leaves each re-touched
 *      ≥ AGG_MIN_LEAF_REPEAT× within the window (a real cascade re-touches the
 *      same nodes; this replaces the per-value no-op check and is what marks the
 *      idle whole-subtree reconciliation as wasted).
 * The two tiers are disjoint by construction (one hot leaf → breadth 1; a diffuse
 * cascade has no hot leaf) and carry distinct fingerprints if both ever fire.
 *
 * Firings AND near-misses (passed idle+sustained+visible but failed gate 4) are
 * mirrored to the `render-loop` clientLog channel for threshold tuning;
 * near-misses are logged only (no report) and throttled per signature/root. After
 * a signature/root fires once it's synchronously debounced for the session (so a
 * high-rate loop can't burst redundant reports before the async hash resolves).
 * Idle per-signature counters and per-root windows are GC'd.
 *
 * The detector writes no DOM of its own (a report is a network POST), so it can
 * never feed its own loop.
 */

import { clientLog } from "@plugins/primitives/plugins/log-channels/web";
import { report } from "@plugins/reports/web";
import { RENDER_LOOP, renderLoopFingerprint } from "../../core";
import type { RenderLoopPayload } from "../../core";
import { AggregateWindow } from "./aggregate-thrash";
import { culpritMeta, type CulpritMeta } from "./culprit-signature";

type MutationClass = RenderLoopPayload["mutationClass"];

const CHANNEL = "render-loop";

// `style` sub-properties that are animation-driven (overscroll-hint, transitions)
// and therefore legitimately high-frequency — excluded from gate 4a.
const ANIMATION_STYLE_HINTS = ["transform", "will-change", "transition"];

/** A marker-aware node-set shape seen at a point in time (gate 4b ring entry). */
interface ShapeStamp {
  shape: string;
  t: number;
}

/** One sliding-window rate counter + wasted-work evidence, per signature. */
interface SignatureState {
  meta: CulpritMeta;
  mutationClass: MutationClass;
  attrName: string | undefined;
  // Mutation timestamps (performance.now) within the current WINDOW_MS window.
  events: number[];
  // performance.now of the first event in the current above-threshold streak,
  // or null when the rate is currently below threshold.
  aboveSince: number | null;
  lastEventAt: number;
  // Ring of recent attribute values for oscillation detection (gate 4a).
  valueRing: string[];
  // Time-stamped rings of recent ADDED / REMOVED childList shapes (gate 4b).
  // React's reconciler tears down + remounts as TWO separate records on the same
  // parent (a removeChild then an insertBefore), so a rebuild is a shape that
  // appears in BOTH rings within WINDOW_MS — not necessarily within one record.
  addedShapes: ShapeStamp[];
  removedShapes: ShapeStamp[];
  // Whether the most recent qualifying mutation was "wasted work".
  wasted: boolean;
  // Sample of values/tags to attach to the report.
  sampleValues: Set<string>;
  tagMultiset: string[] | undefined;
  // Throttle for near-miss log lines (performance.now of the last one, or null).
  lastNearMissLogAt: number | null;
}

/** Per-aggregate-root cascade window + gating streak state (aggregate tier). */
interface AggregateState {
  root: string;
  window: AggregateWindow;
  // performance.now of the first event in the current above-AGG_PER_SEC streak,
  // or null when the summed rate is currently below threshold.
  aboveSince: number | null;
  // Throttle for near-miss log lines (performance.now of the last one, or null).
  lastNearMissLogAt: number | null;
}

export function installRenderLoopDetector(): () => void {
  const states = new Map<string, SignatureState>();
  // Per-aggregate-root cascade windows (the second tier).
  const aggregates = new Map<string, AggregateState>();
  // Synchronous once-per-loop debounce keys (signature|class|attr) already fired
  // this session. Checked/added in evaluate() before the async fire() so a
  // high-rate loop can't burst redundant reports on the detection frame.
  const firedGuards = new Set<string>();
  let lastInteractionAt = performance.now();

  function markInteraction(): void {
    lastInteractionAt = performance.now();
  }

  /** Skip mutations inside benign DOM-emitting chrome (incl. our own absence). */
  function isExcluded(node: Node): boolean {
    const el: Element | null =
      node instanceof Element ? node : node.parentElement;
    if (!el) return true;
    return (
      el.closest("[data-sonner-toaster]") != null ||
      el.closest("[data-sonner-toast]") != null ||
      el.closest("[data-element-picker]") != null
    );
  }

  /** True for animation-driven style writes that are legitimately fast (4a excl). */
  function isAnimationAttr(attrName: string | null, target: Node): boolean {
    if (attrName !== "style") return false;
    const style = (target as HTMLElement).getAttribute?.("style") ?? "";
    return ANIMATION_STYLE_HINTS.some((h) => style.includes(h));
  }

  /** Gate 4a: a no-op or oscillating attribute write. Returns the class or null. */
  function classifyAttr(
    state: SignatureState,
    record: MutationRecord,
  ): "noop-attr" | "oscillating-attr" | null {
    const target = record.target as Element;
    const attr = record.attributeName;
    if (!attr) return null;
    const current = target.getAttribute(attr) ?? "";
    // Pure no-op: the value didn't change at all.
    if (record.oldValue !== null && record.oldValue === current) {
      state.sampleValues.add(current);
      return "noop-attr";
    }
    // Oscillation: maintain a small ring of recent values; fire if a tiny set of
    // values is being cycled with at least one revisited (excludes monotonic
    // progress bars / timers, which never revisit a value).
    state.valueRing.push(current);
    if (state.valueRing.length > RENDER_LOOP.VALUE_RING) state.valueRing.shift();
    const counts = new Map<string, number>();
    for (const v of state.valueRing) counts.set(v, (counts.get(v) ?? 0) + 1);
    const distinct = counts.size;
    const maxRepeat = Math.max(...counts.values());
    if (
      state.valueRing.length >= RENDER_LOOP.MIN_VALUE_REPEAT &&
      distinct <= RENDER_LOOP.MAX_DISTINCT_VALUES &&
      maxRepeat >= RENDER_LOOP.MIN_VALUE_REPEAT
    ) {
      for (const v of state.valueRing) state.sampleValues.add(v);
      return "oscillating-attr";
    }
    return null;
  }

  /**
   * The stable shape of a node set for rebuild comparison: tagName plus the
   * composition markers (data-source / data-plugin-id / data-contribution-id),
   * which distinguish a real teardown→rebuild of the *same* source lines from a
   * list swapping one item for a *different* item.
   */
  function shapeOf(nodes: NodeList): string {
    const parts: string[] = [];
    for (const n of Array.from(nodes)) {
      if (!(n instanceof Element)) continue;
      const tag = n.tagName.toLowerCase();
      const src = n.getAttribute("data-source") ?? "";
      const pid = n.getAttribute("data-plugin-id") ?? "";
      const cid = n.getAttribute("data-contribution-id") ?? "";
      parts.push(`${tag}#${src}#${pid}#${cid}`);
    }
    return parts.sort().join(",");
  }

  /** Drop ring entries older than WINDOW_MS (sliding window). */
  function pruneShapes(ring: ShapeStamp[], now: number): void {
    while (ring.length > 0 && now - ring[0]!.t > RENDER_LOOP.WINDOW_MS) {
      ring.shift();
    }
  }

  /**
   * Gate 4b: the same parent repeatedly tears down + rebuilds an identical node
   * set. React's reconciler emits the teardown and the remount as TWO separate
   * childList records on the same parent target (removeChild then insertBefore),
   * which share one SignatureState. So we don't require one record to carry both
   * added and removed nodes (the same-record case is still handled — it just
   * pushes to both rings); we classify a rebuild when a non-empty shape appears
   * in BOTH the added and removed rings within WINDOW_MS, recurring ≥2 times.
   * The marker-aware `shapeOf` keeps a list swapping one <li> for a *different*
   * <li> from matching.
   */
  function classifyChildList(
    state: SignatureState,
    record: MutationRecord,
    now: number,
  ): "childlist-rebuild" | null {
    if (record.addedNodes.length > 0) {
      const shape = shapeOf(record.addedNodes);
      if (shape !== "") state.addedShapes.push({ shape, t: now });
    }
    if (record.removedNodes.length > 0) {
      const shape = shapeOf(record.removedNodes);
      if (shape !== "") state.removedShapes.push({ shape, t: now });
    }
    pruneShapes(state.addedShapes, now);
    pruneShapes(state.removedShapes, now);

    // A rebuild = a shape torn down AND rebuilt, repeatedly. Require the most
    // recent added shape to appear in BOTH rings, recurring ≥2 times overall, so
    // a one-time legitimate node swap (a single add + single remove) doesn't
    // match — only a shape that cycles teardown→rebuild within the window.
    const latest = state.addedShapes.at(-1);
    if (!latest) return null;
    const addedCount = state.addedShapes.filter((s) => s.shape === latest.shape).length;
    const removedCount = state.removedShapes.filter(
      (s) => s.shape === latest.shape,
    ).length;
    if (addedCount === 0 || removedCount === 0) return null;
    if (addedCount + removedCount >= 3) {
      state.tagMultiset = latest.shape
        .split(",")
        .map((part) => part.split("#")[0] ?? "")
        .filter((tag) => tag !== "");
      return "childlist-rebuild";
    }
    return null;
  }

  function stateFor(meta: CulpritMeta, attrName: string | undefined): SignatureState {
    const key = `${meta.signature}|${attrName ?? ""}`;
    let state = states.get(key);
    if (!state) {
      state = {
        meta,
        mutationClass: "childlist-rebuild",
        attrName,
        events: [],
        aboveSince: null,
        lastEventAt: 0,
        valueRing: [],
        addedShapes: [],
        removedShapes: [],
        wasted: false,
        sampleValues: new Set(),
        tagMultiset: undefined,
        lastNearMissLogAt: null,
      };
      states.set(key, state);
    }
    return state;
  }

  function aggStateFor(root: string): AggregateState {
    let agg = aggregates.get(root);
    if (!agg) {
      agg = {
        root,
        window: new AggregateWindow(
          RENDER_LOOP.WINDOW_MS,
          RENDER_LOOP.AGG_MAX_TRACKED_LEAVES,
        ),
        aboveSince: null,
        lastNearMissLogAt: null,
      };
      aggregates.set(root, agg);
    }
    return agg;
  }

  function ratePerSec(state: SignatureState, now: number): number {
    // Trim the sliding window, then the count IS the per-second rate (window=1s).
    let oldest = state.events[0];
    while (oldest !== undefined && now - oldest > RENDER_LOOP.WINDOW_MS) {
      state.events.shift();
      oldest = state.events[0];
    }
    return (state.events.length * 1000) / RENDER_LOOP.WINDOW_MS;
  }

  function thresholdFor(cls: MutationClass): number {
    return cls === "childlist-rebuild"
      ? RENDER_LOOP.REBUILD_PER_SEC
      : RENDER_LOOP.NOOP_ATTR_PER_SEC;
  }

  function evaluate(state: SignatureState, now: number): void {
    const rate = ratePerSec(state, now);
    const threshold = thresholdFor(state.mutationClass);

    // Gate 1: sustained above-threshold streak.
    if (rate >= threshold) {
      if (state.aboveSince === null) state.aboveSince = now;
    } else {
      state.aboveSince = null;
      return;
    }
    const sustainedMs = now - state.aboveSince;
    if (sustainedMs < RENDER_LOOP.SUSTAINED_MS) return;

    // Gate 2: idle.
    const msSinceInteraction = now - lastInteractionAt;
    if (msSinceInteraction < RENDER_LOOP.IDLE_MS) return;

    // Gate 3: visible.
    if (document.visibilityState !== "visible") return;

    const base = {
      signature: state.meta.signature,
      mutationClass: state.mutationClass,
      attrName: state.attrName,
      ratePerSec: Math.round(rate),
      sustainedMs: Math.round(sustainedMs),
      msSinceInteraction: Math.round(msSinceInteraction),
      visibilityState: document.visibilityState,
    };

    // Gate 4: wasted work. Near-misses (gates 1-3 passed, gate 4 failed) are
    // logged for tuning but never filed as a report — throttled to at most one
    // line per signature per NEAR_MISS_LOG_MS so a sustained non-wasted update
    // (tens/sec) can't flood the clientLog buffer.
    if (!state.wasted) {
      if (
        state.lastNearMissLogAt === null ||
        now - state.lastNearMissLogAt >= RENDER_LOOP.NEAR_MISS_LOG_MS
      ) {
        state.lastNearMissLogAt = now;
        clientLog(CHANNEL, JSON.stringify({ kind: "near-miss", ...base }));
      }
      return;
    }

    // Synchronous debounce: the fire path is async (sha256), so a high-rate loop
    // would otherwise pass many `void fire(...)` calls before the first hash
    // resolves and populates `fired`, bursting redundant POSTs. Guard on a
    // synchronous key (the same fields the fingerprint hashes) so exactly ONE
    // fire happens per loop per session; the hashed fingerprint inside fire() is
    // only used for the report payload / log line.
    const guard = `${base.signature}|${base.mutationClass}|${base.attrName ?? ""}`;
    if (firedGuards.has(guard)) return;
    firedGuards.add(guard);

    void fire(state, base);
  }

  async function fire(
    state: SignatureState,
    base: {
      signature: string;
      mutationClass: MutationClass;
      attrName: string | undefined;
      ratePerSec: number;
      sustainedMs: number;
      msSinceInteraction: number;
      visibilityState: string;
    },
  ): Promise<void> {
    const sampleValues =
      state.sampleValues.size > 0 ? Array.from(state.sampleValues) : undefined;
    const data: RenderLoopPayload = {
      signature: state.meta.signature,
      pluginId: state.meta.pluginId ?? null,
      slotId: state.meta.slotId ?? null,
      contributionId: state.meta.contributionId ?? null,
      source: state.meta.source ?? null,
      owner: state.meta.owner ?? null,
      paneId: state.meta.paneId ?? null,
      selector: state.meta.selector ?? null,
      mutationClass: state.mutationClass,
      attrName: state.attrName ?? null,
      ratePerSec: base.ratePerSec,
      sustainedMs: base.sustainedMs,
      sampleValues: sampleValues ?? null,
      tagMultiset: state.tagMultiset ?? null,
      visibilityState: base.visibilityState,
      msSinceInteraction: base.msSinceInteraction,
    };

    // The synchronous guard in evaluate() already ensured this is the only fire
    // for this loop. The hashed fingerprint is computed here purely for the
    // report payload / log line (same algorithm + inputs the server uses to
    // dedup, so the values line up).
    const fingerprint = await renderLoopFingerprint(data);

    const message = `Render loop: ${state.mutationClass} @ ${base.ratePerSec}/s — ${state.meta.signature}`;
    clientLog(CHANNEL, JSON.stringify({ kind: "fire", fingerprint, ...base }));

    void report({
      kind: "render-loop",
      source: "client-render-loop",
      message,
      url: window.location.href,
      userAgent: navigator.userAgent,
      data: data as unknown as Record<string, unknown>,
    });
  }

  /**
   * Aggregate (subtree-cascade) tier. Mirrors `evaluate`'s gate structure but
   * sums across the root's subtree: gate 1 sustained summed-rate (split by class,
   * since a childList rebuild is far costlier per record than an attr write),
   * gates 2/3 idle + visible (shared), gate 4 recurring breadth. Below breadth →
   * near-miss log.
   */
  function evaluateAggregate(agg: AggregateState, now: number): void {
    const rebuildRate = agg.window.rate(now, "childlist");
    const attrRate = agg.window.rate(now, "attr");
    // The qualifying stream (prefer childList — costlier — when both are over).
    const overRebuild = rebuildRate >= RENDER_LOOP.AGG_REBUILD_PER_SEC;
    const overAttr = attrRate >= RENDER_LOOP.AGG_ATTR_PER_SEC;
    const rate = overRebuild ? rebuildRate : attrRate;

    // Gate 1: sustained summed-rate streak across the subtree (either class).
    if (overRebuild || overAttr) {
      if (agg.aboveSince === null) agg.aboveSince = now;
    } else {
      agg.aboveSince = null;
      return;
    }
    const sustainedMs = now - agg.aboveSince;
    if (sustainedMs < RENDER_LOOP.SUSTAINED_MS) return;

    // Gate 2: idle.
    const msSinceInteraction = now - lastInteractionAt;
    if (msSinceInteraction < RENDER_LOOP.IDLE_MS) return;

    // Gate 3: visible.
    if (document.visibilityState !== "visible") return;

    // Gate 4: recurring breadth — distinct leaves re-touched within the window.
    const breadth = agg.window.recurringBreadth(
      now,
      RENDER_LOOP.AGG_MIN_LEAF_REPEAT,
    );

    const base = {
      signature: agg.root,
      mutationClass: "subtree-cascade" as const,
      attrName: undefined,
      ratePerSec: Math.round(rate),
      sustainedMs: Math.round(sustainedMs),
      msSinceInteraction: Math.round(msSinceInteraction),
      visibilityState: document.visibilityState,
      distinctLeaves: breadth,
    };

    // Near-miss: gates 1-3 passed but the cascade isn't broad enough. Logged for
    // tuning (no report), throttled per root so a sustained narrow update can't
    // flood the clientLog buffer.
    if (breadth < RENDER_LOOP.AGG_MIN_LEAVES) {
      if (
        agg.lastNearMissLogAt === null ||
        now - agg.lastNearMissLogAt >= RENDER_LOOP.NEAR_MISS_LOG_MS
      ) {
        agg.lastNearMissLogAt = now;
        clientLog(CHANNEL, JSON.stringify({ kind: "near-miss", ...base }));
      }
      return;
    }

    // Synchronous debounce (same rationale as the leaf tier): the fire path is
    // async (sha256), so guard on the synchronous fingerprint key before the
    // first hash resolves. Cascade attrName is null, so the key is `root|class|`.
    const guard = `${base.signature}|${base.mutationClass}|`;
    if (firedGuards.has(guard)) return;
    firedGuards.add(guard);

    void fireAggregate(agg, now, base);
  }

  async function fireAggregate(
    agg: AggregateState,
    now: number,
    base: {
      signature: string;
      mutationClass: MutationClass;
      attrName: undefined;
      ratePerSec: number;
      sustainedMs: number;
      msSinceInteraction: number;
      visibilityState: string;
      distinctLeaves: number;
    },
  ): Promise<void> {
    // The aggregate root is a coarse container — all per-node marker fields are
    // null (pluginId/source/owner/etc. vary across the subtree by design).
    const data: RenderLoopPayload = {
      signature: agg.root,
      pluginId: null,
      slotId: null,
      contributionId: null,
      source: null,
      owner: null,
      paneId: null,
      selector: null,
      mutationClass: "subtree-cascade",
      attrName: null,
      ratePerSec: base.ratePerSec,
      sustainedMs: base.sustainedMs,
      sampleValues: null,
      tagMultiset: null,
      distinctLeaves: base.distinctLeaves,
      sampleLeaves: agg.window.sampleLeaves(now, RENDER_LOOP.AGG_SAMPLE_LEAVES),
      visibilityState: base.visibilityState,
      msSinceInteraction: base.msSinceInteraction,
    };

    // Hashed fingerprint is computed here purely for the log line (the server
    // dedups with the same algorithm + inputs, so the values line up).
    const fingerprint = await renderLoopFingerprint(data);

    const message = `Render loop (cascade): subtree-cascade @ ${base.ratePerSec}/s across ${base.distinctLeaves} nodes — ${agg.root}`;
    clientLog(CHANNEL, JSON.stringify({ kind: "fire", fingerprint, ...base }));

    void report({
      kind: "render-loop",
      source: "client-render-loop",
      message,
      url: window.location.href,
      userAgent: navigator.userAgent,
      data: data as unknown as Record<string, unknown>,
    });
  }

  function onMutations(records: MutationRecord[]): void {
    const now = performance.now();
    for (const record of records) {
      if (isExcluded(record.target)) continue;
      if (
        record.type === "attributes" &&
        isAnimationAttr(record.attributeName, record.target)
      ) {
        continue;
      }

      const meta = culpritMeta(record.target);
      const attrName =
        record.type === "attributes"
          ? record.attributeName ?? undefined
          : undefined;
      const state = stateFor(meta, attrName);
      // Refresh the meta on each hit so a rebuilt node keeps the latest selector.
      state.meta = meta;
      state.events.push(now);
      state.lastEventAt = now;

      if (record.type === "attributes") {
        const cls = classifyAttr(state, record);
        if (cls) {
          state.mutationClass = cls;
          state.wasted = true;
        } else {
          // A real attribute change resets the wasted flag — this isn't wasted.
          state.mutationClass = "noop-attr";
          state.wasted = false;
        }
      } else if (record.type === "childList") {
        const cls = classifyChildList(state, record, now);
        if (cls) {
          state.mutationClass = "childlist-rebuild";
          state.wasted = true;
        } else {
          state.mutationClass = "childlist-rebuild";
          state.wasted = false;
        }
      }

      evaluate(state, now);

      // Aggregate tier: roll this mutation up to its stable container root (keyed
      // by the LEAF signature, so breadth = distinct nodes). Untracked when there
      // is no coarse root (never aggregate at bare document-body level).
      if (meta.aggregateRoot !== undefined) {
        const agg = aggStateFor(meta.aggregateRoot);
        agg.window.record(
          meta.signature,
          now,
          record.type === "childList" ? "childlist" : "attr",
        );
        evaluateAggregate(agg, now);
      }
    }

    gc(now);
  }

  // GC per-signature counters idle longer than GC_IDLE_MS. Piggybacks on the
  // observer callback (no recurring timer) per the no-polling rule.
  function gc(now: number): void {
    for (const [key, state] of states) {
      if (now - state.lastEventAt > RENDER_LOOP.GC_IDLE_MS) states.delete(key);
    }
    for (const [root, agg] of aggregates) {
      if (now - agg.window.lastEventAt > RENDER_LOOP.GC_IDLE_MS) {
        aggregates.delete(root);
      }
    }
  }

  const observer = new MutationObserver(onMutations);
  observer.observe(document.body, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeOldValue: true,
  });

  const INTERACTION_EVENTS = [
    "pointerdown",
    "pointermove",
    "keydown",
    "wheel",
    "scroll",
    "input",
  ] as const;
  for (const ev of INTERACTION_EVENTS) {
    window.addEventListener(ev, markInteraction, { capture: true, passive: true });
  }

  return () => {
    observer.disconnect();
    for (const ev of INTERACTION_EVENTS) {
      window.removeEventListener(ev, markInteraction, { capture: true });
    }
    states.clear();
    aggregates.clear();
    firedGuards.clear();
  };
}
