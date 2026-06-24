/** True when the document is currently displayed in the browser's native fullscreen mode. */
export function isBrowserFullscreen(): boolean {
  return document.fullscreenElement !== null;
}

/** Enter native browser fullscreen, scaling the whole document to fill the screen. */
export function requestBrowserFullscreen(): Promise<void> {
  return document.documentElement.requestFullscreen();
}

/** Leave native browser fullscreen. No-op (resolved) when not currently fullscreen. */
export function exitBrowserFullscreen(): Promise<void> {
  if (document.fullscreenElement) return document.exitFullscreen();
  return Promise.resolve();
}

/** Toggle native browser fullscreen on the document. */
export function toggleBrowserFullscreen(): Promise<void> {
  return isBrowserFullscreen()
    ? exitBrowserFullscreen()
    : requestBrowserFullscreen();
}
