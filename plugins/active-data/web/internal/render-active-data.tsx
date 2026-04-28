import {
  Children,
  cloneElement,
  Fragment,
  isValidElement,
  useCallback,
  useMemo,
  type ReactElement,
  type ReactNode,
} from "react";
import { ActiveData, type ActiveDataTagContribution } from "../slots";
import { parseActiveData } from "./parse";

const SKIP_TYPES = new Set(["code", "pre", "a"]);

function renderString(
  text: string,
  byTag: Map<string, ActiveDataTagContribution>,
): ReactNode {
  const segments = parseActiveData(text);
  if (segments.length === 1 && segments[0]?.type === "text") return text;
  return (
    <>
      {segments.map((seg, i) => {
        if (seg.type === "text") return <Fragment key={i}>{seg.value}</Fragment>;
        const contribution = byTag.get(seg.tag);
        if (!contribution) {
          // Unknown tag: render literal source so nothing silently disappears.
          return (
            <Fragment key={i}>
              {`<${seg.tag}>${seg.children}</${seg.tag}>`}
            </Fragment>
          );
        }
        const Component = contribution.component;
        return (
          <Component key={i} attrs={seg.attrs} children={seg.children} />
        );
      })}
    </>
  );
}

function walk(
  node: ReactNode,
  byTag: Map<string, ActiveDataTagContribution>,
): ReactNode {
  if (node == null || typeof node === "boolean") return node;
  if (typeof node === "string") return renderString(node, byTag);
  if (typeof node === "number") return node;
  if (Array.isArray(node)) {
    return Children.map(node, (child, i) => (
      <Fragment key={i}>{walk(child, byTag)}</Fragment>
    ));
  }
  if (isValidElement(node)) {
    const el = node as ReactElement<{ children?: ReactNode }>;
    if (typeof el.type === "string" && SKIP_TYPES.has(el.type)) return el;
    const inner = el.props?.children;
    if (inner === undefined) return el;
    return cloneElement(el, undefined, walk(inner, byTag));
  }
  return node;
}

// Hook returning a tree-walker that replaces inline <tag>…</tag> patterns in
// any string children with the matching contribution's component. Drop-in
// alongside `linkifyChildren` from the file-links primitive — call once at
// the top of a renderer, then use the returned function inside react-markdown
// component overrides.
export function useActiveDataRenderer(): (children: ReactNode) => ReactNode {
  const contributions = ActiveData.Tag.useContributions();
  const byTag = useMemo(
    () => new Map(contributions.map((c) => [c.tag, c])),
    [contributions],
  );
  return useCallback((children) => walk(children, byTag), [byTag]);
}
