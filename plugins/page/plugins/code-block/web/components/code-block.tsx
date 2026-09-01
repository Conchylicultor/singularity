import {
  cn,
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
} from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import {
  hoverRevealGroup,
  hoverRevealTarget,
} from "@plugins/primitives/plugins/hover-reveal/web";
import { useLatestRef } from "@plugins/primitives/plugins/latest-ref/web";
import { useMemo, useState } from "react";
import { MdAutoAwesome } from "react-icons/md";
import {
  resolveLang,
  SHIKI_LANGS,
  useDarkMode,
  useHighlightedHtml,
} from "@plugins/primitives/plugins/syntax-highlight/web";
import { CopyButton } from "@plugins/primitives/plugins/copy-to-clipboard/web";
import {
  Inset,
  Stack,
} from "@plugins/primitives/plugins/css/plugins/spacing/web";
import {
  Clip,
  clipClasses,
} from "@plugins/primitives/plugins/css/plugins/clip/web";
import { Pin } from "@plugins/primitives/plugins/css/plugins/pin/web";
import { layerClasses } from "@plugins/primitives/plugins/css/plugins/layer/web";
import { fillClasses } from "@plugins/primitives/plugins/css/plugins/fill/web";
import { rigidClass } from "@plugins/primitives/plugins/css/plugins/rigid/web";
import {
  BLOCK_INSET,
  BlockTextArea,
  useBlockPlainText,
  type BlockRendererProps,
} from "@plugins/page/plugins/editor/web";
import { codeBlock } from "../../core";
import { detectLanguage } from "../detect-language";
import { textVariantClass } from "@plugins/primitives/plugins/css/plugins/text/web";

// Tri-state language model, all stored in the single optional `language` field:
//   undefined  → AUTO: detect the language from the content and highlight it
//   "text"     → explicit plain text (user opted out of highlighting)
//   "<lang>"   → an explicit shiki language id
// AUTO is the sentinel the Select uses for the undefined state (Select needs a
// non-empty string value); PLAIN is the persisted value for explicit plain text.
const AUTO = "__auto__";
const PLAIN = "text";

// Text-metric contract: the transparent <textarea> and the highlighted underlay
// must share font, size, line-height, padding, wrapping, and tab-size *exactly*,
// or the visible caret drifts away from the colored glyphs. `whitespace-pre-wrap`
// + `break-words` make long lines wrap identically in both layers, so the block
// grows vertically and we never need to sync horizontal scroll.
const METRICS = cn(
  "p-md",
  textVariantClass("code"),
  "whitespace-pre-wrap break-words [tab-size:2]",
);
// Same contract, projected onto the <pre> shiki injects.
// eslint-disable-next-line spacing/no-adhoc-spacing -- [&>pre]:m-0 resets the shiki <pre> UA margin (layout reset, not rhythm). The metrics themselves are now the `code` role, so the textarea overlay and the <pre> track ONE definition instead of two hand-matched copies.
const SHIKI_PRE = cn(
  "[&>pre]:m-0 [&>pre]:p-md [&>pre]:text-code",
  "[&>pre]:whitespace-pre-wrap [&>pre]:break-words [&>pre]:[tab-size:2]",
);

