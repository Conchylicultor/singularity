// Reading the whole prototypes tree into `PrototypeMeta[]` — THE one
// implementation, for the two processes that need it.
//
// `shared/`, not `server/`, for the reason `read-folder.ts` and `mint.ts` are:
// `./singularity prototype list` must answer with no backend running, and a CLI
// process cannot import a server barrel's boot-time machinery to do it. Nothing
// in here was ever server-specific — it reads the data dir and parses HTML — so
// the move is a relocation, not a fork. `server/internal/list.ts` re-exports it,
// which is why the server barrel's API is unchanged.

import {
  decodeHtmlText,
  readHtmlAttr,
} from "@plugins/infra/plugins/html-decode/core";
import {
  PROTOTYPE_ENTRY_FILE,
  UNTITLED_PROTOTYPE,
  validatePrototypeFolder,
  type PrototypeFolder,
  type PrototypeMeta,
  type PrototypeProblem,
} from "../core";
import { listPrototypeDirNames, readPrototypeFolder } from "./read-folder";
import { prototypesDir } from "../data-dirs";

/** Canvas size used when the HTML declares no `prototype-viewport`. */
const DEFAULT_VIEWPORT = { w: 1280, h: 800 } as const;

/** `1320x868` → `{ w: 1320, h: 868 }`; anything else → `null` (⇒ default). */
function parseViewport(raw: string): { w: number; h: number } | null {
  const match = /^\s*(\d+)\s*[xX]\s*(\d+)\s*$/.exec(raw);
  if (!match) return null;
  const w = Number(match[1]);
  const h = Number(match[2]);
  if (w <= 0 || h <= 0) return null;
  return { w, h };
}

/** What `index.html` declares about itself, before defaults are folded in. */
interface HtmlMeta {
  title: string;
  blurb: string;
  viewport: { w: number; h: number };
}

/**
 * Pull `<title>` and the two `<meta>` tags out of a prototype's `index.html`.
 *
 * Streaming-parsed with `HTMLRewriter`, which hands back RAW markup — every
 * value it yields is decoded exactly once through `html-decode` (attributes via
 * `readHtmlAttr`, text accumulated first and decoded at the end, because a
 * character reference can straddle two chunks).
 *
 * First occurrence wins for each tag: a `<title>` further down the document
 * (inside an inline `<svg>`, say) is not the document's title.
 */
async function parseHtmlMeta(html: string): Promise<HtmlMeta> {
  const titleChunks: string[] = [];
  let titleDone = false;
  let blurbRaw: string | undefined;
  let viewportRaw: string | undefined;

  const rewriter = new HTMLRewriter()
    .on("title", {
      text(chunk) {
        if (titleDone) return;
        titleChunks.push(chunk.text);
        if (chunk.lastInTextNode) titleDone = true;
      },
    })
    .on("meta", {
      element(el) {
        const name = readHtmlAttr(el, "name");
        if (name === "description") {
          blurbRaw ??= readHtmlAttr(el, "content");
        } else if (name === "prototype-viewport") {
          viewportRaw ??= readHtmlAttr(el, "content");
        }
      },
    });

  // The rewriter only runs its handlers as the body is consumed.
  await rewriter.transform(new Response(html)).text();

  const viewport =
    viewportRaw === undefined ? null : parseViewport(viewportRaw.trim());

  return {
    title: decodeHtmlText(titleChunks.join("")).trim(),
    blurb: (blurbRaw ?? "").trim(),
    viewport: viewport ?? { ...DEFAULT_VIEWPORT },
  };
}

/**
 * Read every prototype under the host-global prototypes dir into a
 * `PrototypeMeta[]`, skipping `_`-prefixed dirs (`_template` is a seed, not a
 * prototype) and dot-dirs. The dir name is the `name`; the display `title`
 * falls back to it when the HTML declares none.
 *
 * A malformed folder is listed, not hidden: its `problems` say what is wrong and
 * the gallery card shows them. Silently dropping it is how an author ends up
 * staring at a gallery that doesn't contain the thing they just wrote.
 */
export async function listPrototypeMetas(): Promise<PrototypeMeta[]> {
  const dirNames = await listPrototypeDirNames(prototypesDir.path);

  const metas: PrototypeMeta[] = [];
  for (const dirName of dirNames) {
    metas.push(await readMeta(dirName, dirNames));
  }
  return metas;
}

async function readMeta(
  dirName: string,
  siblings: string[],
): Promise<PrototypeMeta> {
  const base = {
    name: dirName,
    // NOT `dirName`: that is a minted id, which names nothing to a reader. See
    // UNTITLED_PROTOTYPE.
    title: UNTITLED_PROTOTYPE,
    blurb: "",
    viewport: { ...DEFAULT_VIEWPORT },
  };

  let folder: PrototypeFolder;
  try {
    folder = await readPrototypeFolder(prototypesDir.path, dirName, siblings);
  } catch (err) {
    // One unreadable folder must not take the whole gallery down with it — but
    // it is reported on its own card rather than swallowed.
    return {
      ...base,
      problems: [{ path: "", detail: `could not be read: ${String(err)}` }],
    };
  }

  const problems: PrototypeProblem[] = await validatePrototypeFolder(folder);
  const html = folder.texts.get(PROTOTYPE_ENTRY_FILE);
  if (html === undefined) return { ...base, problems };

  const parsed = await parseHtmlMeta(html);
  return {
    ...base,
    title: parsed.title === "" ? UNTITLED_PROTOTYPE : parsed.title,
    blurb: parsed.blurb,
    viewport: parsed.viewport,
    problems,
  };
}
