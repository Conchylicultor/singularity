import { useState } from "react";
import { MdExpandLess, MdExpandMore } from "react-icons/md";
import type { ClaudeCliCall } from "@plugins/infra/plugins/claude-cli/core";
import { RelativeTime } from "@plugins/primitives/plugins/relative-time/web";
import { cn } from "@/lib/utils";

const MODEL_STYLES: Record<ClaudeCliCall["model"], string> = {
  haiku: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
  sonnet: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200",
  opus: "bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-200",
};

export function CallRow({ call }: { call: ClaudeCliCall }) {
  const [open, setOpen] = useState(false);
  const isError = call.error !== null;
  const previewText = isError
    ? call.error ?? "<error>"
    : (call.output ?? "").trim().split(/\r?\n/, 1)[0] ?? "";

  return (
    <li className="px-3 py-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-start gap-2 text-left"
      >
        <span className="mt-0.5 text-muted-foreground">
          {open ? <MdExpandLess className="size-4" /> : <MdExpandMore className="size-4" />}
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className={cn("rounded px-1.5 py-0.5 font-medium", MODEL_STYLES[call.model])}>
              {call.model}
            </span>
            <span className="rounded bg-muted px-1.5 py-0.5 font-mono">{call.sourceName}</span>
            <SourceContextChip context={call.sourceContext} />
            <span className="text-muted-foreground">
              <RelativeTime date={call.createdAt} />
            </span>
            <span className="tabular-nums text-muted-foreground">
              {call.durationMs}ms
            </span>
            {isError && (
              <span className="rounded bg-red-100 px-1.5 py-0.5 font-medium text-red-800 dark:bg-red-950 dark:text-red-200">
                error
              </span>
            )}
          </div>
          <div
            className={cn(
              "truncate text-sm",
              isError ? "text-red-700 dark:text-red-400" : "text-foreground",
            )}
          >
            {previewText || <span className="text-muted-foreground">&lt;empty&gt;</span>}
          </div>
        </div>
      </button>
      {open && (
        <div className="mt-3 ml-6 space-y-3 text-sm">
          {call.sourceContext && Object.keys(call.sourceContext).length > 0 && (
            <Section label="Source context">
              <pre className="overflow-auto rounded bg-muted p-2 text-xs">
                {JSON.stringify(call.sourceContext, null, 2)}
              </pre>
            </Section>
          )}
          {call.system && (
            <Section label="System">
              <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded bg-muted p-2 text-xs">
                {call.system}
              </pre>
            </Section>
          )}
          <Section label="Prompt">
            <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded bg-muted p-2 text-xs">
              {call.prompt}
            </pre>
          </Section>
          {isError ? (
            <Section label="Error">
              <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded bg-red-50 p-2 text-xs text-red-800 dark:bg-red-950 dark:text-red-200">
                {call.error}
              </pre>
            </Section>
          ) : (
            <Section label="Output">
              <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded bg-muted p-2 text-xs">
                {call.output ?? ""}
              </pre>
            </Section>
          )}
          <div className="text-xs text-muted-foreground">
            {call.createdAt.toLocaleString()} · {call.durationMs}ms · id{" "}
            <code className="font-mono">{call.id}</code>
          </div>
        </div>
      )}
    </li>
  );
}

function SourceContextChip({
  context,
}: {
  context: Record<string, unknown> | null;
}) {
  if (!context) return null;
  const keys = Object.keys(context);
  if (keys.length === 0) return null;
  const summary = keys
    .map((k) => {
      const v = context[k];
      if (typeof v === "string" && v.length > 12) return `${k}=${v.slice(0, 8)}…`;
      return `${k}=${typeof v === "string" ? v : JSON.stringify(v)}`;
    })
    .join(" ");
  return (
    <span className="truncate rounded bg-muted/50 px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
      {summary}
    </span>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 text-xs font-medium uppercase text-muted-foreground">
        {label}
      </div>
      {children}
    </div>
  );
}
