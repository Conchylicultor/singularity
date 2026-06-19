import { useEffect, useState } from "react";
import type { BundledLanguage } from "shiki";
import { ContentScope } from "@plugins/primitives/plugins/select-scope/web";
import { Scroll } from "@plugins/primitives/plugins/css/plugins/scroll/web";
import { getHighlighter, themeForMode } from "./highlighter";
import { resolveLang } from "./lang";
import { useDarkMode } from "./use-dark-mode";

export function HighlightedCode({
  code,
  lang,
  className,
}: {
  code: string;
  lang?: string | null;
  className?: string;
}) {
  const dark = useDarkMode();
  const resolved = resolveLang(lang);
  const [html, setHtml] = useState<string | null>(null);

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
        setHtml(
          hl.codeToHtml(code, { lang: resolved as BundledLanguage, theme }),
        );
      })
      .catch(() => {
        if (!cancelled) setHtml(null);
      });
    return () => {
      cancelled = true;
    };
  }, [code, resolved, dark]);

  const wrapper =
    // eslint-disable-next-line spacing/no-adhoc-spacing -- [&>pre]:m-0 resets shiki's injected <pre> default margin; no named margin utility
    "[&>pre]:m-0 [&>pre]:overflow-auto [&>pre]:rounded [&>pre]:bg-muted [&>pre]:p-md [&>pre]:font-mono [&>pre]:text-xs [&>pre]:leading-5";

  if (!resolved || html === null) {
    return (
      <ContentScope>
        <Scroll
          as="pre"
          axis="both"
          // eslint-disable-next-line spacing/no-adhoc-spacing -- my-2 sets code-block vertical rhythm against surrounding content; one-off, no parent flex to own it
          className={`my-2 rounded-md bg-muted p-md font-mono text-caption ${className ?? ""}`}
        >
          <code>{code}</code>
        </Scroll>
      </ContentScope>
    );
  }

  return (
    <ContentScope>
      <div
        // eslint-disable-next-line spacing/no-adhoc-spacing -- my-2 sets code-block vertical rhythm against surrounding content; one-off, no parent flex to own it
        className={`my-2 ${wrapper} ${className ?? ""}`}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </ContentScope>
  );
}
