const EXT_TO_LANG: Record<string, string> = {
  ts: "ts",
  tsx: "tsx",
  js: "js",
  jsx: "jsx",
  mjs: "js",
  cjs: "js",
  go: "go",
  json: "json",
  md: "markdown",
  mdx: "markdown",
  css: "css",
  scss: "scss",
  html: "html",
  sh: "bash",
  bash: "bash",
  zsh: "bash",
  yaml: "yaml",
  yml: "yaml",
  toml: "toml",
  sql: "sql",
  py: "python",
  rs: "rust",
  dockerfile: "docker",
};

export const SHIKI_LANGS = [
  "ts",
  "tsx",
  "js",
  "jsx",
  "go",
  "json",
  "markdown",
  "css",
  "scss",
  "html",
  "bash",
  "yaml",
  "toml",
  "sql",
  "python",
  "rust",
  "docker",
];

export function languageForPath(path: string): string {
  const base = path.slice(path.lastIndexOf("/") + 1).toLowerCase();
  if (base === "dockerfile") return "docker";
  const dot = base.lastIndexOf(".");
  if (dot < 0) return "text";
  const ext = base.slice(dot + 1);
  return EXT_TO_LANG[ext] ?? "text";
}

const ALIAS_TO_LANG: Record<string, string> = {
  typescript: "ts",
  javascript: "js",
  shell: "bash",
  sh: "bash",
  zsh: "bash",
  yml: "yaml",
  py: "python",
  rs: "rust",
  golang: "go",
  dockerfile: "docker",
  md: "markdown",
  mdx: "markdown",
};

export function resolveLang(lang: string | undefined | null): string | null {
  if (!lang) return null;
  const normalized = lang.toLowerCase();
  const canonical = ALIAS_TO_LANG[normalized] ?? normalized;
  return SHIKI_LANGS.includes(canonical) ? canonical : null;
}
