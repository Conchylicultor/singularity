import { useCallback, useRef, useState } from "react";
import { MdFormatColorText } from "react-icons/md";
import {
  $getSelection,
  $isRangeSelection,
  $setSelection,
  type BaseSelection,
} from "lexical";
import { $patchStyleText } from "@lexical/selection";
import { IconButton } from "@plugins/primitives/plugins/icon-button/web";
import { InlinePopover } from "@plugins/primitives/plugins/popover/web";
import { cn } from "@plugins/primitives/plugins/ui-kit/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { useFormatToolbar, colorCssValue } from "@plugins/page/plugins/editor/web";
import { COLOR_TOKENS, type ColorToken } from "@plugins/page/plugins/editor/core";

/** Human label for each token (capitalized), for the swatch tooltip/aria. */
function tokenLabel(token: ColorToken): string {
  return token === "default" ? "Default" : token[0]!.toUpperCase() + token.slice(1);
}

/**
 * Inline text-color toolbar control. A letter-A glyph tinted to the selection's
 * current color, opening a popover swatch grid of the closed palette plus a
 * "Default" reset.
 *
 * Each swatch applies the color to the selection via `$patchStyleText` with
 * `color: var(--rt-color-<token>)` (the same `--rt-color-*` contract the
 * converter persists); "Default" clears it with `color: null`. Swatch fills come
 * from the palette tokens (CSS vars), never raw hex — the whole point of the
 * token group. Selection survival mirrors the link control: pin the bar + restore
 * the snapshot inside `editor.update` so blurring into the popover can't drop the
 * span being colored.
 */
export function ColorButton() {
  const toolbar = useFormatToolbar();
  const [open, setOpen] = useState(false);
  const savedSelection = useRef<BaseSelection | null>(null);

  const editor = toolbar?.editor ?? null;
  const setPinned = toolbar?.setPinned;
  const activeColor = toolbar?.color ?? null;

  const openPopover = useCallback(() => {
    if (!editor) return;
    editor.getEditorState().read(() => {
      const sel = $getSelection();
      savedSelection.current = sel ? sel.clone() : null;
    });
    setPinned?.(true);
    setOpen(true);
  }, [editor, setPinned]);

  const closePopover = useCallback(() => {
    setOpen(false);
    setPinned?.(false);
    savedSelection.current = null;
  }, [setPinned]);

  if (!toolbar || !editor) return null;

  const applyColor = (token: ColorToken) => {
    editor.update(() => {
      if (savedSelection.current) $setSelection(savedSelection.current.clone());
      const selection = $getSelection();
      if ($isRangeSelection(selection)) {
        $patchStyleText(selection, { color: colorCssValue(token) });
      }
    });
    editor.focus();
    closePopover();
  };

  // The trigger glyph is tinted to the active color (or inherits when none).
  const triggerStyle = activeColor
    ? { color: colorCssValue(activeColor) ?? undefined }
    : undefined;

  return (
    <InlinePopover
      open={open}
      onOpenChange={(next) => (next ? openPopover() : closePopover())}
      contentClassName="w-56"
      trigger={
        <IconButton
          icon={MdFormatColorText}
          label="Text color"
          tooltip="Text color"
          aria-pressed={activeColor !== null}
          onMouseDown={(e) => e.preventDefault()}
          style={triggerStyle}
          className={cn(open && "bg-accent text-accent-foreground")}
        />
      }
    >
      <Stack gap="xs">
        <Text variant="caption" tone="muted">
          Text color
        </Text>
        <div className="grid grid-cols-5 gap-2xs">
          {COLOR_TOKENS.map((token) => {
            const fill = colorCssValue(token);
            const isActive =
              token === "default" ? activeColor === null : activeColor === token;
            return (
              <button
                key={token}
                type="button"
                aria-label={tokenLabel(token)}
                aria-pressed={isActive}
                title={tokenLabel(token)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => applyColor(token)}
                className={cn(
                  "flex size-7 items-center justify-center rounded-md border border-border",
                  isActive && "ring-2 ring-ring",
                )}
                // The swatch fill IS the palette token's color (a CSS var, never a
                // raw hex). "Default" shows the page's own text color (currentColor).
                style={{ backgroundColor: fill ?? "transparent" }}
              >
                {token === "default" && (
                  <Text variant="caption" tone="muted">
                    A
                  </Text>
                )}
              </button>
            );
          })}
        </div>
      </Stack>
    </InlinePopover>
  );
}
