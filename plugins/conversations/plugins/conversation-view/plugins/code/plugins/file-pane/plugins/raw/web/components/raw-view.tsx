import { useEffect, useState } from "react";
import {
  getHighlighter,
  languageForPath,
  SHIKI_LANGS,
  themeForMode,
  useDarkMode,
} from "@plugins/primitives/plugins/syntax-highlight/web";
import { useFileContent } from "@plugins/conversations/plugins/conversation-view/plugins/code/plugins/file-pane/web";

export function RawView({
  worktree,
  path,
}: {
  worktree: string;
  path: string;
}) {
  const state = useFileContent(worktree, path);
  const dark = useDarkMode();
  const [html, setHtml] = useState<string | null>(null);
  const [highlightError, setHighlightError] = useState<string | null>(null);

  const content = state.kind === "ok" ? state.content : null;

  useEffect(() => {
    if (content === null) {
      setHtml(null);
      return;
    }
    let cancelled = false;
    const lang = languageForPath(path);
    const resolvedLang = SHIKI_LANGS.includes(lang) ? lang : "text";
    const theme = themeForMode(dark);

    getHighlighter(resolvedLang)
      .then((hl) => {
        if (cancelled) return;
        const out = hl.codeToHtml(content, { lang: resolvedLang, theme });
        setHtml(out);
        setHighlightError(null);
      })
      .catch((err) => {
        if (cancelled) return;
        setHighlightError(String(err));
      });

    return () => {
      cancelled = true;
    };
  }, [content, path, dark]);

  if (state.kind === "loading") {
    return <Placeholder>Loading…</Placeholder>;
  }
  if (state.kind === "error") {
    const message =
      state.status === 413
        ? "File is too large to preview."
        : state.status === 415
          ? "Binary file — no preview available."
          : state.status === 404
            ? "File not found."
            : state.message || "Failed to load file.";
    return <Placeholder tone="error">{message}</Placeholder>;
  }

  if (highlightError) {
    return (
      <pre className="whitespace-pre-wrap break-words p-3 font-mono text-xs leading-5">
        {content}
      </pre>
    );
  }
  if (html === null) {
    return <Placeholder>Rendering…</Placeholder>;
  }

  return (
    <div
      className="[&>pre]:m-0 [&>pre]:min-h-full [&>pre]:bg-transparent [&>pre]:p-3 [&>pre]:font-mono [&>pre]:text-xs [&>pre]:leading-5"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

function Placeholder({
  children,
  tone = "muted",
}: {
  children: React.ReactNode;
  tone?: "muted" | "error";
}) {
  return (
    <div
      className={`px-3 py-2 text-sm ${tone === "error" ? "text-destructive" : "text-muted-foreground"}`}
    >
      {children}
    </div>
  );
}
