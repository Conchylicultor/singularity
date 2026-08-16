import { z } from "zod";
import {
  decodeHtmlText,
  readHtmlAttr,
} from "@plugins/infra/plugins/html-decode/core";

// The rules that make a folder a prototype, as one pure function.
//
// A prototype is one folder holding a self-contained `index.html`: opening that
// file straight off disk (`file://`, no server) must render it, and nothing is
// shared between prototypes, so an agent starting a new one inherits no design.
//
// Most of that invariant is about *taste* and cannot be machine-checked. What
// CAN be checked is the file-level half — that a folder is shaped the way the
// server serves it, and that it reaches outside itself for nothing.
//
// Two callers, one rule set. Prototypes themselves are user content living in
// `~/.singularity/prototypes/`, so their problems surface in the gallery, on the
// card, where the author is looking. The `_template/` seed IS code, ships in the
// repo, and is checked by `prototypes:self-contained` at push time.

/** One thing wrong with a prototype folder. */
export const PrototypeProblemSchema = z.object({
  /** Path relative to the folder (`index.html`, `assets/`); `""` = the folder. */
  path: z.string(),
  detail: z.string(),
});
export type PrototypeProblem = z.infer<typeof PrototypeProblemSchema>;

/** `index.html` — the one required file, and the one the server serves. */
export const PROTOTYPE_ENTRY_FILE = "index.html";

/** File kinds worth scanning for cross-folder references (source, not bytes). */
const TEXT_EXTENSIONS = new Set([
  ".html",
  ".css",
  ".js",
  ".jsx",
  ".mjs",
  ".json",
  ".md",
  ".txt",
  ".svg",
]);

/** Is this file worth reading as text (⇒ scannable for outward references)? */
export function isScannableFile(fileName: string): boolean {
  const dot = fileName.lastIndexOf(".");
  return TEXT_EXTENSIONS.has(
    dot === -1 ? "" : fileName.slice(dot).toLowerCase(),
  );
}

/** What one folder on disk looks like, read by the caller. */
export interface PrototypeFolder {
  /** The directory slug. */
  dirName: string;
  /** Subdirectory names directly inside it (dot-dirs already dropped). */
  subdirs: string[];
  /** File names directly inside it (dot-files already dropped). */
  files: string[];
  /** Text of every scannable file, keyed by file name. */
  texts: Map<string, string>;
  /** The other prototype folder names this one must not reach into. */
  siblings: string[];
}

function escapeForRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Does `text` reference the folder `name`?
 *
 * Matched at a *path position* — the name followed by `/`, not preceded by a
 * name character — so `href="helix/styles.css"` and `../helix/x` are caught
 * while a class named `.theme-helix` is not. A bare word match would flag every
 * prototype whose directory name is also an ordinary English word.
 */
function referencesFolder(text: string, name: string): boolean {
  return new RegExp(`(^|[^A-Za-z0-9_-])${escapeForRegex(name)}/`).test(text);
}

/** Is there a non-empty `<title>` in this HTML? Same parser `list.ts` uses. */
async function hasTitle(html: string): Promise<boolean> {
  const chunks: string[] = [];
  let done = false;
  const rewriter = new HTMLRewriter().on("title", {
    text(chunk) {
      if (done) return;
      chunks.push(chunk.text);
      if (chunk.lastInTextNode) done = true;
    },
  });
  await rewriter.transform(new Response(html)).text();
  return decodeHtmlText(chunks.join("")).trim() !== "";
}

/**
 * Does this HTML load a Babel-transformed script from a separate file?
 *
 * `<script type="text/babel" src="app.jsx">` is the one violation that LOOKS
 * fine: it works perfectly through the server, and silently renders nothing
 * over `file://`. Babel-standalone fetches a `src` with XHR, and Chrome refuses
 * file→file XHR, so the double-click invariant dies while every HTTP check
 * stays green. JSX therefore goes INLINE, in a `<script type="text/babel">`
 * with no `src`. (A plain non-Babel `<script src="fixtures.js">` is fine —
 * that's an ordinary script load, not XHR.)
 */
async function loadsExternalBabelScript(html: string): Promise<boolean> {
  let found = false;
  const rewriter = new HTMLRewriter().on("script", {
    element(el) {
      const type = readHtmlAttr(el, "type");
      if (type?.trim().toLowerCase() !== "text/babel") return;
      if (readHtmlAttr(el, "src") !== undefined) found = true;
    },
  });
  await rewriter.transform(new Response(html)).text();
  return found;
}

/** Every way `folder` fails the contract. Empty ⇒ it is a well-formed prototype. */
export async function validatePrototypeFolder(
  folder: PrototypeFolder,
): Promise<PrototypeProblem[]> {
  const problems: PrototypeProblem[] = [];

  for (const sub of [...folder.subdirs].sort()) {
    problems.push({
      path: `${sub}/`,
      detail:
        "a prototype folder is flat — the route matches one path segment and has no wildcard, so nothing under a subdirectory can be served",
    });
  }

  if (!folder.files.includes(PROTOTYPE_ENTRY_FILE)) {
    problems.push({
      path: PROTOTYPE_ENTRY_FILE,
      detail: "missing — index.html is the one required file",
    });
  }
  if (folder.files.includes("meta.json")) {
    problems.push({
      path: "meta.json",
      detail:
        "leftover — metadata now comes from index.html (title, meta description, meta prototype-viewport)",
    });
  }

  for (const fileName of [...folder.files].sort()) {
    const text = folder.texts.get(fileName);
    if (text === undefined) continue;

    if (fileName === PROTOTYPE_ENTRY_FILE) {
      if (!(await hasTitle(text))) {
        problems.push({
          path: fileName,
          detail:
            "no non-empty <title> — the gallery card would fall back to the directory name",
        });
      }
      if (await loadsExternalBabelScript(text)) {
        problems.push({
          path: fileName,
          detail:
            'loads a Babel script from a separate file (<script type="text/babel" src="…">) — Babel fetches src with XHR, which Chrome blocks over file://, so the page renders nothing when opened from Finder. Inline the JSX instead',
        });
      }
    }

    if (text.includes("_shared")) {
      problems.push({
        path: fileName,
        detail: "references _shared, which no longer exists",
      });
    }
    if (text.includes("../")) {
      problems.push({
        path: fileName,
        detail: "references `../`, which reaches outside the folder",
      });
    }
    for (const sibling of folder.siblings) {
      if (sibling === folder.dirName) continue;
      if (referencesFolder(text, sibling)) {
        problems.push({
          path: fileName,
          detail: `references another prototype's folder (\`${sibling}/\`)`,
        });
      }
    }
  }

  return problems;
}
