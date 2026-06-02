/** Fallback rendered by `Sonata.Display.Dispatch` when no display matches. */
export function NoDisplay() {
  return (
    <div className="flex h-full items-center justify-center p-8 text-sm text-muted-foreground">
      No display selected.
    </div>
  );
}
