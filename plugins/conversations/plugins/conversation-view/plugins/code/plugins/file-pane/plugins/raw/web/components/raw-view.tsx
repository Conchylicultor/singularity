import { useEffect, useMemo, useRef } from "react";
import type { ShikiTransformer } from "shiki";
import {
  languageForPath,
  SHIKI_LANGS,
  useDarkMode,
  useHighlightedHtml,
} from "@plugins/primitives/plugins/syntax-highlight/web";
import { useFileContent } from "@plugins/conversations/plugins/conversation-view/plugins/code/plugins/file-pane/web";
import { revealElement } from "@plugins/primitives/plugins/scroll-reveal/web";
import { Loading } from "@plugins/primitives/plugins/loading/web";
import { Placeholder } from "@plugins/primitives/plugins/css/plugins/placeholder/web";

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
  const containerRef = useRef<HTMLDivElement>(null);

  const content = state.kind === "ok" ? state.content : null;

  const lang = languageForPath(path);
  const resolvedLang = SHIKI_LANGS.includes(lang) ? lang : "text";

  // Stable per `line` so the shared highlight effect only re-runs on real input
  // changes. The optional highlight transformer + the `<style>` post-process
  // only apply when a target line is requested.
  const transformers = useMemo<ShikiTransformer[]>(() => {
    const t: ShikiTransformer[] = [LINE_NUMBERS_TRANSFORMER];
    if (line != null) t.push(makeHighlightTransformer(line));
    return t;
  }, [line]);
  const postProcess = useMemo(
    () =>
      line != null
        ? (out: string) =>
            `<style>.shiki .line[data-highlighted]{background-color:rgba(250,200,50,0.18);display:block;width:100%}</style>${out}`
        : undefined,
    [line],
  );

  const { html, error: highlightError } = useHighlightedHtml(
    content ?? "",
    content === null ? null : resolvedLang,
    { dark, transformers, postProcess },
  );

  useEffect(() => {
    if (line == null || !containerRef.current) return;
    const el = containerRef.current.querySelector<HTMLElement>("[data-highlighted]");
    revealElement(el, { block: "center", behavior: "smooth" });
  }, [line, html]);

  if (state.kind === "loading") {
    return <Loading />;
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
        className="whitespace-pre-wrap break-words p-md font-mono text-caption leading-5"
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
      // eslint-disable-next-line text/no-adhoc-typography, spacing/no-adhoc-spacing -- [&>pre]:leading-5 fixes mono code line-height for line-number gutter alignment; [&_.ln]:mr-4 is the line-number gutter width (paired with [&_.ln]:w-7), a fixed code-gutter dimension the density ramp can't express
      className="[&>pre]:m-0 [&>pre]:min-h-full [&>pre]:w-max [&>pre]:min-w-full [&>pre]:bg-transparent [&>pre]:p-md [&>pre]:font-mono [&>pre]:text-caption [&>pre]:leading-5 [&_.ln]:mr-4 [&_.ln]:inline-block [&_.ln]:w-7 [&_.ln]:select-none [&_.ln]:text-right [&_.ln]:text-muted-foreground/50 [&_.ln]:tabular-nums"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
