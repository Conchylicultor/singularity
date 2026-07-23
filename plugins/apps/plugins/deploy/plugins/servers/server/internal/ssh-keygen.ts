import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnExpectOk } from "@plugins/infra/plugins/spawn/core";

/**
 * Generates an ed25519 keypair by shelling out to `ssh-keygen` (present on
 * macOS/Linux), so both halves are in canonical OpenSSH format — the private
 * key is what an ssh client consumes, the public key is the exact
 * `ssh-ed25519 AAAA… comment` line an authorized_keys entry expects.
 * Throws (SpawnFailedError) on failure — never returns a partial pair.
 */
export async function generateEd25519Keypair(
  comment: string,
): Promise<{ privateKey: string; publicKey: string }> {
  const dir = await mkdtemp(join(tmpdir(), "sg-deploy-keygen-"));
  try {
    const keyPath = join(dir, "id_ed25519");
    await spawnExpectOk([
      "ssh-keygen",
      "-t",
      "ed25519",
      "-f",
      keyPath,
      "-N",
      "",
      "-C",
      comment,
    ]);
    const [privateKey, publicKey] = await Promise.all([
      readFile(keyPath, "utf8"),
      readFile(`${keyPath}.pub`, "utf8"),
    ]);
    return { privateKey, publicKey: publicKey.trim() };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
