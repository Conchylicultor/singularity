/**
 * Thin indeterminate top progress bar, shown while a page is loading. Rendered
 * inside an Overlay `above` layer (full-bleed, click-through); the bar sits at
 * the top of that layer's normal block flow.
 */
export function LoadingBar() {
  return <div className="h-0.5 w-full animate-pulse bg-primary" />;
}
