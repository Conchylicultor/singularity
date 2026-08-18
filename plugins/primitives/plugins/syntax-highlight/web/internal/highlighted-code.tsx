import { ContentScope } from "@plugins/primitives/plugins/select-scope/web";
import { Scroll } from "@plugins/primitives/plugins/css/plugins/scroll/web";
import { themeForMode } from "./highlighter";
import { resolveLang } from "./lang";
import { useDarkMode } from "./use-dark-mode";
import { useHighlightedHtml } from "./use-highlighted-html";

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
  // Opt into the shared module cache so a re-mount paints the cached markup with
  // the same string reference (the load-bearing stability that keeps React from
  // tearing down the `<pre>` and destroying text selection / ContentScope focus).
  const cacheKey = resolved
    ? `${themeForMode(dark)} ${resolved} ${code}`
    : null;
  const { html } = useHighlightedHtml(code, resolved, { dark, cacheKey });

  // `[&>pre]:m-0` resets shiki's injected <pre> default margin — there is no
  // named margin utility for a reset-to-zero.
  const wrapper =
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
