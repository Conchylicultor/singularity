import {
  Children,
  cloneElement,
  Fragment,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from "react";
import { FileLinkText } from "./file-link-text";

const SKIP_TYPES = new Set(["code", "pre", "a"]);

// Recursively walks a ReactNode tree and replaces plain string nodes with
// linkified versions. Skips `code`, `pre`, and `a` so file paths inside code
// blocks or existing links aren't double-handled. Custom components (non-HTML
// element types) are also left opaque — they manage their own children and
// rewriting them can corrupt the props the component depends on (e.g. the
// active-data ConvChip relies on its children being the raw conv-id string).
export function linkifyChildren(
  children: ReactNode,
  onFileOpen?: (path: string, line?: number) => void,
): ReactNode {
  if (children == null || typeof children === "boolean") return children;
  if (typeof children === "string") {
    return <FileLinkText text={children} onFileOpen={onFileOpen} />;
  }
  if (typeof children === "number") return children;
  if (Array.isArray(children)) {
    return Children.map(children, (child, i) => (
      <Fragment key={i}>{linkifyChildren(child, onFileOpen)}</Fragment>
    ));
  }
  if (isValidElement(children)) {
    const el = children as ReactElement<{ children?: ReactNode }>;
    // Fragments are transparent — recurse so upstream walkers (e.g. the
    // active-data linkify) can wrap text in fragments and we still see the
    // strings inside.
    if (el.type === Fragment) {
      return <Fragment>{linkifyChildren(el.props?.children, onFileOpen)}</Fragment>;
    }
    if (typeof el.type !== "string") return el;
    if (SKIP_TYPES.has(el.type)) return el;
    const inner = el.props?.children;
    if (inner === undefined) return el;
    return cloneElement(el, undefined, linkifyChildren(inner, onFileOpen));
  }
  return children;
}
