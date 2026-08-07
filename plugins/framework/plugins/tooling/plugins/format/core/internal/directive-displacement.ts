// Positional lint directives vs. a reflowing formatter.
//
// `// eslint-disable-next-line R` is POSITIONAL: it suppresses `R` on the line
// that follows it, and nothing about it is attached to the code it means. A
// formatter moves lines. The two are structurally incompatible, and the repo
// has ~1,100 such directives.
//
// Two failure modes, and only one of them announces itself:
//
//   - the target is SPLIT across lines, the directive stops covering the
//     violation it was written for, the rule fires, the build breaks. Loud.
//   - the target is MERGED with neighbouring code, and the directive now
//     suppresses a violation nobody ever vetted. SILENT, and strictly worse.
//
// This module decides, for one file, whether formatting it would change what
// any of its positional directives suppresses — in EITHER direction.
//
// The invariant is deliberately structural, not textual: two source lines are
// "the same target" iff the same sequence of AST nodes STARTS on them. That is
// what an ESLint directive actually covers (a report's line is its node's start
// line), so quote normalization, added trailing commas and reindentation — all
// of which change the line's text without moving code across a line boundary —
// are correctly NOT displacements.

/** What a directive covered, on one side of the format. */
export interface DirectiveTarget {
  /** 1-based line the directive suppresses. */
  line: number;
  /** That line's source text, trimmed. */
  text: string;
  /** Syntax kinds of the AST nodes STARTING on that line, outermost first. */
  nodes: string[];
}

/**
 * One positional directive whose meaning formatting would change.
 *
 * `kind` classifies the direction, because they are not equally dangerous:
 *
 *   - `widened`  — code MOVED ONTO the target line. The directive now
 *                  suppresses code it never covered: **fail-open**, silent, and
 *                  the reason this detector exists.
 *   - `narrowed` — code moved OFF the target line. The directive no longer
 *                  covers what it was written for: fail-closed (the rule fires)
 *                  but with an error pointing at a line nobody wrote.
 *   - `shifted`  — same node count, different nodes: a swap.
 *   - `lost`     — formatting dropped, added or rewrote the directive comment
 *                  itself. Should be impossible; reported rather than assumed.
 */
export interface DirectiveDisplacement {
  /** Path as handed to the formatter (repo-relative in every caller today). */
  file: string;
  /** 1-based line of the directive comment, in the PRE-format source. */
  line: number;
  /** The comment verbatim, e.g. `// eslint-disable-next-line R -- why`. */
  directive: string;
  /** Rule names the directive names; empty for a blanket disable. */
  rules: string[];
  kind: "widened" | "narrowed" | "shifted" | "lost";
  /** What it suppresses in the file as it is on disk now. */
  before: DirectiveTarget;
  /** What it would suppress once the file is formatted. */
  after: DirectiveTarget;
}

/**
 * The positional directive forms this understands, as
 * `keyword → lines below the comment that it covers`.
 *
 * Both are ESLint's; `@ts-expect-error` / `@ts-ignore` are the same hazard and
 * belong here too, but adding them is a separate change with its own fallout —
 * this list is the one place to do it.
 */
const POSITIONAL_DIRECTIVES: Readonly<Record<string, number | undefined>> = {
  "eslint-disable-next-line": 1,
  "eslint-disable-line": 0,
};

/**
 * Memoized DYNAMIC import of typescript — the same reasoning as the prettier
 * import next door, not style. A static import hoists above every statement, so
 * one reachable from the CLI would resolve out of the very `node_modules` that
 * `ensureDeps()` exists to repair. Lazy also means the common case (a format
 * pass that changes nothing, or changes only directive-free files) never loads
 * a 60 MB compiler.
 */
let tsMod: Promise<typeof import("typescript")> | null = null;
function loadTs(): Promise<typeof import("typescript")> {
  return (tsMod ??= import("typescript"));
}

interface ParsedDirective {
  /** 1-based line of the comment. */
  line: number;
  /** 0-based line the directive covers. */
  targetLine0: number;
  text: string;
  rules: string[];
}

interface FileFacts {
  directives: ParsedDirective[];
  /** 0-based line → syntax kinds of the nodes starting there. */
  nodesByLine: Map<number, string[]>;
  /** 0-based line → that line's trimmed text. */
  lineText: (line0: number) => string;
}

/**
 * Read a directive out of a comment's text, or `null` if it is not one.
 *
 * ESLint requires the directive at the START of the comment body (leading
 * whitespace allowed), so anything mentioning a directive mid-prose — including
 * this file's own docblocks — is correctly not one.
 */
