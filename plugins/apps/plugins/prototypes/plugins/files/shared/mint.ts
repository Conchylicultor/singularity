import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { prototypesDir } from "../data-dirs";
import { newPrototypeId } from "../core/id";
import { PROTOTYPE_ENTRY_FILE } from "../core/validate";
import { copyFolderOnce, seededTemplateDir } from "./template";

// THE one way a prototype comes into existence.
//
// Before this, a prototype folder was created by an agent running
// `cp -R _template <name>`: the naming, the flat-folder rule and the copy were
// all the agent's to get right, and there was no write path on the server at
// all. Three surfaces now call this instead — the gallery's New prototype
// button (before it launches the agent), `./singularity prototype new`, and any
// future one — so the id, the template it starts from and the atomic copy are
// decided once here rather than re-derived per caller.
//
// `shared/`, not `core/`, because it touches `fs`; not `server/`, because the
// CLI's whole value is working with no backend running.

/**
 * How many ids to draw before giving up. A collision needs two mints in the same
 * SECOND to land on the same 1-in-1.7M suffix, so one retry is already
 * theatrical; the bound exists so a genuinely broken filesystem (a `dest` that
 * always looks present) fails loudly instead of spinning forever.
 */
const MAX_MINT_ATTEMPTS = 8;

/**
 * Create a new prototype: a freshly minted id'd folder in the prototypes data
 * dir, holding a copy of the blank template.
 *
 * `title` stamps the copy's `<title>`, which is where every surface reads a
 * prototype's display name from — there is no `meta.json`. Omit it and the card
 * reads the template's own "Untitled prototype" until the agent writes, which is
 * honest: the prototype does exist.
 *
 * Returns the id (which IS the folder name, and the URL segment) and its
 * absolute path. Throws on failure — there is no id-shaped empty value a caller
 * could mistake for a mint.
 */
export async function mintPrototype(
  opts: { title?: string } = {},
): Promise<{ id: string; dir: string }> {
  const template = await seededTemplateDir();

  for (let attempt = 0; attempt < MAX_MINT_ATTEMPTS; attempt++) {
    const id = newPrototypeId();
    const dir = prototypesDir.file(id);
    // A name collision re-mints rather than throwing: the caller asked for a
    // prototype, not for this particular id, and the folder that is already
    // there belongs to somebody else's mint.
    if ((await copyFolderOnce(template, dir)) === "already-there") continue;

    if (opts.title !== undefined) await stampTitle(dir, opts.title);
    return { id, dir };
  }

  throw new Error(
    `could not mint a prototype id after ${MAX_MINT_ATTEMPTS} attempts — every folder drawn already exists under ${prototypesDir.path}`,
  );
}

/**
 * Rewrite the `<title>` of a freshly copied prototype's `index.html`.
 *
 * Streamed through `HTMLRewriter` — the same parser the lister reads metadata
 * with — so everything the template says other than its title survives byte for
 * byte, and the text is escaped on the way in rather than interpolated into
 * markup.
 *
 * A template with no `<title>` throws instead of quietly writing the file back
 * unchanged: the caller passed a name and would otherwise get a card reading
 * "Untitled prototype" with nothing to explain it.
 */
async function stampTitle(dir: string, title: string): Promise<void> {
  const indexHtml = join(dir, PROTOTYPE_ENTRY_FILE);
  if (!existsSync(indexHtml)) {
    throw new Error(
      `cannot stamp a title: ${indexHtml} is missing — the template is not a valid prototype`,
    );
  }

  let found = false;
  const rewriter = new HTMLRewriter().on("title", {
    element(el) {
      found = true;
      el.setInnerContent(title);
    },
  });
  const rewritten = await rewriter
    .transform(new Response(await readFile(indexHtml, "utf8")))
    .text();
  if (!found) {
    throw new Error(
      `cannot stamp a title: ${indexHtml} has no <title> element to write into`,
    );
  }

  await writeFile(indexHtml, rewritten, "utf8");
}
