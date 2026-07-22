import { asPath, asPluginId } from "@plugins/framework/plugins/plugin-id/core";
import { getWorktreeRoot, spawnCaptured } from "@plugins/infra/plugins/spawn/core";
import type { Check } from "@plugins/framework/plugins/tooling/core";
import { dataViews } from "../shared/data-views.generated";

// A DataView's `views` config is stored under
// `config/<asPath(pluginId)>/<id>.jsonc` — the slash form of the DEFINING
// plugin's id (data-view plants the descriptor under that plugin's hierarchy via
// the `pluginId` override) joined with the literal id. Mirror the store path
// exactly: convert the pluginId through `asPath`, keep the id verbatim.
function overridePathFor(pluginId: string, id: string): string {
  return `config/${asPath(asPluginId(pluginId))}/${id}.jsonc`;
}

const check: Check = {
  id: "data-view:configs-authored",
  description:
    "Every DataView must have an authored views config — config is the single source of truth (no code synthesis of default views)",
  // Cheap (one `git ls-files` + the generated manifest) and codegen-coupled:
  // declaring a `defineDataView` is what creates the obligation, so fail at build
  // — including `--skip-checks` builds — not only at push.
  alwaysRun: true,
  // Never cache: the verdict reads the git INDEX / untracked state
  // (`git ls-files --cached --others`), which the content tree-hash cache key
  // does not capture — an index-only change (e.g. a config removed from the
  // index but not the working tree) would otherwise reuse a stale PASS. The
  // check is cheap, so always re-running it is the correct trade.
  cacheSignature: () => null,
  async run() {
    const root = await getWorktreeRoot();

    // The set of config files present in the worktree. `--cached` covers
    // tracked/staged files and `--others --exclude-standard` covers freshly
    // written-but-unstaged ones, so `./singularity build` (which runs before a
    // commit) doesn't fail the instant an agent writes a config. Push's
    // dirty-tree gate guarantees committed-ness at merge time.
    const result = await spawnCaptured(
      ["git", "ls-files", "--others", "--cached", "--exclude-standard", "--", "config/"],
      { cwd: root },
    );
    const present = new Set(
      result.stdout.trim().split("\n").filter(Boolean),
    );

    const missing: string[] = [];
    for (const dv of dataViews) {
      const path = overridePathFor(dv.pluginId, dv.id);
      if (!present.has(path)) missing.push(path);
    }

    if (missing.length === 0) return { ok: true };

    return {
      ok: false,
      message:
        `${missing.length} DataView(s) have no authored views config:\n` +
        missing.map((p) => `    ${p}`).join("\n") +
        "\n\nWhy this is required: config is the single source of truth for a " +
        "DataView's views — there is no code synthesis of default view-instances. " +
        "Each DataView's named views (and their sort/filter) are defined ONLY in a " +
        "committed config file. A DataView with no authored config renders a " +
        '"No views configured" placeholder at runtime.',
      hint:
        "For each missing path, author a config/<plugin>/<id>.jsonc with a " +
        "`views` array of terse `{ name, view }` rows — one per view-type the call " +
        "site enables (its `views={[…]}` whitelist), plus extra named sort/filter " +
        "views where the domain warrants. The `view` blob is `{ type, sort?, " +
        "filter?, …opts }`; `sort` is `{ fieldId, direction }` and `filter` is a " +
        "FilterGroup tree. Copy the leading `// @hash` line from the generated " +
        "<id>.origin.jsonc. See config/apps/sonata/library/sonata.library.jsonc as " +
        "the worked example.",
    };
  },
};

export default check;
