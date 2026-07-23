import { eq } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { hasSecret, setSecret } from "@plugins/infra/plugins/secrets/server";
import { implement, HttpError } from "@plugins/infra/plugins/endpoints/server";
import { generateSshKeypair } from "../../shared/endpoints";
import { _deployServers } from "./tables";
import { generateEd25519Keypair } from "./ssh-keygen";

export const handleGenerateKeypair = implement(
  generateSshKeypair,
  async ({ params, body }) => {
    const [row] = await db
      .select()
      .from(_deployServers)
      .where(eq(_deployServers.id, params.id));
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime guard, no noUncheckedIndexedAccess
    if (!row) throw new HttpError(404, "Not found");

    const configured = await hasSecret({ namespace: "deploy-ssh", key: params.id });
    if (configured && !body.replace) {
      throw new HttpError(
        409,
        "An SSH key is already configured for this server. Pass replace: true to overwrite it.",
      );
    }

    const { privateKey, publicKey } = await generateEd25519Keypair(
      `singularity-deploy-${params.id}`,
    );
    await setSecret({ namespace: "deploy-ssh", key: params.id }, privateKey);
    // The row update also triggers the change-feed push refreshing the live
    // `deploy.servers` resource (the secret write alone would not).
    await db
      .update(_deployServers)
      .set({ sshPublicKey: publicKey, updatedAt: new Date() })
      .where(eq(_deployServers.id, params.id));
    return { publicKey };
  },
);
