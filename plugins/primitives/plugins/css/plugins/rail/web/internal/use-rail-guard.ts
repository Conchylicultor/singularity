import { useEffect, useRef } from "react";
import {
  RAIL_OWED_START_VAR,
  RAIL_START_VAR,
} from "@plugins/primitives/plugins/css/plugins/rail/core";

/**
 * A rail this large is not a rail — it is `var()`'s fallback arriving to say the
 * property was never published, which keeps "nobody opened a region here"
 * distinguishable from "someone opened one of width zero". Padding cannot be
 * negative, so a negative sentinel would collapse back to `0` and lose exactly
 * that distinction. Same value, same reason, as the layout harness's `__measure`.
 */
const UNPUBLISHED_SENTINEL = 99_999;

/** How far off the rail a box may land before it counts as a violation, in px. */
const EPSILON = 0.5;

/**
 * The two escapes, matched as exact class TOKENS.
 *
 * Keying on the class rather than on geometry is deliberate here, and it is the
 * cheap read as well as the exact one. Both are single literal tokens by
 * construction — Tailwind only emits a utility whose literal its scanner saw, so
 * `core/rail-class.ts` spells every step out and no call site can splice one —
 * which makes `[class~="…"]` an exact match, and makes the walk O(escapes)
 * instead of a `getComputedStyle` on every node under a panel.
 *
 * What that trades away: a HAND-ROLLED escape (a raw `-mx-1`) is not recognised
 * as one. That is not a hole, because such a box is not claiming to bleed by the
 * rail — it is an ordinary child that moved, which is precisely what the
 * alignment check below reports.
 */
const BLEED_SELECTOR = '[class~="rail-bleed"]';
const FOLLOW_SELECTOR = '[class~="rail-follow"]';

/**
 * Resolve a rail custom property to PIXELS as `host` sees it, **by laying it
 * out** — never by parsing the computed text.
 *
 * `--rail-start: var(--space-lg)` has the computed value `1rem`, and
 * control-panel's rails are `calc()` chains; `parseFloat` reads `1` and `NaN`
 * respectively — a rail wrong by a factor of 16, silently, in the one place that
 * is supposed to catch wrong numbers. Sizing a throwaway probe by the var and
 * reading its box back is the only read that goes through the same resolution
 * the padding itself went through. Same idiom as the harness's `__measure` and
 * `ui-kit/e2e/scroll-fade-verify.ts`.
 *
 * `null` means the property was never published (the sentinel came back), which
 * the caller must not confuse with a published `0px`.
 */
function resolveLength(host: HTMLElement, name: string): number | null {
  const probe = document.createElement("div");
  probe.style.cssText =
    "position:fixed;top:-999999px;left:-999999px;visibility:hidden;width:0";
  probe.style.height = `var(${name}, ${UNPUBLISHED_SENTINEL}px)`;
  host.appendChild(probe);
  const height = probe.getBoundingClientRect().height;
  probe.remove();
  return Math.abs(height - UNPUBLISHED_SENTINEL) < EPSILON ? null : height;
}

/** Name an offending element the way a human reads the DOM inspector. */
function describe(el: Element): string {
  const cls = el.getAttribute("class");
  return `<${el.tagName.toLowerCase()}${cls ? ` class="${cls}"` : ""}>`;
}

/**
 * The box a bleed actually cancels the padding of: the nearest ancestor that
 * applies inline padding, searched up to and including `root`.
 *
 * A bleed cancels *the padding that was applied to it*, so that ancestor's
 * padding box is where it must land — and this is the one walk that gets both
 * shapes right. A bleeder any depth down through NON-padding wrappers is
 * legitimate (every wrapper spans the region's content box, so the same
 * cancellation reaches the same edge), and resolves here to the region itself. A
 * bleeder under an intervening padder is the bug, and resolves to that padder,
 * which it will overhang by exactly the amount the two disagree.
 *
 * Returns `null` when nothing between the bleeder and `root` — `root` included —
 * pads at all, which is the `rail-owe-` shape: the region published without
 * applying anything, so there is no padding to cancel and nothing to measure
 * against.
 */
