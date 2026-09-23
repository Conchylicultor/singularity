import type {
  Check,
  CheckContext,
  CheckResult,
} from "@plugins/framework/plugins/tooling/core";
import { findPluginRefs, resolveRelativeRef } from "../core";
import type { RelativeRef } from "../core";

const MAX_SHOWN = 50;

/**
 * Dated research records are a log, not live docs: what they link to is
 * legitimately deleted later. Their OWN links are not checked; a link INTO
 * research from anywhere else is.
 */
const UNCHECKED_SOURCE_DIRS = ["research/"];

/**
 * Every relative link in a tracked markdown file, and every relative CSS
 * `@source` / `@import`, points at something that exists. A CSS glob's static
 * prefix (the directory before its first glob segment) must exist — a glob
 * whose prefix is gone matches nothing and fails silently otherwise.
 */
const check: Check = {
  id: "plugin-refs:relative-links-resolve",
  description:
    "relative markdown links and CSS @source/@import paths resolve to an existing file or directory",
  async run(ctx: CheckContext): Promise<CheckResult> {
    const repo = await ctx.repo();
    const exists = (path: string) =>
      path === "" || repo.has(path) || repo.under(path).length > 0;

    const broken: Array<{ ref: RelativeRef; why: string }> = [];
    for (const ref of await findPluginRefs(repo, { kinds: ["relative"] })) {
      if (ref.kind !== "relative") continue;
      if (UNCHECKED_SOURCE_DIRS.some((d) => ref.file.startsWith(d))) continue;
      const resolved = resolveRelativeRef(ref);
      if (resolved.kind === "outside") {
        broken.push({ ref, why: "climbs out of the repo" });
      } else if (!exists(resolved.staticPath)) {
        broken.push({
          ref,
          why: ref.glob
            ? `glob prefix "${resolved.staticPath}" does not exist`
            : `"${resolved.target}" does not exist`,
        });
      }
    }

    if (broken.length === 0) return { ok: true };
    const shown = broken
      .slice(0, MAX_SHOWN)
      .map(
        ({ ref, why }) => `  ${ref.file}:${ref.line} — ${ref.value} (${why})`,
      );
    const more =
      broken.length > MAX_SHOWN
        ? `\n  … +${broken.length - MAX_SHOWN} more`
        : "";
    return {
      ok: false,
      message: `${broken.length} broken relative link(s):\n${shown.join("\n")}${more}`,
      hint:
        "Point each link at the file's current location (paths are relative to the file the link is in). " +
        "If the target is truly gone, drop the link and keep its text.",
    };
  },
};

export default check;
