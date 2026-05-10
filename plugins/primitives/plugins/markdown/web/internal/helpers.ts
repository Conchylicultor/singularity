import { isValidElement, type ReactNode } from "react";

export function nodeToText(node: ReactNode): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(nodeToText).join("");
  if (isValidElement(node)) {
    const props = node.props as { children?: ReactNode };
    return nodeToText(props.children);
  }
  return "";
}

export function langFromClassName(
  className: string | undefined,
): string | null {
  const match = /language-([\w+-]+)/.exec(className ?? "");
  return match?.[1] ?? null;
}
