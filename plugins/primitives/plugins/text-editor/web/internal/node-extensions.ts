import type { Klass, LexicalNode } from "lexical";

export interface NodeExtension {
  node: Klass<LexicalNode>;
  serializeNode: (node: LexicalNode) => string | null;
  deserializePattern: RegExp;
  createNodeFromMatch: (match: RegExpExecArray) => LexicalNode | null;
}

const extensions: NodeExtension[] = [];

export function registerNodeExtension(ext: NodeExtension): () => void {
  extensions.push(ext);
  return () => {
    const idx = extensions.indexOf(ext);
    if (idx >= 0) extensions.splice(idx, 1);
  };
}

export function getNodeExtensions(): readonly NodeExtension[] {
  return extensions;
}
