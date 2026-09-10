import { readFile, writeFile } from "node:fs/promises";
import { prototypesDir } from "../data-dirs";

/**
 * Rewrite a prototype's `index.html` with its own bytes. The watcher sees the
 * new mtime, bumps `prototypes.version`, and every open frame of the prototype
 * reloads — an agent's edit, minus the edit.
 */
export async function touchPrototype(name: string): Promise<void> {
  const path = prototypesDir.file(name, "index.html");
  await writeFile(path, await readFile(path));
}
