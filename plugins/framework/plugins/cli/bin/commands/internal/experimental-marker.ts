// The red "experimental" frame that marks an agent-worktree deploy.
//
// Whether an app is experimental is a fact the BUILD knows and the browser
// cannot infer. `<name>.localhost` is the namespace grammar for git-worktree
// deploys, for composition namespaces (compose-serve), and for local release
// previews alike — so the old client-side rule ("any subdomain that isn't
// `singularity`") painted the frame on compositions and releases too.
//
// The producer stamps it instead: a dist is experimental only because
// `./singularity build` said so. Every other producer (compose-serve,
// build-composition, the release/tauri bundles) is clean by DEFAULT rather than
// by exclusion, so a new way of shipping a dist can never inherit the frame by
// accident.
//
// The stamp is an inline head script that adds the `.experimental` class to
// <html> — the same JS-sets / CSS-styles split as `.dark`. The rule itself
// lives in ui-kit's `theme/app.css`.

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const STAMP = '<script>document.documentElement.classList.add("experimental");</script>';

/**
 * Mark a staged dist as an experimental (agent-worktree) deploy. Runs on the
 * staging dir before the atomic publish, so it covers BOTH frontend modes: the
 * artifact composer and the monolithic vite build write the same `index.html`
 * there.
 */
export function stampExperimentalMarker(distDir: string): void {
  const path = resolve(distDir, "index.html");
  const html = readFileSync(path, "utf8");
  if (html.includes(STAMP)) return;
  if (!html.includes("</head>")) {
    throw new Error(`experimental marker: no </head> in ${path}`);
  }
  writeFileSync(path, html.replace("</head>", `    ${STAMP}\n  </head>`));
}
