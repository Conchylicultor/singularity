import { domToBlob } from "modern-screenshot";

export async function captureApp(
  filter?: (node: Node) => boolean,
): Promise<Blob | null> {
  return domToBlob(document.documentElement, {
    scale: window.devicePixelRatio || 1,
    features: { restoreScrollPosition: true },
    ...(filter ? { filter } : {}),
  });
}
