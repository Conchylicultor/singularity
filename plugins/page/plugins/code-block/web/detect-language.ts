import { SHIKI_LANGS } from "@plugins/primitives/plugins/syntax-highlight/web";

// Heuristic, dependency-free language guesser powering the code block's "Auto"
// mode. It scores a snippet against signature patterns for each language shiki
// supports (SHIKI_LANGS) and returns the best match, or null when nothing
// scores confidently (the block then renders as plain text). Intentionally
// cheap — a handful of regexes — so it can run live on every keystroke without
// a worker or a model.

const has = (re: RegExp, code: string): number => (re.test(code) ? 1 : 0);

const isValidJson = (str: string): boolean => {
  try {
    JSON.parse(str);
    return true;
  } catch (err) {
    if (err instanceof SyntaxError) return false;
    throw err;
  }
};

// Below this best-score the guess is too weak to trust — render plain instead.
const CONFIDENCE_THRESHOLD = 3;

export function detectLanguage(code: string): string | null {
  const s = code.trim();
  // Too little to go on — don't highlight a stray word as code.
  if (s.length < 3) return null;

  const scores: Record<string, number> = {};
  const add = (lang: string, n: number) => {
    if (n > 0) scores[lang] = (scores[lang] ?? 0) + n;
  };

  // ---- JSON (must look like a whole object/array, not a JS object literal) ----
  if (/^[{[]/.test(s) && /[}\]]$/.test(s) && /"[^"]+"\s*:/.test(s)) {
    // A partial / in-progress JSON snippet still reads as JSON; a fully valid
    // parse is stronger evidence.
    add("json", isValidJson(s) ? 8 : 4);
  }

  // ---- Dockerfile ----
  add("docker", 3 * has(/^\s*FROM\s+\S+/im, s));
  add(
    "docker",
    2 *
      has(
        /^\s*(RUN|CMD|ENTRYPOINT|COPY|ADD|WORKDIR|ENV|EXPOSE|LABEL|ARG|MAINTAINER)\s+\S/im,
        s,
      ),
  );

  // ---- HTML ----
  add("html", 3 * has(/<!doctype html|<html[\s>]|<\/html>/i, s));
  add(
    "html",
    2 *
      has(
        /<\/?(div|span|p|a|ul|ol|li|table|tr|td|head|body|script|style|h[1-6]|img|button|input|form|nav|section|header|footer)\b/i,
        s,
      ),
  );

  // ---- CSS / SCSS (route the stylesheet score to exactly one of the two so
  // SCSS-only signals like `$var:` / `&:hover` / nesting always win) ----
  const cssLike =
    /[.#]?[\w-]+[^{};]*\{[^{}]*:[^{}]*;[^{}]*\}/.test(s) ||
    /[.#][\w-]+[^{}]*\{/.test(s) ||
    /@(media|keyframes)\b|!important/i.test(s);
  if (cssLike) {
    // SCSS-only signals; at-rule nesting (@media { .x { … } }) is valid plain
    // CSS, so we rely on these unambiguous markers rather than generic nesting.
    const isScss =
      /\$[\w-]+\s*:/.test(s) ||
      /@(mixin|include|extend|if|each|function)\b/.test(s) ||
      /(^|\s)&[:.\s&]/.test(s);
    add(isScss ? "scss" : "css", 4);
  }

  // ---- SQL ----
  add(
    "sql",
    3 *
      has(
        /\b(select\s+[\s\S]+\bfrom\b|insert\s+into\b|update\s+\w+\s+set\b|delete\s+from\b|create\s+(table|index|view)\b|alter\s+table\b|drop\s+(table|index)\b)/i,
        s,
      ),
  );

  // ---- Python ----
  add("python", 3 * has(/^\s*def\s+\w+\s*\([^)]*\)\s*:/m, s));
  add("python", 2 * has(/^\s*(from\s+[\w.]+\s+import|import\s+\w+)/m, s));
  add("python", 2 * has(/^\s*class\s+\w+\s*[:(]/m, s));
  add("python", has(/\bself\b|\bprint\(|\belif\b|\b__\w+__\b/, s));

  // ---- Go ----
  add("go", 3 * has(/^\s*package\s+\w+/m, s));
  add("go", 2 * has(/\bfunc\s+(\(\w+\s+\*?\w+\)\s+)?\w+\s*\(/, s));
  add("go", 2 * has(/:=/, s));
  add("go", has(/\bfmt\.\w+|\bimport\s+\(|\bchan\b|\bdefer\b|\bgo\s+\w+\(/, s));

  // ---- Rust ----
  add("rust", 2 * has(/\bfn\s+\w+\s*(<[^>]*>)?\s*\(/, s));
  add("rust", 2 * has(/\blet\s+mut\b|->\s*[\w<]+\s*\{|\bimpl\b|\btrait\s+\w+/, s));
  add("rust", 2 * has(/\b\w+!\s*\(|\buse\s+[\w:]+::/, s));
  add("rust", has(/&str\b|&mut\b|::<|Option<|Result<|Vec<|fn main\(\)/, s));

  // ---- JS / TS family (disambiguated below by type & JSX signals) ----
  const jsBase =
    2 * has(/\b(const|let|var)\s+\w+\s*=/, s) +
    2 * has(/=>/, s) +
    2 * has(/\bfunction\b/, s) +
    has(/\b(console|require|module|export|import|return|async|await)\b/, s) +
    has(/`[^`]*\$\{/, s);
  const tsSignal =
    has(/\b(interface|type)\s+\w+\s*[={<]/, s) +
    has(/:\s*(string|number|boolean|void|any|unknown|never|Promise<)/, s) +
    has(/\benum\s+\w+/, s) +
    has(/\bas\s+(const|\w+)\b/, s) +
    has(/\b[A-Za-z_]\w*<[\w,\s.<>[\]]+>\s*\(/, s) + // generic call e.g. useState<number>()
    has(/\b(public|private|protected|readonly)\s+\w+/, s);
  const jsx =
    /<([A-Za-z]\w*)([^>]*)?>[\s\S]*<\/\1>/.test(s) ||
    /<[A-Za-z][^>]*\/>/.test(s) ||
    /className=/.test(s);
  if (jsBase > 0 || tsSignal > 0) {
    if (tsSignal > 0) add(jsx ? "tsx" : "ts", jsBase + tsSignal * 2 + 2);
    else add(jsx ? "jsx" : "js", jsBase + (jsx ? 2 : 0));
  }

  // ---- Markdown ----
  add("markdown", 2 * has(/^#{1,6}\s+\S/m, s));
  add("markdown", has(/^\s*[-*+]\s+\S/m, s));
  add("markdown", has(/\[[^\]]+\]\([^)]+\)/, s));
  add("markdown", 2 * has(/```|^>\s+\S/m, s));

  // ---- YAML ----
  if ((s.match(/^\s*[\w-]+:\s+\S/gm) ?? []).length >= 2) add("yaml", 3);
  add("yaml", has(/^---\s*$/m, s));
  add("yaml", has(/^\s*-\s+\w+/m, s));

  // ---- TOML ----
  add("toml", 3 * has(/^\s*\[[\w.\-"]+\]\s*$/m, s));
  add("toml", has(/^\s*[\w-]+\s*=\s*("|'|\d|\[|true|false)/m, s));

  // ---- Bash ----
  add("bash", 3 * has(/^#!.*\b(bash|sh|zsh)\b/m, s));
  add(
    "bash",
    2 *
      has(
        /\$\(|\$\{|\b(echo|export|sudo|chmod|mkdir|grep|sed|awk|curl|cd|cat)\s+\S/,
        s,
      ),
  );
  add("bash", has(/\|\s*\w|&&|\bfi\b|\bdone\b|\bthen\b/, s));

  let best: string | null = null;
  let bestScore = 0;
  for (const [lang, score] of Object.entries(scores)) {
    if (score > bestScore) {
      best = lang;
      bestScore = score;
    }
  }
  return best && bestScore >= CONFIDENCE_THRESHOLD && SHIKI_LANGS.includes(best)
    ? best
    : null;
}