function nearestPadder(from: Element, root: HTMLElement): HTMLElement | null {
  for (
    let el: HTMLElement | null = from.parentElement;
    el !== null;
    el = el.parentElement
  ) {
    const style = getComputedStyle(el);
    if (
      parseFloat(style.paddingLeft) > EPSILON ||
      parseFloat(style.paddingRight) > EPSILON
    ) {
      return el;
    }
    if (el === root) return null;
  }
  return null;
}

/**
 * Dev-only structural guard for a box that **opens a rail region**. Three
 * independent readings of one contract, because the three ways it breaks are
 * invisible to each other:
 *
 * **1. Alignment — every child starts on the rail.** The contract says a box
 * either opens a region or lives in one, never both, so a child either inherits
 * the rail by applying no inline padding of its own or escapes it with
 * `rail-bleed`. A child that quietly applies its own inset is the double-inset:
 * nothing anywhere looks wrong, each call site reads as reasonable, and the only
 * evidence is content indented twice.
 *
 * **2. Over-bleed — no escape leaves the box that paid for it.** `rail-bleed`
 * cancels `--rail-start`, i.e. the nearest *published* rail — but `Inset` and
 * every plain `px-*` pad WITHOUT publishing, so a bleeder under one cancels a
 * rail its actual container never applied and escapes by the difference. The
 * alignment check cannot see this: an over-bleed is not a misaligned content
 * edge (the re-apply puts the content back on the rail, correctly), it is a
 * *box* escaping its parent. The fix is always upstream — the padder should open
 * a region (`rail-x-<step>`) rather than pad silently — never a compensating
 * number on the bleeder.
 *
 * **3. Nested followers — nobody pays twice.** `rail-follow` cannot clear the
 * debt for its own descendants: reading `--rail-owed-start` while declaring it
 * on the same element resolves against that element's own declaration, so a
 * follower inside a follower pays the rail again. Always wrong, in every
 * context, which is what makes flagging it free of judgement calls. (It is also
 * the one of the three a class-token match can settle outright, no geometry
 * involved.)
 *
 * What it deliberately does not check, and why each is a real distinction rather
 * than a tolerance:
 *
 * - **A box that published nothing** is not a region, so there is no rail to
 *   hold anything to. Publication itself is gated by the layout harness's region
 *   fixtures, which can assert it because they know the box under test is meant
 *   to be a region; this hook runs on components that also render where they are
 *   not one.
 * - **A region that publishes without paying** (`rail-owe-<step>` — data-view's
 *   inverted topology, where the bands inset themselves) hands the inset to its
 *   `rail-follow` descendants, so its ordinary children are *supposed* to sit
 *   flush at the origin. The published debt is what says so, so the guard reads
 *   it rather than guessing from the topology.
 * - **A child publishing a different rail** opened its own region, and nesting
 *   is shadowing rather than accumulation: its contents answer to its rail, not
 *   this one. The walk stops there, so a nested region's own guard reports its
 *   own subtree and one offender never draws two identical errors.
 * - **A child generating no boxes** is not a geometry participant, and measuring
 *   it invents one — `getBoundingClientRect()` on a `display: none` element is
 *   all zeros, i.e. a box at the viewport origin, wrong by the width of the
 *   page. The same non-participant rule the harness's `__measure` applies. The
 *   one exception is `display: contents`, which generates no box because it is
 *   *transparent to layout* rather than absent from it: the guard walks through
 *   it to the real children, since that is precisely how a contributed panel
 *   arrives.
 * - **An out-of-flow child** (an absolutely positioned scroll arrow, an overlay)
 *   is not in the region's inline flow at all, so the rail says nothing about
 *   where it belongs.
 *
 * Loud but never fatal: at most one `console.error` per check per root, each
 * listing every offender and its delta, so a menu of ten mis-inset rows costs
 * one message rather than ten. It never throws — this runs on overlay and
 * SSR-hydration edges where a throw would take down the surface it was auditing.
 *
 * Lives in its own hook (not inline in the component) so the effect's ref read +
 * DOM walk stay out of the host component's React Compiler analysis — an inline
 * effect reading `ref.current` extends a mutable range that makes the compiler
 * skip optimizing the whole component (breaking its manual memos).
 *
 * Returns the ref to attach to the region's own element — the box that carries
 * the rail class, since the rail is measured from the publisher's padding box.
 */