function parseDirective(
  commentText: string,
): { offset: number; rules: string[] } | null {
  const body = commentText.startsWith("//")
    ? commentText.slice(2)
    : commentText.slice(2, commentText.endsWith("*/") ? -2 : undefined);

  const match = /^\s*([a-z-]+)(?![\w-])/.exec(body);
  if (!match) return null;
  const offset = POSITIONAL_DIRECTIVES[match[1]!];
  if (offset === undefined) return null;

  // Everything after the keyword and before ESLint's ` -- ` justification
  // separator is the comma-separated rule list. A blanket disable names none.
  const rules = body
    .slice(match[0].length)
    .split(/\s--\s/)[0]!
    .split(",")
    .map((r) => r.trim())
    .filter((r) => r.length > 0);
  return { offset, rules };
}

/**
 * Every comment in the file, in source order.
 *
 * Taken from the PARSED token tree, never from a raw `ts.createScanner` loop:
 * a bare scanner has no parser context, so it lexes a regex literal as a
 * division and desyncs — after which `//` inside a string literal reads as a
 * comment. That is not hypothetical; it invented directives in the lint-rule
 * files, which are the ones densest in both regexes and directives.
 *
 * Every comment lives in exactly one LEAF token's trivia run, so visiting the
 * leaves is the complete cover — including a comment inside an empty block (the
 * `}`) and one at end of file (the EOF token). But ONE scan per leaf is not:
 * `getLeadingCommentRanges` starts collecting only AFTER the trivia run's first
 * line break, and `getTrailingCommentRanges` stops AT it. The two are disjoint
 * halves of the same run, and the pre-line-break half is not a rare shape:
 *
 *   - a block-comment directive braced in JSX child position, the only form JSX
 *     permits (a line comment there would swallow the closing brace). It sits
 *     between the braces with no line break before it, so it lands in the
 *     closing brace's trailing half — invisible to a leading-only scan, and
 *     with it ~19% of the repo's directives.
 *   - every trailing `// eslint-disable-line R`, which by definition follows
 *     code on its own line.
 *
 * So both halves are scanned and the union re-sorted into source order (the
 * trailing half precedes the leading half within a run), which the ordinal
 * before/after pairing in `findDirectiveDisplacements` relies on.
 */
function collectComments(
  ts: typeof import("typescript"),
  sf: import("typescript").SourceFile,
  text: string,
): import("typescript").CommentRange[] {
  const comments: import("typescript").CommentRange[] = [];
  const seen = new Set<number>();
  const visit = (node: import("typescript").Node): void => {
    const children = node.getChildren(sf);
    if (children.length > 0) {
      for (const child of children) visit(child);
      return;
    }
    const pos = node.getFullStart();
    for (const range of [
      ...(ts.getTrailingCommentRanges(text, pos) ?? []),
      ...(ts.getLeadingCommentRanges(text, pos) ?? []),
    ]) {
      if (seen.has(range.pos)) continue;
      seen.add(range.pos);
      comments.push(range);
    }
  };
  visit(sf);
  return comments.sort((a, b) => a.pos - b.pos);
}

/** Parse `text` once and extract everything the comparison needs. */
async function readFacts(file: string, text: string): Promise<FileFacts> {
  const ts = await loadTs();
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);

  const lineStarts = sf.getLineStarts();
  const lineText = (line0: number): string => {
    if (line0 < 0 || line0 >= lineStarts.length) return "";
    const end =
      line0 + 1 < lineStarts.length ? lineStarts[line0 + 1]! : text.length;
    return text.slice(lineStarts[line0]!, end).trim();
  };

  // Every node's START line — trivia-skipped, which is exactly the position
  // ESLint reports a violation at.
  const nodesByLine = new Map<number, string[]>();
  const visit = (node: import("typescript").Node): void => {
    const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line;
    const bucket = nodesByLine.get(line);
    const kind = ts.SyntaxKind[node.kind];
    if (bucket) bucket.push(kind);
    else nodesByLine.set(line, [kind]);
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(sf, visit);

  const directives: ParsedDirective[] = [];
  for (const range of collectComments(ts, sf, text)) {
    const commentText = text.slice(range.pos, range.end);
    const parsed = parseDirective(commentText);
    if (!parsed) continue;
    // A block directive may span lines; it covers relative to where it ENDS.
    const endLine0 = sf.getLineAndCharacterOfPosition(range.end).line;
    directives.push({
      line: sf.getLineAndCharacterOfPosition(range.pos).line + 1,
      targetLine0: endLine0 + parsed.offset,
      text: commentText,
      rules: parsed.rules,
    });
  }

  return { directives, nodesByLine, lineText };
}

function targetOf(facts: FileFacts, line0: number): DirectiveTarget {
  return {
    line: line0 + 1,
    text: facts.lineText(line0),
    nodes: facts.nodesByLine.get(line0) ?? [],
  };
}

/**
 * Every positional directive in `before` whose meaning `after` would change.
 *
 * Pure and cheap to skip: identical bytes can displace nothing, and neither can
 * a file with no directives, so the typescript compiler is never loaded for
 * either case.
 *
 * Directives are paired by ORDER — prettier preserves comments and their
 * sequence — and the pairing is verified by comparing the comment text, so a
 * formatter that ever did drop or rewrite one is reported (`kind: "lost"`)
 * rather than silently mis-paired.
 */
