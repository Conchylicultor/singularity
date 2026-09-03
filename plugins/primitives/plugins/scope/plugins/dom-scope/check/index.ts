import type { Check } from "@plugins/framework/plugins/tooling/core";
import { grepCode } from "@plugins/framework/plugins/tooling/plugins/checks/core";
import { getWorktreeRoot } from "@plugins/infra/plugins/spawn/core";

/**
 * A DOM attribute that a declared `defineDomScope` bounds may not be looked up
 * across the whole document.
 *
 * The banned set is DERIVED from the declarations, not maintained here: a scope
 * states its own `bounds`, and declaring one is what closes the loophole for its
 * attributes everywhere. Adding a scope adds enforcement, with no list for anyone
 * to remember to extend.
 *
 * A blanket "no `document.querySelector*` in web code" rule is the wrong shape —
 * of the ~18 production call sites in this repo exactly one was a hazard, and the
 * rest are correct: boot mounts, `<head>` style and font management, and
 * `tab-drag-overlay`'s `[data-floating-window-id="…"]`, which is document-wide on
 * purpose because its selector pins a globally unique id. Safe-vs-unsafe turns on
 * whether the selector pins a unique id, which is not statically decidable, so
 * such a rule would need an allowlist of correct code — enforcing less than it
 * looks. Bounded attributes are decidable, because their scope says so.
 *
 * DETECTION is deliberately narrow and line-local: a `document.<lookup>(` whose
 * own line also names a bounded attribute. A selector assembled across lines or
 * built from a variable is missed. A false negative misses an evasive case; a
 * false positive fails the build.
 *
 * `e2e/` and test files are exempt — they drive the whole deployed document from
 * outside, which is the one place a document-wide scan is the right question (the
 * two-pane fixtures deliberately scan the document to prove the hazard is real).
 */
const LOOKUPS =
  "querySelector|querySelectorAll|getElementById|getElementsByClassName|getElementsByTagName";

/** `e2e` scripts and test files ask about the whole document by nature. */
const EXEMPT = /(?:^|\/)(?:e2e|__tests__)\/|\.test\.tsx?$/;

/** `bounds: ["data-a", "data-b"]` — the array literal, however it is wrapped. */
const BOUNDS_BLOCK = /bounds\s*:\s*\[([^\]]*)\]/g;
const QUOTED = /["'`]([^"'`]+)["'`]/g;

const check: Check = {
  id: "dom-scope:bounded-attr-not-document-wide",
  inputKeyed: true,
  description:
    "A DOM attribute bounded by a declared dom-scope is never looked up on `document`",
  async run() {
    const root = await getWorktreeRoot();

    // 1. Collect the declared bounds. `maskStrings: false` because the attribute
    //    names ARE string literals; comments are still masked.
    const declarations = await grepCode({
      root,
      pattern: /defineDomScope\s*(?:<[^>]*>)?\s*\(/,
      grepArg: "defineDomScope",
      fixed: true,
      maskStrings: false,
    });

    const bounded = new Map<string, string>(); // attribute -> declaring file
    for (const decl of declarations) {
      if (EXEMPT.test(decl.path)) continue;
      const src = await Bun.file(`${root}/${decl.path}`).text();
      for (const block of src.matchAll(BOUNDS_BLOCK)) {
        for (const quoted of (block[1] ?? "").matchAll(QUOTED)) {
          const attr = quoted[1];
          if (attr !== undefined && attr !== "") bounded.set(attr, decl.path);
        }
      }
    }
    if (bounded.size === 0) return { ok: true };

    // 2. Any document-rooted lookup naming one of them.
    const lookups = await grepCode({
      root,
      pattern: new RegExp(String.raw`document\s*\.\s*(?:${LOOKUPS})\s*\(`),
      grepArg: "document.",
      fixed: false,
      maskStrings: false,
    });

    const offenders: string[] = [];
    for (const hit of lookups) {
      if (EXEMPT.test(hit.path)) continue;
      for (const [attr, declaredIn] of bounded) {
        if (!hit.text.includes(attr)) continue;
        offenders.push(
          `${hit.path}:${hit.line} looks up \`${attr}\` on \`document\` ` +
            `(bounded by the scope declared in ${declaredIn})\n    ${hit.text.trim()}`,
        );
        break;
      }
    }
    if (offenders.length === 0) return { ok: true };

    return {
      ok: false,
      message:
        `${offenders.length} document-wide lookup(s) of an attribute a dom-scope bounds:\n  ` +
        offenders.join("\n  "),
      hint:
        "The app mounts the same surface more than once at a time — two panes, " +
        "two floating windows, or two tabs (every open tab stays mounted, the " +
        "unfocused ones display:none). `document.querySelector` returns the " +
        "FIRST match in DOM order, so this can answer with another instance's " +
        "element — or a hidden tab's, whose rects are all zero. Read the owning " +
        "scope's root instead (`scope.useRoot()`, then query the root), or pass " +
        "the root into the helper that queries it.",
    };
  },
};

export default check;
