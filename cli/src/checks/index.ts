import { migrationsInSync } from "./migrations-in-sync";
import type { Check } from "./types";

export const CHECKS: Check[] = [migrationsInSync];

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
