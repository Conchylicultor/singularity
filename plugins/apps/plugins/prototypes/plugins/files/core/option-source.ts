import { readHtmlAttr } from "@plugins/infra/plugins/html-decode/core";
import {
  foldOptions,
  type OptionSource,
  type PrototypeOption,
} from "./options";

/** A page's valid options and the problem detail of every line that is not one. */
export async function readPrototypeOptions(
  html: string,
): Promise<{ options: PrototypeOption[]; problems: string[] }> {
  return foldOptions(await readOptionSource(html));
}

/**
 * Read the option declarations out of a prototype's HTML: every
 * `<meta name="prototype-option">` content, in document order, and the `data-*`
 * attributes on `<html>` (the defaults). The ONE read — the gallery list, the
 * folder validator and the server's stamping all go through it, so none of them
 * can disagree about what a page declares.
 *
 * Decoded exactly once via `html-decode`, like every HTMLRewriter read.
 */
export async function readOptionSource(html: string): Promise<OptionSource> {
  const declarations: string[] = [];
  const htmlData: Record<string, string> = {};
  let sawHtml = false;

  const rewriter = new HTMLRewriter()
    .on("html", {
      element(el) {
        // Only the document element: an inline `<svg>` cannot hold one, but a
        // second literal `<html>` in the source is not the page's root.
        if (sawHtml) return;
        sawHtml = true;
        for (const [attr] of el.attributes) {
          if (!attr.startsWith("data-")) continue;
          const value = readHtmlAttr(el, attr);
          if (value !== undefined) htmlData[attr.slice("data-".length)] = value;
        }
      },
    })
    .on("meta", {
      element(el) {
        if (readHtmlAttr(el, "name") !== "prototype-option") return;
        declarations.push(readHtmlAttr(el, "content") ?? "");
      },
    });

  // The rewriter only runs its handlers as the body is consumed.
  await rewriter.transform(new Response(html)).text();
  return { declarations, htmlData };
}
