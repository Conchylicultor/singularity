import { useEffect, useRef, useState } from "react";
import type { ShikiTransformer } from "shiki";
import {
  getHighlighter,
  languageForPath,
  SHIKI_LANGS,
  themeForMode,
  useDarkMode,
} from "@plugins/primitives/plugins/syntax-highlight/web";
import { useFileContent } from "@plugins/conversations/plugins/conversation-view/plugins/code/plugins/file-pane/web";
import { Placeholder } from "@plugins/primitives/plugins/placeholder/web";

const LINE_NUMBERS_TRANSFORMER: ShikiTransformer = {
  line(node, line) {
    node.children.unshift({
      type: "element",
      tagName: "span",
      properties: { class: "ln" },
      children: [{ type: "text", value: String(line) }],
    });
  },
};

function makeHighlightTransformer(targetLine: number): ShikiTransformer {
  return {
    line(node, lineNum) {
      node.properties["data-line"] = String(lineNum);
      if (lineNum === targetLine) node.properties["data-highlighted"] = "";
    },
  };
}

export function RawView({
  worktree,
  path,
  line,
}: {
  worktree: string;
  path: string;
  line?: number;
}) {
  const state = useFileContent(worktree, path);
  const dark = useDarkMode();
  const [html, setHtml] = useState<string | null>(null);
  const [highlightError, setHighlightError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

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
        const transformers: ShikiTransformer[] = [LINE_NUMBERS_TRANSFORMER];
        if (line != null) transformers.push(makeHighlightTransformer(line));
        const out = hl.codeToHtml(content, { lang: resolvedLang, theme, transformers });
        const styledHtml = line != null
          ? `<style>.shiki .line[data-highlighted]{background-color:rgba(250,200,50,0.18);display:block;width:100%}</style>${out}`
          : out;
        setHtml(styledHtml);
        setHighlightError(null);
      })
      .catch((err) => {
        if (cancelled) return;
        setHighlightError(String(err));
      });

    return () => {
      cancelled = true;
    };
  }, [content, path, dark, line]);

  useEffect(() => {
    if (line == null || !containerRef.current) return;
    const el = containerRef.current.querySelector<HTMLElement>("[data-highlighted]");
    el?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [line, html]);

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
      <pre
        // eslint-disable-next-line text/no-adhoc-typography -- leading-5 fixes mono code line-height for line-number gutter alignment, distinct from caption's tighter line-height
        className="whitespace-pre-wrap break-words p-3 font-mono text-caption leading-5"
      >
        {content}
      </pre>
    );
  }
  if (html === null) {
    return <Placeholder>Rendering…</Placeholder>;
  }

  return (
    <div
      ref={containerRef}
      // eslint-disable-next-line text/no-adhoc-typography -- [&>pre]:leading-5 fixes mono code line-height for line-number gutter alignment, distinct from caption's tighter line-height
      className="[&>pre]:m-0 [&>pre]:min-h-full [&>pre]:bg-transparent [&>pre]:p-3 [&>pre]:font-mono [&>pre]:text-caption [&>pre]:leading-5 [&_.ln]:mr-4 [&_.ln]:inline-block [&_.ln]:w-7 [&_.ln]:select-none [&_.ln]:text-right [&_.ln]:text-muted-foreground/50 [&_.ln]:tabular-nums"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