export function CodeBlock({ block, isFocused, editor }: BlockRendererProps) {
  const parsed = codeBlock.parse(block.data);
  const dark = useDarkMode();

  // Language persists immediately on select; a ref keeps the (separately
  // debounced) code save closure pointed at the latest value.
  const [language, setLanguage] = useState<string | undefined>(parsed.language);
  const languageRef = useLatestRef(language);

  // The block's own plain-text surface. `useBlockPlainText` owns the draft, the
  // SYNCHRONOUS undo entry per keystroke, the debounced row write, the void-caret
  // registration and the ↑/↓/Backspace boundary keys — this block adds only what
  // is its own: Tab indents by two spaces instead of leaving the block.
  const text = useBlockPlainText({
    blockId: block.id,
    isFocused,
    editor,
    value: parsed.code,
    rowData: (code) => ({ code, language: languageRef.current }),
    label: "code",
    onKeyDown: (e, ctl) => {
      if (e.key !== "Tab") return;
      e.preventDefault();
      const { selectionStart, selectionEnd } = e.currentTarget;
      const next =
        ctl.value.slice(0, selectionStart) +
        "  " +
        ctl.value.slice(selectionEnd);
      const caret = selectionStart + 2;
      ctl.setValue(next, { start: caret, end: caret });
    },
  });
  const code = text.value;

  // In AUTO mode (language undefined) guess the language from the content; an
  // explicit choice (including the "text" plain sentinel) wins over detection.
  const detected = useMemo(
    () => (language === undefined ? detectLanguage(code) : null),
    [language, code],
  );
  const resolved = resolveLang(language ?? detected);
  // Re-highlight on every keystroke via the shared async-Shiki primitive (its
  // cancel guard drops stale results from earlier keystrokes). No cacheKey: the
  // editor recomputes per keystroke, matching the pre-hook behavior.
  const { html } = useHighlightedHtml(code, resolved, { dark });

  function onLanguageChange(value: string | null) {
    // AUTO maps back to undefined; "text" (PLAIN) and concrete langs persist as-is.
    const lang = !value || value === AUTO ? undefined : value;
    setLanguage(lang);
    editor.update({ code, language: lang });
  }

  const langItems = useMemo<Record<string, string>>(
    () => ({
      [AUTO]: "Auto",
      [PLAIN]: "Plain text",
      ...Object.fromEntries(SHIKI_LANGS.map((l) => [l, l])),
    }),
    [],
  );

  return (
    <Inset x={BLOCK_INSET} y="xs">
      <Clip
        className={cn(hoverRevealGroup, "group relative rounded-md bg-muted")}
      >
        {/* Hover/focus toolbar: language picker + copy. */}
        <Pin to="top-right" offset="xs" layer="raised">
          <Stack
            direction="row"
            gap="xs"
            align="center"
            className={hoverRevealTarget}
          >
            <Select
              items={langItems}
              value={language ?? AUTO}
              onValueChange={onLanguageChange}
            >
              <SelectTrigger
                size="sm"
                aria-label="Code language"
                className="h-6 w-36 bg-background/80 text-caption backdrop-blur"
              >
                {language === undefined ? (
                  <Stack
                    as="span"
                    direction="row"
                    align="center"
                    gap="xs"
                    className={fillClasses("x")}
                  >
                    <MdAutoAwesome
                      className={cn(rigidClass(), "text-muted-foreground")}
                    />
                    <span className="truncate">
                      Auto
                      {detected ? (
                        <span className="text-muted-foreground">
                          {" "}
                          · {detected}
                        </span>
                      ) : null}
                    </span>
                  </Stack>
                ) : (
                  <span className="truncate">
                    {language === PLAIN ? "Plain text" : language}
                  </span>
                )}
              </SelectTrigger>
              <SelectContent align="end">
                <SelectItem value={AUTO}>
                  <MdAutoAwesome />
                  Auto
                </SelectItem>
                <SelectItem value={PLAIN}>Plain text</SelectItem>
                <SelectSeparator />
                {SHIKI_LANGS.map((lang) => (
                  <SelectItem key={lang} value={lang}>
                    {lang}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <CopyButton
              text={code}
              title="Copy code"
              className="bg-background/80 backdrop-blur"
            />
          </Stack>
        </Pin>

        {/* Underlay: highlighted (or plain) text, decorative — sizes the box. */}
        {html ? (
          <div
            aria-hidden
            className={SHIKI_PRE}
            dangerouslySetInnerHTML={{ __html: html }}
          />
        ) : (
          <pre
            aria-hidden
            // eslint-disable-next-line spacing/no-adhoc-spacing -- m-0 resets the UA <pre> default margin to zero; there is no margin ramp and "none" is a layout reset, not rhythm
            className={cn("m-0", METRICS)}
          >
            {code || " "}
          </pre>
        )}

        {/* Editor: transparent text + visible caret, laid exactly over the underlay. */}
        <BlockTextArea
          text={text}
          placeholder="Code…"
          // The interactive full-bleed editor layer laid exactly over the sizing
          // underlay. `layerClasses()` (not `<Overlay above>`, which is
          // pointer-events-none) because the layer IS this element. METRICS is
          // the caret-alignment contract: drop a token and the invisible caret
          // drifts off the coloured glyphs underneath.
          className={cn(
            layerClasses(),
            clipClasses({ axis: "both", fill: false }),
            "h-full w-full resize-none border-0 bg-transparent",
            "text-transparent",
            METRICS,
          )}
        />
      </Clip>
    </Inset>
  );
}
