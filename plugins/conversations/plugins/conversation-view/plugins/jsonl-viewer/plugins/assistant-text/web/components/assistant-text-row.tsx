import { isValidElement, type ReactNode } from "react";
import type { Components } from "react-markdown";
import ReactMarkdown from "react-markdown";
import rehypeRaw from "rehype-raw";
import remarkGfm from "remark-gfm";
import { HighlightedCode } from "@plugins/primitives/plugins/syntax-highlight/web";
import { linkifyChildren } from "@plugins/primitives/plugins/file-links/web";
import {
  useActiveDataComponents,
  useActiveDataLinkify,
} from "@plugins/active-data/web";
import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import { convFilePeekPane } from "@plugins/conversations/plugins/conversation-view/plugins/code/plugins/file-pane/web";
import type { JsonlEvent } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/shared";
import {
  TokenBadge,
  formatTime,
  useRowMarkdown,
} from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/web";

type AssistantTextEvent = Extract<JsonlEvent, { kind: "assistant-text" }>;

const REMARK_PLUGINS = [remarkGfm];
const REHYPE_PLUGINS = [rehypeRaw];

function nodeToText(node: ReactNode): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(nodeToText).join("");
  if (isValidElement(node)) {
    const props = node.props as { children?: ReactNode };
    return nodeToText(props.children);
  }
  return "";
}

function langFromClassName(className: string | undefined): string | null {
  const match = /language-([\w+-]+)/.exec(className ?? "");
  return match?.[1] ?? null;
}

const IMG_HREF_RE = /\.(png|jpe?g|gif|webp|svg|bmp|avif|ico)(?:[?#].*)?$/i;

function isExternalUrl(src: string): boolean {
  return (
    src.startsWith("http://") ||
    src.startsWith("https://") ||
    src.startsWith("data:")
  );
}

function buildMdComponents(
  worktree: string,
  onFileOpen: (path: string) => void,
  activeDataLinkify: (children: ReactNode) => ReactNode,
): Components {
  const transform = (children: ReactNode) =>
    linkifyChildren(activeDataLinkify(children), onFileOpen);
  return {
    h1: ({ children, ...p }) => (
      <h1 className="mt-4 mb-2 text-2xl font-semibold" {...p}>{transform(children)}</h1>
    ),
    h2: ({ children, ...p }) => (
      <h2 className="mt-4 mb-2 text-xl font-semibold" {...p}>{transform(children)}</h2>
    ),
    h3: ({ children, ...p }) => (
      <h3 className="mt-3 mb-1.5 text-lg font-semibold" {...p}>{transform(children)}</h3>
    ),
    h4: ({ children, ...p }) => (
      <h4 className="mt-3 mb-1 font-semibold" {...p}>{transform(children)}</h4>
    ),
    p: ({ children, ...p }) => (
      <p className="my-2" {...p}>{transform(children)}</p>
    ),
    a: ({ href, ...p }) => (
      <a
        className="text-primary underline"
        href={href}
        target={href?.startsWith("http") ? "_blank" : undefined}
        rel={href?.startsWith("http") ? "noopener noreferrer" : undefined}
        {...p}
      />
    ),
    ul: (p) => <ul className="my-2 list-disc pl-6" {...p} />,
    ol: (p) => <ol className="my-2 list-decimal pl-6" {...p} />,
    li: ({ children, ...p }) => (
      <li className="my-0.5" {...p}>{transform(children)}</li>
    ),
    blockquote: ({ children, ...p }) => (
      <blockquote
        className="my-2 border-l-2 border-muted-foreground/30 pl-3 text-muted-foreground"
        {...p}
      >
        {transform(children)}
      </blockquote>
    ),
    hr: (p) => <hr className="my-4 border-border" {...p} />,
    code: ({ className, children, ...rest }) => {
      const lang = langFromClassName(className);
      const text = nodeToText(children).replace(/\n$/, "");
      const isBlock = lang !== null || text.includes("\n");
      if (isBlock) {
        return <HighlightedCode code={text} lang={lang} />;
      }
      return <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs" {...rest}>{children}</code>;
    },
    pre: ({ children }) => <>{children}</>,
    img: ({ src, alt }) => {
      if (typeof src !== "string" || !src) return null;
      const isImage = IMG_HREF_RE.test(src);
      if (isExternalUrl(src) && isImage) {
        return (
          <img
            src={src}
            alt={alt ?? ""}
            className="my-2 max-w-full rounded border border-border"
          />
        );
      }
      if (isImage) {
        const apiSrc = `/api/code/${encodeURIComponent(worktree)}/image?path=${encodeURIComponent(src)}`;
        return (
          <img
            src={apiSrc}
            alt={alt ?? ""}
            className="my-2 max-w-full rounded border border-border"
          />
        );
      }
      return (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onFileOpen(src);
          }}
          className="rounded bg-muted px-1 py-0.5 font-mono text-xs text-primary hover:underline"
        >
          {alt || src}
        </button>
      );
    },
    table: (p) => <table className="my-2 w-full border-collapse" {...p} />,
    th: ({ children, ...p }) => (
      <th className="border border-border bg-muted px-2 py-1 text-left" {...p}>{transform(children)}</th>
    ),
    td: ({ children, ...p }) => (
      <td className="border border-border px-2 py-1" {...p}>{transform(children)}</td>
    ),
  };
}

export function AssistantTextRow({ event }: { event: JsonlEvent }) {
  const e = event as AssistantTextEvent;
  const { markdownMode } = useRowMarkdown();
  const { conversation } = conversationPane.useData();
  const activeDataComponents = useActiveDataComponents();
  const activeDataLinkify = useActiveDataLinkify();
  const onFileOpen = (path: string) =>
    convFilePeekPane.open({
      convId: conversation.id,
      worktree: conversation.attemptId,
      filePath: path,
    });
  const mdComponents: Components = {
    ...buildMdComponents(conversation.attemptId, onFileOpen, activeDataLinkify),
    ...activeDataComponents,
  };

  return (
    <div className="rounded-md border border-border/60 bg-background px-3 py-2">
      <div className="mb-1 flex items-center gap-2 text-[10px] uppercase tracking-wide text-muted-foreground">
        <span>Assistant</span>
        <span className="tabular-nums">{formatTime(e.at)}</span>
        <div className="ml-auto flex items-center gap-2">
          {e.usage ? <TokenBadge usage={e.usage} /> : null}
          {e.stopReason ? (
            <span className="text-muted-foreground/70">{e.stopReason}</span>
          ) : null}
        </div>
      </div>
      {markdownMode ? (
        <div className="text-sm leading-6">
          <ReactMarkdown
            remarkPlugins={REMARK_PLUGINS}
            rehypePlugins={REHYPE_PLUGINS}
            components={mdComponents}
          >
            {e.text}
          </ReactMarkdown>
        </div>
      ) : (
        <div className="whitespace-pre-wrap break-words text-sm">
          {linkifyChildren(activeDataLinkify(e.text), onFileOpen)}
        </div>
      )}
    </div>
  );
}
