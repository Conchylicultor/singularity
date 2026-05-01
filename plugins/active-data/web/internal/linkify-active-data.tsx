import {
  Children,
  cloneElement,
  Fragment,
  isValidElement,
  useMemo,
  type ReactElement,
  type ReactNode,
} from "react";
import { ActiveData, type ActiveDataInlineContribution } from "../slots";

// Always skip these element types (don't linkify inside anchors)
const ALWAYS_SKIP = new Set(["a"]);
// Skip code blocks only when inside a <pre> (fenced code); inline `code` is linkified
const SKIP_IN_PRE = new Set(["pre", "code"]);

type PatternContrib = {
  pattern: RegExp;
  Component: ActiveDataInlineContribution["component"];
};

function applyPatterns(text: string, contribs: PatternContrib[]): ReactNode {
  if (!text) return text;
  type Match = { start: number; end: number; text: string; Component: PatternContrib["Component"] };
  const matches: Match[] = [];
  for (const c of contribs) {
    const flags = c.pattern.flags.includes("g") ? c.pattern.flags : `${c.pattern.flags}g`;
    const re = new RegExp(c.pattern.source, flags);
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      matches.push({
        start: m.index,
        end: m.index + m[0].length,
        text: m[0],
        Component: c.Component,
      });
      if (m[0].length === 0) re.lastIndex++;
    }
  }
  if (matches.length === 0) return text;
  matches.sort((a, b) => a.start - b.start || b.end - a.end);
  const out: ReactNode[] = [];
  let cursor = 0;
  let i = 0;
  for (const m of matches) {
    if (m.start < cursor) continue;
    if (m.start > cursor) {
      out.push(<Fragment key={`t-${i}`}>{text.slice(cursor, m.start)}</Fragment>);
    }
    const C = m.Component;
    out.push(<C key={`m-${i}`} content={m.text} attrs={{}} />);
    cursor = m.end;
    i++;
  }
  if (cursor < text.length) out.push(<Fragment key={`t-end`}>{text.slice(cursor)}</Fragment>);
  return <>{out}</>;
}

function walk(node: ReactNode, contribs: PatternContrib[], inPre = false): ReactNode {
  if (node == null || typeof node === "boolean") return node;
  if (typeof node === "string") return inPre ? node : applyPatterns(node, contribs);
  if (typeof node === "number") return node;
  if (Array.isArray(node)) {
    return Children.map(node, (child, i) => (
      <Fragment key={i}>{walk(child, contribs, inPre)}</Fragment>
    ));
  }
  if (isValidElement(node)) {
    const el = node as ReactElement<{ children?: ReactNode }>;
    // Fragments are transparent wrappers — recurse so a chained linkify
    // (e.g. file-links wrapping output in <Fragment>) doesn't hide text.
    if (el.type === Fragment) {
      return <Fragment>{walk(el.props?.children, contribs, inPre)}</Fragment>;
    }
    if (typeof el.type !== "string") return el;
    if (ALWAYS_SKIP.has(el.type)) return el;
    // <pre> and <code>-inside-<pre> are skipped; standalone inline <code> is linkified
    if (SKIP_IN_PRE.has(el.type) && (inPre || el.type === "pre")) return el;
    const inner = el.props?.children;
    if (inner === undefined) return el;
    return cloneElement(el, undefined, walk(inner, contribs, el.type === "pre"));
  }
  return node;
}

// Returns a function that walks a ReactNode tree and replaces raw text matches
// of any registered pattern-mode contribution with the contributed component.
// Pair with `<ReactMarkdown>` by calling it inside the host's transform helper,
// or pass in a plain string to render a non-markdown line. Skips `code`, `pre`,
// `a`, and custom components so already-rendered widgets (file-link buttons,
// existing chips) don't get re-walked.
export function useActiveDataLinkify(): (children: ReactNode) => ReactNode {
  const contributions = ActiveData.Tag.useContributions();
  const contribs = useMemo<PatternContrib[]>(
    () =>
      contributions
        .filter((c): c is ActiveDataInlineContribution => c.display === "inline")
        .map((c) => ({ pattern: c.pattern, Component: c.component })),
    [contributions],
  );
  return useMemo(() => {
    if (contribs.length === 0) return (c) => c;
    return (children: ReactNode) => walk(children, contribs);
  }, [contribs]);
}
