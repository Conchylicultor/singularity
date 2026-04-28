import { conversationTrailer } from "./conversation-trailer";
import { migrationsInSync } from "./migrations-in-sync";
import { noRawEventSource } from "./no-raw-event-source";
import { noRawSse } from "./no-raw-sse";
import { noPluginImportsInCore } from "./no-plugin-imports-in-core";
import { noPluginWorkspaceDeps } from "./no-plugin-workspace-deps";
import { noRawWebsocket } from "./no-raw-websocket";
import { noRelativeServerImports } from "./no-relative-server-imports";
import { noUseResourceCast } from "./no-use-resource-cast";
import { pluginBoundaries } from "./plugin-boundaries";
import { typescript } from "./typescript";
import { pluginsDocInSync } from "./plugins-doc-in-sync";
import { pluginsHaveClaudeMd } from "./plugins-have-claudemd";
import { snapshotChainIntact } from "./snapshot-chain-intact";
import type { Check } from "./types";

export const CHECKS: Check[] = [
  conversationTrailer,
  migrationsInSync,
  snapshotChainIntact,
  pluginsDocInSync,
  pluginsHaveClaudeMd,
  pluginBoundaries,
  noPluginImportsInCore,
  noPluginWorkspaceDeps,
  noRawEventSource,
  noRawSse,
  noRawWebsocket,
  noRelativeServerImports,
  noUseResourceCast,
  typescript,
];

export type { Check, CheckResult } from "./types";

export async function runChecks(ids?: string[]): Promise<boolean> {
  const selected = ids && ids.length > 0
    ? CHECKS.filter((c) => ids.includes(c.id))
    : CHECKS;

  if (ids && selected.length !== ids.length) {
    const known = new Set(CHECKS.map((c) => c.id));
    const unknown = ids.filter((id) => !known.has(id));
    console.error(`Unknown check(s): ${unknown.join(", ")}`);
    return false;
  }

  let allOk = true;
  for (const check of selected) {
    process.stdout.write(`• ${check.id} ... `);
    const result = await check.run();
    if (result.ok) {
      console.log("ok");
    } else {
      allOk = false;
      console.log("FAIL");
      console.error(`  ${result.message}`);
      if (result.hint) console.error(`  hint: ${result.hint}`);
    }
  }
  return allOk;
}
