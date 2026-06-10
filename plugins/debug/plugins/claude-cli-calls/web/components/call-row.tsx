import { MdExpandLess, MdExpandMore } from "react-icons/md";
import type { ClaudeCliCall } from "@plugins/infra/plugins/claude-cli/core";
import { MODEL_REGISTRY } from "@plugins/conversations/plugins/model-provider/core";
import { familyClass } from "@plugins/conversations/plugins/model-provider/web";
import { RelativeTime } from "@plugins/primitives/plugins/relative-time/web";
import { useCollapsible } from "@plugins/primitives/plugins/collapsible/web";
import { Badge } from "@plugins/primitives/plugins/badge/web";
import { Text } from "@plugins/primitives/plugins/text/web";
import { cn } from "@/lib/utils";

export function CallRow({ call }: { call: ClaudeCliCall }) {
  const { open, triggerProps, contentId } = useCollapsible();
  const modelMeta = MODEL_REGISTRY[call.model];
  const isError = call.error !== null;
  const previewText = isError
    ? call.error ?? "<error>"
    : (call.output ?? "").trim().split(/\r?\n/, 1)[0] ?? "";

  return (
    <li className="px-3 py-2">
      <button
        {...triggerProps}
        className="flex w-full items-start gap-2 text-left"
      >
        <span className="mt-0.5 text-muted-foreground">
          {open ? <MdExpandLess className="size-4" /> : <MdExpandMore className="size-4" />}
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <Text as="div" variant="caption" className="flex flex-wrap items-center gap-2">
            <Badge size="md" colorClass={familyClass(modelMeta.family)}>
              {modelMeta.label}
            </Badge>
            <Badge variant="muted" size="md" className="font-mono">{call.sourceName}</Badge>
            <SourceContextChip context={call.sourceContext} />
            <span className="text-muted-foreground">
              <RelativeTime date={call.createdAt} />
            </span>
            <span className="tabular-nums text-muted-foreground">
              {call.durationMs}ms
            </span>
            {isError && (
              <Badge variant="destructive" size="md">
                error
              </Badge>
            )}
          </Text>
          <Text
            as="div"
            variant="body"
            className={cn(
              "truncate",
              isError ? "text-destructive" : "text-foreground",
            )}
          >
            {previewText || <span className="text-muted-foreground">&lt;empty&gt;</span>}
          </Text>
        </div>
      </button>
      {open && (
        <Text as="div" variant="body" id={contentId} className="mt-3 ml-6 space-y-3">
          {call.sourceContext && Object.keys(call.sourceContext).length > 0 && (
            <Section label="Source context">
              <pre className="overflow-auto rounded-md bg-muted p-2 text-caption">
                {JSON.stringify(call.sourceContext, null, 2)}
              </pre>
            </Section>
          )}
          {call.system && (
            <Section label="System">
              <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-md bg-muted p-2 text-caption">
                {call.system}
              </pre>
            </Section>
          )}
          <Section label="Prompt">
            <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-md bg-muted p-2 text-caption">
              {call.prompt}
            </pre>
          </Section>
          {isError ? (
            <Section label="Error">
              <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-md bg-destructive/10 p-2 text-caption text-destructive">
                {call.error}
              </pre>
            </Section>
          ) : (
            <Section label="Output">
              <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-md bg-muted p-2 text-caption">
                {call.output ?? ""}
              </pre>
            </Section>
          )}
          <Text as="div" variant="caption" className="text-muted-foreground">
            {call.createdAt.toLocaleString()} · {call.durationMs}ms · id{" "}
            <code className="font-mono">{call.id}</code>
          </Text>
        </Text>
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
    <Badge variant="muted" size="sm" className="truncate font-mono">
      {summary}
    </Badge>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Text as="div" variant="caption" className="mb-1 font-medium uppercase text-muted-foreground">
        {label}
      </Text>
      {children}
    </div>
  );
}
