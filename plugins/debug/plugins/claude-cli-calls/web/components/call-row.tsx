import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { MdExpandLess, MdExpandMore } from "react-icons/md";
import type { ClaudeCliCall } from "@plugins/infra/plugins/claude-cli/core";
import { MODEL_REGISTRY } from "@plugins/conversations/plugins/model-provider/core";
import { familyClass } from "@plugins/conversations/plugins/model-provider/web";
import { RelativeTime } from "@plugins/primitives/plugins/relative-time/web";
import { useCollapsible } from "@plugins/primitives/plugins/collapsible/web";
import { Badge } from "@plugins/primitives/plugins/css/plugins/badge/web";
import { Scroll } from "@plugins/primitives/plugins/css/plugins/scroll/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";

export function CallRow({ call }: { call: ClaudeCliCall }) {
  const { open, triggerProps, contentId } = useCollapsible();
  const modelMeta = MODEL_REGISTRY[call.model];
  const isError = call.error !== null;
  const previewText = isError
    ? call.error ?? "<error>"
    : (call.output ?? "").trim().split(/\r?\n/, 1)[0] ?? "";

  return (
    <li className="px-md py-sm">
      <button
        {...triggerProps}
        className="flex w-full items-start gap-sm text-left"
      >
        {/* eslint-disable-next-line spacing/no-adhoc-spacing -- one-off top offset to align chevron with first text line */}
        <span className="mt-0.5 text-muted-foreground">
          {open ? <MdExpandLess className="size-4" /> : <MdExpandMore className="size-4" />}
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-xs">
          <Text as="div" variant="caption" className="flex flex-wrap items-center gap-sm">
            <Badge colorClass={familyClass(modelMeta.family)}>
              {modelMeta.label}
            </Badge>
            <Badge variant="muted" className="font-mono">{call.sourceName}</Badge>
            <SourceContextChip context={call.sourceContext} />
            <span className="text-muted-foreground">
              <RelativeTime date={call.createdAt} />
            </span>
            <span className="tabular-nums text-muted-foreground">
              {call.durationMs}ms
            </span>
            {isError && (
              <Badge variant="destructive">
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
        // eslint-disable-next-line spacing/no-adhoc-spacing -- indented detail block: top/left offset under the trigger row plus vertical rhythm on a Text wrapper element
        <Text as="div" variant="body" id={contentId} className="mt-3 ml-6 space-y-3">
          {call.sourceContext && Object.keys(call.sourceContext).length > 0 && (
            <Section label="Source context">
              <Scroll as="pre" axis="both" className="rounded-md bg-muted p-sm text-caption">
                {JSON.stringify(call.sourceContext, null, 2)}
              </Scroll>
            </Section>
          )}
          {call.system && (
            <Section label="System">
              <Scroll as="pre" className="max-h-64 whitespace-pre-wrap rounded-md bg-muted p-sm text-caption">
                {call.system}
              </Scroll>
            </Section>
          )}
          <Section label="Prompt">
            <Scroll as="pre" className="max-h-96 whitespace-pre-wrap rounded-md bg-muted p-sm text-caption">
              {call.prompt}
            </Scroll>
          </Section>
          {isError ? (
            <Section label="Error">
              <Scroll as="pre" className="max-h-64 whitespace-pre-wrap rounded-md bg-destructive/10 p-sm text-caption text-destructive">
                {call.error}
              </Scroll>
            </Section>
          ) : (
            <Section label="Output">
              <Scroll as="pre" className="max-h-96 whitespace-pre-wrap rounded-md bg-muted p-sm text-caption">
                {call.output ?? ""}
              </Scroll>
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
    <Badge variant="muted" className="truncate font-mono">
      {summary}
    </Badge>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      {/* eslint-disable-next-line spacing/no-adhoc-spacing -- one-off label-to-content gap on a Text element inside a section */}
      <Text as="div" variant="caption" className="mb-1 font-medium uppercase text-muted-foreground">
        {label}
      </Text>
      {children}
    </div>
  );
}
