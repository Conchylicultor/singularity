import { prototypesDir } from "@plugins/apps/plugins/prototypes/plugins/files/server";
import { fingerprintDir } from "./hash-dir";

/** The content fingerprint of one prototype folder — the thumbnail cache key. */
export async function fingerprintPrototype(name: string): Promise<string> {
  return fingerprintDir(prototypesDir.file(name));
}
