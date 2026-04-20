const MD_EXT = new Set(["md", "mdx", "markdown"]);

export function supportsMarkdown(file: { path: string }): "native" | false {
  const base = file.path.slice(file.path.lastIndexOf("/") + 1).toLowerCase();
  const dot = base.lastIndexOf(".");
  if (dot < 0) return false;
  return MD_EXT.has(base.slice(dot + 1)) ? "native" : false;
}
