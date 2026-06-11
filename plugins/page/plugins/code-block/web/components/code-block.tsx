import { cn, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@plugins/primitives/plugins/ui-kit/web";
import { useEffect, useMemo, useRef, useState } from "react";
import type { BundledLanguage } from "shiki";
import {
  getHighlighter,
  resolveLang,
  SHIKI_LANGS,
  themeForMode,
  useDarkMode,
} from "@plugins/primitives/plugins/syntax-highlight/web";
import { CopyButton } from "@plugins/primitives/plugins/copy-to-clipboard/web";
import { useEditableField } from "@plugins/primitives/plugins/editable-field/web";
import type { BlockRendererProps } from "@plugins/page/plugins/editor/web";
import { codeBlock } from "../../core";

// Sentinel for the "no language" (plain text) option — Select needs a string value.
const PLAIN = "__plain__";

// Text-metric contract: the transparent <textarea> and the highlighted underlay
// must share font, size, line-height, padding, wrapping, and tab-size *exactly*,
// or the visible caret drifts away from the colored glyphs. `whitespace-pre-wrap`
// + `break-words` make long lines wrap identically in both layers, so the block
// grows vertically and we never need to sync horizontal scroll.
const METRICS =
  "p-3 font-mono text-xs leading-5 whitespace-pre-wrap break-words [tab-size:2]";
// Same contract, projected onto the <pre> shiki injects.
// eslint-disable-next-line text/no-adhoc-typography -- pinned mono code-editor metric: the shiki <pre> must match METRICS size/line-height exactly so the transparent textarea overlays the highlighted glyphs
const SHIKI_PRE = cn(
  "[&>pre]:m-0 [&>pre]:p-3 [&>pre]:font-mono [&>pre]:text-xs [&>pre]:leading-5",
  "[&>pre]:whitespace-pre-wrap [&>pre]:break-words [&>pre]:[tab-size:2]",
);

export function CodeBlock({ block, isFocused, editor }: BlockRendererProps) {
  const parsed = codeBlock.parse(block.data);
  const dark = useDarkMode();

  // Language persists immediately on select; a ref keeps the (separately
  // debounced) code save closure pointed at the latest value.
  const [language, setLanguage] = useState<string | undefined>(parsed.language);
  const languageRef = useRef(language);
  languageRef.current = language;

  const field = useEditableField({
    value: parsed.code,
    onSave: (next) => editor.update({ code: next, language: languageRef.current }),
  });
  const code = field.value;

  const resolved = resolveLang(language);
  const [html, setHtml] = useState<string | null>(null);

  // Re-highlight on every keystroke. The highlighter + its grammars are cached
  // module-side, so after first load this resolves effectively synchronously;
  // the `cancelled` flag drops stale results from earlier keystrokes.
  useEffect(() => {
    if (!resolved) {
      setHtml(null);
      return;
    }
    let cancelled = false;
    const theme = themeForMode(dark);
    getHighlighter(resolved)
      .then((hl) => {
        if (cancelled) return;
        setHtml(hl.codeToHtml(code, { lang: resolved as BundledLanguage, theme }));
      })
      .catch(() => {
        if (!cancelled) setHtml(null);
      });
    return () => {
      cancelled = true;
    };
  }, [code, resolved, dark]);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // When the editor focus model points at this block (insertion, ``` conversion,
  // arrow-key navigation), pull the caret into the textarea.
  useEffect(() => {
    const ta = textareaRef.current;
    if (isFocused && ta && document.activeElement !== ta) ta.focus();
  }, [isFocused]);

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    const ta = e.currentTarget;
    if (e.key === "Tab") {
      // Indent with spaces instead of moving focus out of the block.
      e.preventDefault();
      const { selectionStart, selectionEnd } = ta;
      const next = code.slice(0, selectionStart) + "  " + code.slice(selectionEnd);
      field.onChange(next);
      requestAnimationFrame(() => {
        if (textareaRef.current) {
          textareaRef.current.selectionStart = textareaRef.current.selectionEnd =
            selectionStart + 2;
        }
      });
      return;
    }
    if (e.key === "Backspace" && code === "") {
      // Empty code block → remove it, matching Notion.
      e.preventDefault();
      editor.remove();
      return;
    }
    if (
      e.key === "ArrowUp" &&
      ta.selectionStart === 0 &&
      ta.selectionEnd === 0
    ) {
      e.preventDefault();
      editor.navigate("up");
      return;
    }
    if (
      e.key === "ArrowDown" &&
      ta.selectionStart === code.length &&
      ta.selectionEnd === code.length
    ) {
      e.preventDefault();
      editor.navigate("down");
    }
  }

  function onLanguageChange(value: string | null) {
    const lang = !value || value === PLAIN ? undefined : value;
    setLanguage(lang);
    editor.update({ code, language: lang });
  }

  const langItems = useMemo<Record<string, string>>(
    () => ({
      [PLAIN]: "Plain text",
      ...Object.fromEntries(SHIKI_LANGS.map((l) => [l, l])),
    }),
    [],
  );

  return (
    <div className="px-3 py-1">
      <div className="group relative overflow-hidden rounded-md bg-muted">
        {/* Hover/focus toolbar: language picker + copy. */}
        <div className="absolute top-1 right-1 z-raised flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
          <Select items={langItems} value={language ?? PLAIN} onValueChange={onLanguageChange}>
            <SelectTrigger
              size="sm"
              aria-label="Code language"
              className="h-6 w-28 bg-background/80 text-caption backdrop-blur"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="end">
              <SelectItem value={PLAIN}>Plain text</SelectItem>
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
            size="icon-sm"
            className="bg-background/80 backdrop-blur"
          />
        </div>

        {/* Underlay: highlighted (or plain) text, decorative — sizes the box. */}
        {html ? (
          <div
            aria-hidden
            className={SHIKI_PRE}
            dangerouslySetInnerHTML={{ __html: html }}
          />
        ) : (
          <pre aria-hidden className={cn("m-0", METRICS)}>
            {code || " "}
          </pre>
        )}

        {/* Editor: transparent text + visible caret, laid exactly over the underlay. */}
        <textarea
          ref={textareaRef}
          value={code}
          onChange={(e) => field.onChange(e.target.value)}
          onFocus={() => {
            field.onFocus();
            editor.onFocus();
          }}
          onBlur={field.onBlur}
          onKeyDown={onKeyDown}
          spellCheck={false}
          autoCorrect="off"
          autoCapitalize="off"
          placeholder="Code…"
          className={cn(
            "absolute inset-0 h-full w-full resize-none overflow-hidden border-0 bg-transparent",
            "text-transparent caret-foreground outline-none placeholder:text-muted-foreground",
            METRICS,
          )}
        />
      </div>
    </div>
  );
}
