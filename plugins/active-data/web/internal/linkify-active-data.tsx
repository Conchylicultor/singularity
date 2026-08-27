import {
  Children,
  cloneElement,
  Fragment,
  isValidElement,
  useCallback,
  type ReactElement,
  type ReactNode,
} from "react";
import {
  inlineChips,
  type ActiveDataInlineContribution,
} from "./inline-registry";
import { renderInlineChip } from "./render-inline-chip";

// Always skip these element types (don't linkify inside anchors)
const ALWAYS_SKIP = new Set(["a"]);
// Skip code blocks only when inside a <pre> (fenced code); inline `code` is linkified
const SKIP_IN_PRE = new Set(["pre", "code"]);

type Chip = ActiveDataInlineContribution;

type Match = {
  start: number;
  end: number;
  text: string;
  patternSource: string;
};

// Dev-only loud guard for the leftmost-longest tie-break: when two inline
// patterns claim overlapping spans of the same text, the later one is silently
// dropped. That is a registry-level conflict (two contributions competing for one
// token), invisible at runtime because the winner renders normally. Never throws
// — the rendered output is unchanged; this just names the loser.
function warnOverlapSkip(
  winner: Match | null,
  dropped: Match,
  text: string,
): void {
  if (process.env.NODE_ENV === "production") return;
  console.error(
    `[active-data] inline pattern overlap: /${dropped.patternSource}/ matched "${dropped.text}" at ${dropped.start}-${dropped.end}, but that span is already taken by ${
      winner
        ? `/${winner.patternSource}/ ("${winner.text}" at ${winner.start}-${winner.end})`
        : "an earlier match"
    }. The later match is DROPPED — it will never render. Text: ${JSON.stringify(text)}`,
  );
}

function applyPatterns(text: string, chips: readonly Chip[]): ReactNode {
  if (!text) return text;
  const matches: Match[] = [];
  for (const c of chips) {
    const flags = c.pattern.flags.includes("g")
      ? c.pattern.flags
      : `${c.pattern.flags}g`;
    const re = new RegExp(c.pattern.source, flags);
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      matches.push({
        start: m.index,
        end: m.index + m[0].length,
        text: m[0],
        patternSource: c.pattern.source,
      });
      if (m[0].length === 0) re.lastIndex++;
    }
  }
  if (matches.length === 0) return text;
  matches.sort((a, b) => a.start - b.start || b.end - a.end);
  const out: ReactNode[] = [];
  let cursor = 0;
  let i = 0;
  let lastAccepted: Match | null = null;
  for (const m of matches) {
    if (m.start < cursor) {
      warnOverlapSkip(lastAccepted, m, text);
      continue;
    }
    if (m.start > cursor) {
      out.push(
        <Fragment key={`t-${i}`}>{text.slice(cursor, m.start)}</Fragment>,
      );
    }
    // One registry read renders the chip AND applies the boundary an inline
    // chip needs (see ./render-inline-chip). The span was produced by a chip's
    // own pattern, so the anchored re-resolve inside finds one — the `?? m.text`
    // arm keeps the characters rather than dropping them if it ever does not.
    out.push(
      <Fragment key={`m-${i}`}>{renderInlineChip(m.text) ?? m.text}</Fragment>,
    );
    cursor = m.end;
    lastAccepted = m;
    i++;
  }
  if (cursor < text.length)
    out.push(<Fragment key={`t-end`}>{text.slice(cursor)}</Fragment>);
  return <>{out}</>;
}

// Dev-only loud guard for the silent-no-op footgun: a walker seeded with a
// custom-component *root* (not a string/host element/Fragment) leaves everything
// opaque and renders nothing. The sanctioned path is <InlineText> (string seed)
// — see plugins/primitives/plugins/inline-text. Never throws (so the rendered
// output is unchanged); just surfaces the mistake instead of swallowing it.
function warnIfOpaqueRoot(node: ReactNode): void {
  if (process.env.NODE_ENV === "production") return;
  if (
    isValidElement(node) &&
    node.type !== Fragment &&
    typeof node.type !== "string"
  ) {
    console.error(
      "[active-data] useActiveDataLinkify was seeded with a custom-component root; walkers leave custom components opaque, so nothing inside is linkified. Seed with a raw string via <InlineText> instead of hand-composing walkers.",
    );
  }
}

function walk(
  node: ReactNode,
  chips: readonly Chip[],
  inPre = false,
): ReactNode {
  if (node == null || typeof node === "boolean") return node;
  if (typeof node === "string")
    return inPre ? node : applyPatterns(node, chips);
  if (typeof node === "number") return node;
  if (Array.isArray(node)) {
    return Children.map(node, (child, i) => (
      <Fragment key={i}>{walk(child, chips, inPre)}</Fragment>
    ));
  }
  if (isValidElement(node)) {
    const el = node as ReactElement<{ children?: ReactNode }>;
    // Fragments are transparent wrappers — recurse so a chained linkify
    // (e.g. file-links wrapping output in <Fragment>) doesn't hide text.
    if (el.type === Fragment) {
      return <Fragment>{walk(el.props.children, chips, inPre)}</Fragment>;
    }
    if (typeof el.type !== "string") return el;
    if (ALWAYS_SKIP.has(el.type)) return el;
    // <pre> and <code>-inside-<pre> are skipped; standalone inline <code> is linkified
    if (SKIP_IN_PRE.has(el.type) && (inPre || el.type === "pre")) return el;
    const inner = el.props.children;
    if (inner === undefined) return el;
    return cloneElement(el, undefined, walk(inner, chips, el.type === "pre"));
  }
  return node;
}

// Returns a function that walks a ReactNode tree and replaces raw text matches
// of any registered inline chip with that chip. Pair with `<ReactMarkdown>` by
// calling it inside the host's transform helper, or pass in a plain string to
// render a non-markdown line. Skips `code`, `pre`, `a`, and custom components so
// already-rendered widgets (file-link buttons, existing chips) don't get
// re-walked.
//
// The chip set is read INSIDE the returned walker, i.e. at the moment the text
// is rendered, never captured when the hook ran: chips register progressively as
// the plugin tiers load, and a surface that rendered early would otherwise keep
// showing raw tokens. The callback is stable for the same reason it can be —
// it closes over nothing.
export function useActiveDataLinkify(): (children: ReactNode) => ReactNode {
  return useCallback((children: ReactNode) => {
    const chips = inlineChips("transcript");
    if (chips.length === 0) return children;
    warnIfOpaqueRoot(children);
    return walk(children, chips);
  }, []);
}