export function useRailGuard<T extends HTMLElement = HTMLElement>(
  label: string,
) {
  const ref = useRef<T>(null);
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const root = ref.current;
    if (!root) return;
    // One frame for layout to settle before measuring edges.
    const raf = requestAnimationFrame(() => {
      const railStart = resolveLength(root, RAIL_START_VAR);
      if (railStart === null) return;
      const rootStyle = getComputedStyle(root);
      const published = rootStyle.getPropertyValue(RAIL_START_VAR);
      const owed = resolveLength(root, RAIL_OWED_START_VAR);
      const ownerPaid = owed === null || owed <= EPSILON;

      checkNesting(root, label);
      checkBleeds(root, label, published);
      if (!ownerPaid) return;
      checkAlignment(root, label, rootStyle, railStart, published);
    });
    return () => cancelAnimationFrame(raf);
  }, [label]);
  return ref;
}

/** Check 1 — every child's content edge starts on the published rail. */
function checkAlignment(
  root: HTMLElement,
  label: string,
  rootStyle: CSSStyleDeclaration,
  railStart: number,
  published: string,
): void {
  // The rail is measured from the publisher's PADDING box: a bordered panel's
  // border sits outside the rail it published, so an `OverlayPanel` would
  // otherwise read every child as one pixel off.
  //
  // `parseFloat` is safe on `borderLeftWidth` / `paddingLeft` and only there:
  // those are resolved used values, always in px. It is the custom properties
  // that must go through a probe.
  const expected =
    root.getBoundingClientRect().left +
    parseFloat(rootStyle.borderLeftWidth) +
    railStart;

  const offenders: string[] = [];
  // A worklist rather than a plain loop, for `display: contents` alone: the
  // region's real child is then one level further down, and that is how a
  // CONTRIBUTED panel always arrives (`renderIsolated` wraps every contribution
  // in a lineage span, one per contribution, nested). Skipping the wrapper would
  // quietly exempt exactly the children the contract cares most about — the ones
  // written by a plugin that never saw this region.
  const pending: Element[] = [...root.children];
  for (let i = 0; i < pending.length; i++) {
    const child = pending[i]!;
    const style = getComputedStyle(child);
    if (style.display === "contents") {
      pending.push(...child.children);
      continue;
    }
    if (child.getClientRects().length === 0) continue;
    // A string compare, not a pixel one: it is the DECLARATION that makes a
    // child its own region, and two different declarations that happen to
    // resolve to the same length are still two regions.
    if (style.getPropertyValue(RAIL_START_VAR) !== published) continue;
    if (style.position === "absolute" || style.position === "fixed") continue;
    const contentLeft =
      child.getBoundingClientRect().left + parseFloat(style.paddingLeft);
    const delta = contentLeft - expected;
    if (Math.abs(delta) <= EPSILON) continue;
    offenders.push(
      `${describe(child)} — content starts ${Math.abs(delta).toFixed(1)}px ` +
        `${delta > 0 ? "past" : "short of"} the rail`,
    );
  }
  if (offenders.length === 0) return;
  console.error(
    `[rail ${label}] ${offenders.length} child${offenders.length === 1 ? "" : "ren"} ` +
      `do not start on the rail this region published (${railStart.toFixed(1)}px ` +
      `from its padding-box edge):\n` +
      offenders.map((o) => `  • ${o}`).join("\n") +
      `\nA child either INHERITS the rail — apply no inline padding of its own and it ` +
      `lands there by doing nothing — or ESCAPES it with \`rail-bleed\`, which cancels ` +
      `and re-applies the rail as one act, so its box reaches the region's edge while ` +
      `its content comes back to the same x. Applying an inset on top of the region's ` +
      `is the double-inset this contract exists to make visible.`,
  );
}

