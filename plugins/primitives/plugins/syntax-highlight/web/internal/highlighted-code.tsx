import { useEffect, useState } from "react";
import type { BundledLanguage } from "shiki";
import { ContentScope } from "@plugins/primitives/plugins/select-scope/web";
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
    "[&>pre]:m-0 [&>pre]:overflow-auto [&>pre]:rounded [&>pre]:bg-muted [&>pre]:p-3 [&>pre]:font-mono [&>pre]:text-xs [&>pre]:leading-5";

  if (!resolved || html === null) {
    return (
      <ContentScope>
        <pre
          className={`my-2 overflow-auto rounded-md bg-muted p-3 font-mono text-caption ${className ?? ""}`}
        >
          <code>{code}</code>
        </pre>
      </ContentScope>
    );
  }

  return (
    <ContentScope>
      <div
        className={`my-2 ${wrapper} ${className ?? ""}`}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </ContentScope>
  );
}
