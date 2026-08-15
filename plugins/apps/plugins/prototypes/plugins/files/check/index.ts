import type { Dirent } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type {
  Check,
  CheckResult,
} from "@plugins/framework/plugins/tooling/core";
import {
  decodeHtmlText,
  readHtmlAttr,
} from "@plugins/infra/plugins/html-decode/core";
import { getWorktreeRoot } from "@plugins/infra/plugins/spawn/core";

// The `prototypes:self-contained` check.
//
// A prototype is one folder holding a self-contained `index.html`: opening that
// file straight off disk (`file://`, no server) must render it. Nothing is
// shared between prototypes, so an agent starting a new one inherits no design.
//
// Most of that invariant is about *taste* and cannot be machine-checked. What
// CAN be checked is the file-level half — that a folder is shaped the way the
// server serves it, and that it reaches outside itself for nothing.

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

function extensionOf(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  return dot === -1 ? "" : fileName.slice(dot).toLowerCase();
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
 * fine: it works perfectly through this server, and silently renders nothing
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

interface Problem {
  path: string;
  detail: string;
}

const check: Check = {
  id: "prototypes:self-contained",
  description:
    "every prototypes/<name>/ is a flat folder with a titled, self-contained index.html that references no sibling prototype",
  async run(): Promise<CheckResult> {
    const root = await getWorktreeRoot();
    const prototypesDir = join(root, "prototypes");

    let entries: Dirent<string>[];
    try {
      entries = await readdir(prototypesDir, { withFileTypes: true });
    } catch (err) {
      // No prototypes/ directory at all is a legitimate state (nothing to check).
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return { ok: true };
      throw err;
    }

    const problems: Problem[] = [];

    // Directories we walk. `_template/` is checked like a prototype (the seed
    // every new prototype is copied from must itself be self-contained) but is
    // NOT a prototype, so its name is not a forbidden reference target.
    const checkedDirs: string[] = [];
    const prototypeNames: string[] = [];

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const name = entry.name;
      if (name.startsWith(".")) continue;
      if (name === "_shared") {
        problems.push({
          path: "prototypes/_shared/",
          detail:
            "the shared directory no longer exists in this contract — nothing is shared between prototypes",
        });
        continue;
      }
      if (name === "_template") {
        checkedDirs.push(name);
        continue;
      }
      if (name.startsWith("_")) continue;
      checkedDirs.push(name);
      prototypeNames.push(name);
    }

    // Sorted so a failure reads the same on every machine.
    checkedDirs.sort();
    for (const dirName of checkedDirs) {
      const dirAbs = join(prototypesDir, dirName);
      const dirRel = `prototypes/${dirName}`;
      const dirEntries = await readdir(dirAbs, { withFileTypes: true });

      const fileNames: string[] = [];
      for (const entry of dirEntries) {
        if (entry.name.startsWith(".")) continue;
        if (entry.isDirectory()) {
          problems.push({
            path: `${dirRel}/${entry.name}/`,
            detail:
              "a prototype folder is flat — the route matches one path segment and has no wildcard, so nothing under a subdirectory can be served",
          });
          continue;
        }
        fileNames.push(entry.name);
      }
      fileNames.sort();

      if (!fileNames.includes("index.html")) {
        problems.push({
          path: `${dirRel}/index.html`,
          detail: "missing — index.html is the one required file",
        });
      }
      if (fileNames.includes("meta.json")) {
        problems.push({
          path: `${dirRel}/meta.json`,
          detail:
            "leftover — metadata now comes from index.html (title, meta description, meta prototype-viewport)",
        });
      }

      // The sibling names this folder must not reach for.
      const siblings = prototypeNames.filter((n) => n !== dirName);

      for (const fileName of fileNames) {
        if (!TEXT_EXTENSIONS.has(extensionOf(fileName))) continue;
        const fileRel = `${dirRel}/${fileName}`;
        const text = await readFile(join(dirAbs, fileName), "utf8");

        if (fileName === "index.html") {
          if (!(await hasTitle(text))) {
            problems.push({
              path: fileRel,
              detail:
                "no non-empty <title> — the gallery card would fall back to the directory name",
            });
          }
          if (await loadsExternalBabelScript(text)) {
            problems.push({
              path: fileRel,
              detail:
                'loads a Babel script from a separate file (<script type="text/babel" src="…">) — Babel fetches src with XHR, which Chrome blocks over file://, so the page renders nothing when opened from Finder. Inline the JSX instead',
            });
          }
        }

        if (text.includes("_shared")) {
          problems.push({
            path: fileRel,
            detail: "references _shared, which no longer exists",
          });
        }
        if (text.includes("../")) {
          problems.push({
            path: fileRel,
            detail: "references `../`, which reaches outside the folder",
          });
        }
        for (const sibling of siblings) {
          if (referencesFolder(text, sibling)) {
            problems.push({
              path: fileRel,
              detail: `references another prototype's folder (\`${sibling}/\`)`,
            });
          }
        }
      }
    }

    if (problems.length === 0) return { ok: true };

    return {
      ok: false,
      message: `${problems.length} prototype problem${problems.length === 1 ? "" : "s"}:\n${problems
        .map((p) => `  ${p.path} — ${p.detail}`)
        .join("\n")}`,
      hint: "A prototype is one folder with a self-contained index.html: flat (no subdirectories), no meta.json, and no reference reaching outside itself. Opening prototypes/<name>/index.html from Finder must render it. Start from prototypes/_template/.",
    };
  },
};

export default check;
