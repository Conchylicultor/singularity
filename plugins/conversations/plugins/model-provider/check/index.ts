import type { Check } from "@plugins/framework/plugins/tooling/core";
import { grepCode } from "@plugins/framework/plugins/tooling/plugins/checks/core";
import { getWorktreeRoot } from "@plugins/infra/plugins/spawn/core";
import { MODEL_TIERS } from "../core";

// Derived from MODEL_TIERS, never hand-listed: a tier added to the registry is
// covered by this check the moment it exists. The hand-written alternation this
// replaced had gone stale — it named opus/sonnet/haiku and silently let every
// `claude-fable-*` flag through.
const TIER_ALTERNATION = MODEL_TIERS.join("|");
const FLAG_PATTERN = `claude-(${TIER_ALTERNATION})-[0-9]`;

const check: Check = {
  id: "model-provider:no-raw-model-flags",
  description: `Claude model CLI flags (${MODEL_TIERS.map((t) => `claude-${t}-*`).join(", ")}) must be resolved through the model-provider registry, never hardcoded`,
  exemptable: {
    "model-provider:no-raw-model-flags":
      "spells a `claude-<tier>-<n>` model CLI flag instead of deriving it from the registry",
  },
  outOfScope: ["research"],
  async run(ctx) {
    const root = await getWorktreeRoot();
    const matches = await grepCode({
      root,
      pattern: new RegExp(FLAG_PATTERN),
      grepArg: FLAG_PATTERN,
      maskStrings: false,
    });

    const exempt = await ctx.exempt("model-provider:no-raw-model-flags");
    const offenders = matches
      .filter((m) => !exempt.skips(m.path))
      .map((m) => `${m.path}:${m.line}:${m.text}`);

    if (offenders.length === 0) return { ok: true };

    return {
      ok: false,
      message: `hardcoded Claude model CLI flag found in ${offenders.length} place(s):\n    ${offenders.join("\n    ")}`,
      hint: "Derive CLI flags from a model id with cliFlagFor()/modelMeta() (model-provider/core/registry.ts) — never hardcode claude-* flags. A file that must spell one declares it in its own plugin's exempt/index.ts (rule model-provider:no-raw-model-flags).",
    };
  },
};

export default check;
