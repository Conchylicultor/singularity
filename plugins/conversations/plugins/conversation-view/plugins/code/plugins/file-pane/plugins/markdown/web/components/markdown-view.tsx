import type { Components } from "react-markdown";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useFileContent } from "../../../../web/use-file-content";

const REMARK_PLUGINS = [remarkGfm];

const MARKDOWN_COMPONENTS: Components = {
  h1: (p) => <h1 className="mt-4 mb-2 text-2xl font-semibold" {...p} />,
  h2: (p) => <h2 className="mt-4 mb-2 text-xl font-semibold" {...p} />,
  h3: (p) => <h3 className="mt-3 mb-1.5 text-lg font-semibold" {...p} />,
  h4: (p) => <h4 className="mt-3 mb-1 font-semibold" {...p} />,
  p: (p) => <p className="my-2" {...p} />,
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
  li: (p) => <li className="my-0.5" {...p} />,
  blockquote: (p) => (
    <blockquote
      className="my-2 border-l-2 border-muted-foreground/30 pl-3 text-muted-foreground"
      {...p}
    />
  ),
  hr: (p) => <hr className="my-4 border-border" {...p} />,
  code: ({ className, children, ...rest }) => {
    const isBlock = /language-/.test(className ?? "");
    if (isBlock) {
      return (
        <code className={`${className ?? ""} font-mono text-xs`} {...rest}>
          {children}
        </code>
      );
    }
    return (
      <code
        className="rounded bg-muted px-1 py-0.5 font-mono text-xs"
        {...rest}
      >
        {children}
      </code>
    );
  },
  pre: (p) => (
    <pre
      className="my-2 overflow-auto rounded bg-muted p-3 font-mono text-xs"
      {...p}
    />
  ),
  table: (p) => <table className="my-2 w-full border-collapse" {...p} />,
  th: (p) => (
    <th
      className="border border-border bg-muted px-2 py-1 text-left"
      {...p}
    />
  ),
  td: (p) => <td className="border border-border px-2 py-1" {...p} />,
};

export function MarkdownView({
  conversationId,
  path,
}: {
  conversationId: string;
  path: string;
}) {
  const state = useFileContent(conversationId, path);

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

  return (
    <div className="px-4 py-3 text-sm leading-6">
      <ReactMarkdown
        remarkPlugins={REMARK_PLUGINS}
        components={MARKDOWN_COMPONENTS}
      >
        {state.content}
      </ReactMarkdown>
    </div>
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
