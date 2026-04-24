import { eq } from "drizzle-orm";
import { db } from "@server/db/client";
import { setSecret } from "@plugins/secrets/server";
import { fullKey } from "@plugins/config/shared";
import { config } from "./tables";
import { getRegistry } from "./registry";
import { CONFIG_SECRETS_NAMESPACE } from "./secrets-resource";

/**
 * One-shot migration: for every registered secret field, if a plaintext value
 * is still sitting in the Postgres `config` table (from the pre-secrets era),
 * move it into the secrets store and delete the row. Idempotent on re-run
 * because the row is gone after the first pass.
 *
 * Runs in config's onReady, after buildRegistry() and after `await secretsReady`.
 */
export async function migratePlaintextSecretsToSecretStore(): Promise<void> {
  for (const plugin of getRegistry()) {
    for (const f of plugin.fields) {
      if (f.kind !== "secret") continue;
      const fk = fullKey(plugin.pluginId, f.key);
      const rows = await db.select().from(config).where(eq(config.key, fk));
      if (rows.length === 0) continue;
      const plaintext = rows[0]!.value;
      try {
        if (typeof plaintext === "string" && plaintext) {
          await setSecret(
            { namespace: CONFIG_SECRETS_NAMESPACE, key: fk },
            plaintext,
          );
          console.log(
            `[config] migrated plaintext secret "${fk}" from Postgres into secrets store`,
          );
        }
      } finally {
        await db.delete(config).where(eq(config.key, fk));
      }
    }
  }
}
