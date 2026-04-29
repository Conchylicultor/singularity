import {
  isValidElement,
  useMemo,
  type ComponentType,
  type ReactNode,
} from "react";
import type { Components } from "react-markdown";
import { ActiveData, type ActiveDataTagContribution } from "../slots";

function nodeToText(node: ReactNode): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(nodeToText).join("");
  if (isValidElement(node)) {
    const props = node.props as { children?: ReactNode };
    return nodeToText(props.children);
  }
  return "";
}

function makeAdapter(
  contribution: ActiveDataTagContribution,
): ComponentType<Record<string, unknown>> {
  const Component = contribution.component;
  return function ActiveDataAdapter(props) {
    const { children, node: _node, ...rest } = props as {
      children?: ReactNode;
      node?: unknown;
      [k: string]: unknown;
    };
    const attrs: Record<string, string> = {};
    for (const [key, value] of Object.entries(rest)) {
      if (typeof value === "string") attrs[key] = value;
    }
    return <Component attrs={attrs}>{nodeToText(children)}</Component>;
  };
}

// Returns a `components` map for react-markdown, keyed by each registered
// active-data tag. Pair with `rehype-raw` so raw HTML in markdown source
// (`<conv>conv-xxx</conv>`) reaches the components map instead of being
// stripped during the mdast→hast pass.
export function useActiveDataComponents(): Components {
  const contributions = ActiveData.Tag.useContributions();
  return useMemo(() => {
    const out: Record<string, ComponentType<Record<string, unknown>>> = {};
    for (const c of contributions) {
      if (!c.tag) continue;
      out[c.tag] = makeAdapter(c);
    }
    return out as Components;
  }, [contributions]);
}
