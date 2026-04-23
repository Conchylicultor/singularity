import type { Components } from "react-markdown";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { JsonlEvent } from "../../shared";

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function formatInput(input: unknown): string {
  try {
    return JSON.stringify(input, null, 2);
  } catch {
    return String(input);
  }
}

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

export function EventRow({ event, markdownMode }: { event: JsonlEvent; markdownMode?: boolean }) {
  const time = formatTime(event.at);

  if (event.kind === "user-text") {
    return (
      <div className="rounded-md border border-border/60 bg-muted/40 px-3 py-2">
        <div className="mb-1 flex items-center gap-2 text-[10px] uppercase tracking-wide text-muted-foreground">
          <span>User</span>
          <span className="tabular-nums">{time}</span>
        </div>
        <div className="whitespace-pre-wrap break-words text-sm">{event.text}</div>
      </div>
    );
  }

  if (event.kind === "assistant-text") {
    return (
      <div className="rounded-md border border-border/60 bg-background px-3 py-2">
        <div className="mb-1 flex items-center gap-2 text-[10px] uppercase tracking-wide text-muted-foreground">
          <span>Assistant</span>
          <span className="tabular-nums">{time}</span>
          {event.stopReason ? (
            <span className="ml-auto text-muted-foreground/70">{event.stopReason}</span>
          ) : null}
        </div>
        {markdownMode ? (
          <div className="text-sm leading-6">
            <ReactMarkdown remarkPlugins={REMARK_PLUGINS} components={MD_COMPONENTS}>
              {event.text}
            </ReactMarkdown>
          </div>
        ) : (
          <div className="whitespace-pre-wrap break-words text-sm">{event.text}</div>
        )}
      </div>
    );
  }

  if (event.kind === "assistant-tool-use") {
    return (
      <details className="group rounded-md border border-border/60 bg-background px-3 py-2">
        <summary className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
          <span className="rounded bg-primary/10 px-1.5 py-0.5 font-mono text-[11px] text-primary">
            tool_use
          </span>
          <span className="font-mono text-foreground">{event.name || "(unnamed)"}</span>
          <span className="ml-auto tabular-nums">{time}</span>
        </summary>
        <pre className="mt-2 max-h-96 overflow-auto rounded bg-muted/60 p-2 text-xs">
          {formatInput(event.input)}
        </pre>
      </details>
    );
  }

  if (event.kind === "user-tool-result") {
    const borderClass = event.isError ? "border-destructive/60" : "border-border/60";
    const bgClass = event.isError ? "bg-destructive/5" : "bg-muted/20";
    return (
      <details className={`group rounded-md border ${borderClass} ${bgClass} px-3 py-2`}>
        <summary className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
          <span
            className={`rounded px-1.5 py-0.5 font-mono text-[11px] ${
              event.isError
                ? "bg-destructive/15 text-destructive"
                : "bg-muted text-muted-foreground"
            }`}
          >
            tool_result{event.isError ? " · error" : ""}
          </span>
          <span className="ml-auto tabular-nums">{time}</span>
        </summary>
        <pre className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap break-words rounded bg-muted/60 p-2 text-xs">
          {event.content || "(empty)"}
        </pre>
      </details>
    );
  }

  if (event.kind === "system") {
    return (
      <div className="px-1 text-xs italic text-muted-foreground">
        <span className="mr-2 tabular-nums">{time}</span>
        <span className="mr-2 font-mono">
          system{event.subtype ? `:${event.subtype}` : ""}
        </span>
        <span>{event.text}</span>
      </div>
    );
  }

  // summary
  return (
    <div className="my-2 flex items-center gap-2 text-xs text-muted-foreground">
      <div className="h-px flex-1 bg-border" />
      <span className="font-medium">{event.text}</span>
      <div className="h-px flex-1 bg-border" />
    </div>
  );
}
