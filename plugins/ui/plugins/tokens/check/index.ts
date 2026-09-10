import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse as parseJsonc } from "jsonc-parser";
import type {
  Check,
  CheckResult,
} from "@plugins/framework/plugins/tooling/core";
import { REPO_ROOT } from "@plugins/infra/plugins/paths/core";

/** Where every token group's config lives: `config/ui/tokens/<group>/`. */
const TOKENS_CONFIG_DIR = join("config", "ui", "tokens");
const BASE_ORIGIN = "config.origin.jsonc";
const APP_SCOPES_DIR = "@app";
const PIN_FILE = "config.jsonc";

/**
 * The token groups, read from the committed base origins rather than from a
 * hand-kept list: a group is a directory under `config/ui/tokens/` whose base
 * origin carries a `preset` field. A new group therefore joins the invariant
 * the moment its origin is committed, and a list here could never fall behind.
 */
function tokenGroups(root: string): string[] {
  const dir = join(root, TOKENS_CONFIG_DIR);
  return readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith("@"))
    .map((d) => d.name)
    .filter((group) => {
      const origin = join(dir, group, BASE_ORIGIN);
      if (!existsSync(origin)) return false;
      const doc = parseJsonc(readFileSync(origin, "utf8")) as unknown;
      return (
        typeof doc === "object" &&
        doc !== null &&
        "preset" in (doc as Record<string, unknown>)
      );
    })
    .sort();
}

/** Every app id that pins at least one group: the union of `@app/<id>` dirs. */
function pinningApps(root: string, groups: string[]): string[] {
  const apps = new Set<string>();
  for (const group of groups) {
    const scopes = join(root, TOKENS_CONFIG_DIR, group, APP_SCOPES_DIR);
    if (!existsSync(scopes)) continue;
    for (const d of readdirSync(scopes, { withFileTypes: true })) {
      if (d.isDirectory()) apps.add(d.name);
    }
  }
  return [...apps].sort();
}

/**
 * An app that pins any token group must pin every token group.
 *
 * A per-app theme is per token GROUP: `config/ui/tokens/<group>/@app/<id>/` pins
 * one group, and a group with no pin follows the desktop. The desktop's value
 * is a runtime user choice (a tweakcn preset, a customizer edit) that lives in
 * `~/.singularity/state/config/`, so the git checkout gives no hint of it. That
 * is how the public website came to pin its palette, shape and type scale and
 * still render in the desktop's system font: the one group nobody pinned
 * inherited the one override nobody could see.
 *
 * Partial ownership is therefore a claim the checkout cannot verify, and this
 * check refuses it: once an app owns one group it owns them all, explicitly —
 * a group the design has no opinion about is pinned to `default` (or whatever
 * it wants) in git, where the value is deterministic, rather than left to
 * whatever the machine happens to be set to.
 *
 * Total by construction: the group set is read from the committed base origins,
 * so a token group added later is covered without an edit here.
 */
export const appThemePinsTotal: Check = {
  id: "tokens:app-theme-pins-total",
  description:
    "An app that pins any token group's preset (config/ui/tokens/<group>/@app/<id>/) pins every group — an unpinned group silently follows the desktop's runtime theme.",
  async run(): Promise<CheckResult> {
    const root = REPO_ROOT;
    const groups = tokenGroups(root);
    if (groups.length === 0) {
      throw new Error(
        `${TOKENS_CONFIG_DIR} holds no token-group base origin with a "preset" field — the token groups are not a legitimately empty set.`,
      );
    }
    const missing: string[] = [];
    for (const app of pinningApps(root, groups)) {
      for (const group of groups) {
        const pin = join(
          TOKENS_CONFIG_DIR,
          group,
          APP_SCOPES_DIR,
          app,
          PIN_FILE,
        );
        if (!existsSync(join(root, pin))) missing.push(pin);
      }
    }
    if (missing.length === 0) return { ok: true };
    return {
      ok: false,
      message: [
        "An app owns its theme whole or not at all: it pins every token group, or none. Missing pins:",
        ...missing.map((p) => `  ${p}`),
        "",
        "Add each file with `\"preset\": \"default\"` (or the preset the design wants) and the `// @hash` line copied from the group's base config.origin.jsonc. A group left unpinned follows the desktop's RUNTIME theme — a user's customizer or tweakcn choice kept in the config state dir, outside the checkout — which git cannot show. That is how the website rendered in the desktop's system font while pinning its palette.",
      ].join("\n"),
    };
  },
};

export default appThemePinsTotal;