export async function findDirectiveDisplacements(
  file: string,
  before: string,
  after: string,
): Promise<DirectiveDisplacement[]> {
  if (before === after) return [];
  if (!/eslint-disable-(next-)?line/.test(before)) return [];

  const b = await readFacts(file, before);
  if (b.directives.length === 0) return [];
  const a = await readFacts(file, after);

  const displaced: DirectiveDisplacement[] = [];
  const count = Math.max(b.directives.length, a.directives.length);
  for (let i = 0; i < count; i++) {
    const bd = i < b.directives.length ? b.directives[i]! : null;
    const ad = i < a.directives.length ? a.directives[i]! : null;

    if (bd === null || ad === null || bd.text !== ad.text) {
      displaced.push({
        file,
        line: bd?.line ?? ad?.line ?? 0,
        directive: bd?.text ?? ad?.text ?? "",
        rules: bd?.rules ?? ad?.rules ?? [],
        kind: "lost",
        before: bd
          ? targetOf(b, bd.targetLine0)
          : { line: 0, text: "", nodes: [] },
        after: ad
          ? targetOf(a, ad.targetLine0)
          : { line: 0, text: "", nodes: [] },
      });
      continue;
    }

    const beforeTarget = targetOf(b, bd.targetLine0);
    const afterTarget = targetOf(a, ad.targetLine0);
    if (beforeTarget.nodes.join("|") === afterTarget.nodes.join("|")) {
      continue;
    }

    displaced.push({
      file,
      line: bd.line,
      directive: bd.text,
      rules: bd.rules,
      kind:
        afterTarget.nodes.length > beforeTarget.nodes.length
          ? "widened"
          : afterTarget.nodes.length < beforeTarget.nodes.length
            ? "narrowed"
            : "shifted",
      before: beforeTarget,
      after: afterTarget,
    });
  }

  return displaced;
}

/** How many syntax kinds a target prints before it is elided. */
const MAX_KINDS = 6;

/** How much of a source line a target prints before it is elided. */
const MAX_TEXT = 90;

function clip(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function describe(target: DirectiveTarget): string {
  const kinds = target.nodes.slice(0, MAX_KINDS).join(", ");
  const more =
    target.nodes.length > MAX_KINDS
      ? `, +${target.nodes.length - MAX_KINDS} more`
      : "";
  const covers = target.nodes.length === 0 ? "nothing" : `${kinds}${more}`;
  return `L${target.line} \`${clip(target.text, MAX_TEXT)}\`\n      covers: ${covers}`;
}

const CONSEQUENCE: Readonly<Record<DirectiveDisplacement["kind"], string>> = {
  widened:
    "FAIL-OPEN — formatting moves code ONTO the suppressed line, so this directive would start hiding violations nobody vetted. Silent: nothing else in the build can detect it.",
  narrowed:
    "FAIL-CLOSED — formatting moves the suppressed code DOWN a line, so the rule fires again, at a line you did not write.",
  shifted:
    "The suppressed line holds different code after formatting than before.",
  lost: "Formatting dropped, added or rewrote the directive comment itself. This should be impossible — report it.",
};

/**
 * The one message both enforcement surfaces print, so the write gate and the
 * check cannot describe the same problem differently.
 *
 * It is written to be actionable WITHOUT re-running anything: the file and line
 * of the directive, the rules it names, and both targets verbatim.
 */
export function formatDirectiveDisplacementReport(
  displaced: readonly DirectiveDisplacement[],
): string {
  const lines = [
    `${displaced.length} positional lint directive(s) would suppress DIFFERENT code once formatted.`,
    "",
    "`eslint-disable-next-line` binds to a line number, not to the code it means, and formatting reflows lines.",
    "",
  ];

  for (const d of displaced) {
    const rules = d.rules.length > 0 ? d.rules.join(", ") : "(all rules)";
    lines.push(
      `${d.file}:${d.line}  [${rules}]  ${d.kind}`,
      `    ${clip(d.directive, MAX_TEXT + 20)}`,
      `    ${CONSEQUENCE[d.kind]}`,
      `    now:       ${describe(d.before)}`,
      `    formatted: ${describe(d.after)}`,
      "",
    );
  }

  lines.push(
    "Fix each site so its suppression is POSITION-INDEPENDENT — a directive prettier can move again is not a fix:",
    "  1. Best: remove the violation, so nothing needs suppressing.",
    "  2. Otherwise wrap the region in block form, which survives any reflow:",
    "       /* eslint-disable <rule> -- <why> */",
    "       …code…",
    "       /* eslint-enable <rule> */",
    "  3. In JSX, (2) is NOT available — a disable/enable pair is not expressible in",
    "     child or attribute position, so a JSX directive is positional or nothing.",
    "     Take (1), or write the target in prettier's OWN shape (short enough that it",
    "     cannot be split, already split as prettier splits it) so the format pass is",
    "     a no-op there and has nothing left to move.",
  );
  return lines.join("\n");
}
