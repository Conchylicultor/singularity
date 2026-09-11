/** One image the viewer can show. */
export interface ViewerImage {
  /** A `data:`, `blob:` or http(s) URL. Decides the file actions — see
   *  `imageCapabilities` in this plugin's `core/`. */
  src: string;
  /** Shown in the viewer's top bar, and the download's file name. */
  name: string;
  /** Where the image came from, as a short chip in the top bar: "Read",
   *  "Pasted", "Markdown", "Attached", … Omitted = no chip. */
  sourceLabel?: string;
  /** Alt text. Defaults to `name`. */
  alt?: string;
  /** Natural size, when the caller already knows it. Otherwise it is measured
   *  once the image loads. */
  width?: number;
  height?: number;
}

/** "Is this still the picture on screen?" — two entries with the same address
 *  and name are the same picture, whatever object carries them. (Compared
 *  field by field rather than through a concatenated key: a pasted image's
 *  `src` is a multi-megabyte data: URI.) */
export function sameImage(a: ViewerImage, b: ViewerImage): boolean {
  return a.src === b.src && a.name === b.name;
}
