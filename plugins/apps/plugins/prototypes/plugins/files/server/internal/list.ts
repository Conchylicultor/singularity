import { readdir } from "node:fs/promises";
import type { Dirent } from "node:fs";
import { join } from "node:path";
import {
  decodeHtmlText,
  readHtmlAttr,
} from "@plugins/infra/plugins/html-decode/core";
import type { PrototypeMeta } from "../../core";
import { PROTOTYPES_DIR } from "./paths";

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
 * Read every `prototypes/<name>/index.html` into a `PrototypeMeta[]`, skipping
 * `_`-prefixed dirs (`_template` is a seed, not a prototype) and dot-dirs. The
 * dir name is the `name`; the display `title` falls back to it when the HTML
 * declares none. A directory whose HTML can't be read is skipped and logged —
 * the gallery degrades rather than crashing on a half-authored mock.
 */
export async function listPrototypeMetas(): Promise<PrototypeMeta[]> {
  let entries: Dirent<string>[];
  try {
    entries = await readdir(PROTOTYPES_DIR, { withFileTypes: true });
  } catch (err) {
    // The prototypes/ dir may not exist yet — that's the one expected failure.
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }

  const metas: PrototypeMeta[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const dirName = entry.name;
    if (dirName.startsWith("_") || dirName.startsWith(".")) continue;

    const indexPath = join(PROTOTYPES_DIR, dirName, "index.html");
    const file = Bun.file(indexPath);
    if (!(await file.exists())) continue;

    let parsed: HtmlMeta;
    try {
      parsed = await parseHtmlMeta(await file.text());
    } catch (err) {
      console.error(`[prototypes] could not read ${indexPath}`, err);
      continue;
    }

    metas.push({
      name: dirName,
      title: parsed.title === "" ? dirName : parsed.title,
      blurb: parsed.blurb,
      viewport: parsed.viewport,
    });
  }

  metas.sort((a, b) => a.name.localeCompare(b.name));
  return metas;
}