/** Check 2 — no `rail-bleed` escapes the box whose padding it cancelled. */
function checkBleeds(
  root: HTMLElement,
  label: string,
  published: string,
): void {
  const offenders: string[] = [];
  for (const bleeder of root.querySelectorAll(BLEED_SELECTOR)) {
    if (bleeder.getClientRects().length === 0) continue;
    // Inside a nested region it bleeds by THAT region's rail, which is that
    // region's business (and its own guard's report, if it has one).
    if (
      getComputedStyle(bleeder).getPropertyValue(RAIL_START_VAR) !== published
    ) {
      continue;
    }
    const padder = nearestPadder(bleeder, root);
    if (!padder) continue;
    const padderRect = padder.getBoundingClientRect();
    const padderStyle = getComputedStyle(padder);
    // The PADDING box on both sides — a bleed cancels padding, not border.
    const innerLeft = padderRect.left + parseFloat(padderStyle.borderLeftWidth);
    const innerRight =
      padderRect.right - parseFloat(padderStyle.borderRightWidth);
    const rect = bleeder.getBoundingClientRect();
    const overStart = innerLeft - rect.left;
    const overEnd = rect.right - innerRight;
    if (overStart <= EPSILON && overEnd <= EPSILON) continue;
    offenders.push(
      `${describe(bleeder)} — overhangs ${describe(padder)} by ` +
        `${Math.max(overStart, 0).toFixed(1)}px / ${Math.max(overEnd, 0).toFixed(1)}px ` +
        `(start / end)`,
    );
  }
  if (offenders.length === 0) return;
  console.error(
    `[rail ${label}] ${offenders.length} bleed${offenders.length === 1 ? "" : "s"} ` +
      `reach past the box that actually padded them:\n` +
      offenders.map((o) => `  • ${o}`).join("\n") +
      `\n\`rail-bleed\` cancels the nearest PUBLISHED rail, but the box between it and ` +
      `this region pads without publishing — an \`Inset\` or a plain \`px-*\` — so the ` +
      `bleed is sized for a rail that box never applied and overshoots by the ` +
      `difference. Fix it upstream: that padder should OPEN A REGION (\`rail-x-<step>\`, ` +
      `which pads and publishes in one declaration) instead of padding silently. Never ` +
      `compensate on the bleeder — a hand-tuned number there is correct for exactly one ` +
      `ancestor and wrong the moment the row is reused.`,
  );
}

/** Check 3 — no `rail-follow` sits inside another `rail-follow`. */
function checkNesting(root: HTMLElement, label: string): void {
  const offenders: string[] = [];
  for (const follower of root.querySelectorAll(FOLLOW_SELECTOR)) {
    const outer = follower.parentElement?.closest(FOLLOW_SELECTOR);
    // Bounded to this region: an outer follower ABOVE the root means the root
    // itself sits in one, which is that region's report to make, not ours.
    if (!outer || !root.contains(outer)) continue;
    offenders.push(`${describe(follower)} inside ${describe(outer)}`);
  }
  if (offenders.length === 0) return;
  console.error(
    `[rail ${label}] ${offenders.length} \`rail-follow\` box${offenders.length === 1 ? "" : "es"} ` +
      `nested inside another, so the rail is paid twice:\n` +
      offenders.map((o) => `  • ${o}`).join("\n") +
      `\nA follower cannot clear the debt for its descendants — reading ` +
      `\`--rail-owed-start\` while declaring it on the same element resolves against its ` +
      `own declaration — so every nested follower re-applies the full inset. Followers ` +
      `are siblings, never ancestors of one another: hoist the inner one out, or drop ` +
      `its \`rail-follow\` and let it inherit the band it already lives in. The commonest ` +
      `way in is a sub-region \`<Loading>\` (its skeleton bands follow the rail) rendered ` +
      `INSIDE an already-following body rather than in place of it.`,
  );
}
