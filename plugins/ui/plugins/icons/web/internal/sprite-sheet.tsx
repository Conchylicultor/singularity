import { useSprites } from "./sprite-store";
import { useRuntimeSymbolChunks } from "./runtime-symbol-store";

/**
 * The page's sprites, inline: a hidden container holding one `<svg>` per
 * loaded sprite, so every `<use href="#id">` resolves in-document — inside
 * portals and Fullscreen API subtrees too, which an external `file.svg#id`
 * reference would not reach without a second fetch per document.
 *
 * `hidden` (display: none) is safe here: a `<use>` of a `<symbol>` under a
 * display-none ancestor still renders, and our symbols hold plain paths — no
 * gradient, mask or filter, the references that do break there.
 *
 * Mounted once, by the sprite host.
 */
export function IconSpriteSheet() {
  const sprites = useSprites();
  const runtime = useRuntimeSymbolChunks();
  return (
    <div hidden data-icon-sprites="">
      {sprites.map(([key, markup]) => (
        <div
          key={key}
          data-sprite={key}
          // The markup is the server's own `<svg>` of `<symbol>`s, built from the
          // Iconify JSON in node_modules — never user input.
          dangerouslySetInnerHTML={{ __html: markup }}
        />
      ))}
      {runtime.map(([chunkId, markup]) => (
        <div
          key={chunkId}
          data-runtime-symbols={chunkId}
          // The server's own `<svg>` of `<symbol>`s, built from the Iconify JSON
          // for names it checked against the installed sets — never user markup.
          dangerouslySetInnerHTML={{ __html: markup }}
        />
      ))}
    </div>
  );
}
