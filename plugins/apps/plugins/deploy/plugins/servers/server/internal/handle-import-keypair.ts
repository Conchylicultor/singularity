import { eq } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { implement, HttpError } from "@plugins/infra/plugins/endpoints/server";
import { importSshPrivateKey } from "../../shared/endpoints";
import { _deployServers } from "./tables";
import { toServer } from "./project-server";
import { derivePublicKey } from "./ssh-keygen";
import { rejectInvalidKey } from "./ssh-key-error";
import { assertReplaceAllowed, storeSshKey } from "./store-ssh-key";

export const handleImportKeypair = implement(
  importSshPrivateKey,
  async ({ params, body }) => {
    const [row] = await db
      .select()
      .from(_deployServers)
      .where(eq(_deployServers.id, params.id));
    if (!row) throw new HttpError(404, "Not found");
    assertReplaceAllowed(row, body.replace);

    // Same comment a generated key gets, so the install command's cleanup
    // clause targets one stable marker whatever the key's provenance.
    const publicKey = await derivePublicKey(
      body.privateKey,
      `singularity-deploy-${params.id}`,
    ).catch(rejectInvalidKey);

    return toServer(
      await storeSshKey(params.id, { privateKey: body.privateKey, publicKey }),
    );
  },
);
