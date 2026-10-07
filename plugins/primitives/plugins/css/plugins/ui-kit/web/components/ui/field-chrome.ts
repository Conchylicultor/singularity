// The text fields' shared chrome — border, radius, fill, focus ring, disabled
// and invalid states — so `Input` and `Textarea` cannot drift apart. Size
// (height, padding, text rung) is NOT here: it comes from the ambient density.
export const fieldChromeClass =
  "focus-ring w-full min-w-0 rounded-lg border border-input bg-transparent transition-colors placeholder:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40";
