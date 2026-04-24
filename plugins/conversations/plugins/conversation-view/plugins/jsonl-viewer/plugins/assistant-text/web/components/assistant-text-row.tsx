import type { Components } from "react-markdown";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { JsonlEvent } from "../../../../shared";
import { formatTime } from "../../../../web/utils";

type AssistantTextEvent = Extract<JsonlEvent, { kind: "assistant-text" }>;

const REMARK_PLUGINS = [remarkGfm];

const MD_COMPONENTS: Components = {
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
    <blockquote className="my-2 border-l-2 border-muted-foreground/30 pl-3 text-muted-foreground" {...p} />
  ),
  hr: (p) => <hr className="my-4 border-border" {...p} />,
  code: ({ className, children, ...rest }) => {
    const isBlock = /language-/.test(className ?? "");
    if (isBlock) {
      return <code className={`${className ?? ""} font-mono text-xs`} {...rest}>{children}</code>;
    }
    return <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs" {...rest}>{children}</code>;
  },
  pre: (p) => <pre className="my-2 overflow-auto rounded bg-muted p-3 font-mono text-xs" {...p} />,
  table: (p) => <table className="my-2 w-full border-collapse" {...p} />,
  th: (p) => <th className="border border-border bg-muted px-2 py-1 text-left" {...p} />,
  td: (p) => <td className="border border-border px-2 py-1" {...p} />,
};

export function AssistantTextRow({
  event,
  markdownMode,
}: {
  event: JsonlEvent;
  markdownMode?: boolean;
}) {
  const e = event as AssistantTextEvent;
  return (
    <div className="rounded-md border border-border/60 bg-background px-3 py-2">
      <div className="mb-1 flex items-center gap-2 text-[10px] uppercase tracking-wide text-muted-foreground">
        <span>Assistant</span>
        <span className="tabular-nums">{formatTime(e.at)}</span>
        {e.stopReason ? (
          <span className="ml-auto text-muted-foreground/70">{e.stopReason}</span>
        ) : null}
      </div>
      {markdownMode ? (
        <div className="text-sm leading-6">
          <ReactMarkdown remarkPlugins={REMARK_PLUGINS} components={MD_COMPONENTS}>
            {e.text}
          </ReactMarkdown>
        </div>
      ) : (
        <div className="whitespace-pre-wrap break-words text-sm">{e.text}</div>
      )}
    </div>
  );
}
