import { join } from "node:path";
import { PROTOTYPES_DIR } from "@plugins/infra/plugins/paths/server";
import { fingerprintDir } from "./hash-dir";

/** The content fingerprint of one prototype folder — the thumbnail cache key. */
export async function fingerprintPrototype(name: string): Promise<string> {
  return fingerprintDir(join(PROTOTYPES_DIR, name));
}
