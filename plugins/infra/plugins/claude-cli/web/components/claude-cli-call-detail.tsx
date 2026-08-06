import { Scroll } from "@plugins/primitives/plugins/css/plugins/scroll/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import type { ClaudeCliCall } from "../../core/resources";

/**
 * One recorded `claude --print` call, rendered in full: its source context, the
 * system prompt, the prompt, then the output OR the error, then the meta line.
 *
 * This lives with the plugin that OWNS the record so every consumer showing "what
 * was the model asked, and what did it say" renders it identically — the Debug
 * pane composes this rather than owning it. Callers supply their own surrounding
 * chrome (card, indent, collapse); this is the block, not the container.
 */
export function ClaudeCliCallDetail({ call }: { call: ClaudeCliCall }) {
  const isError = call.error !== null;
  return (
    // eslint-disable-next-line spacing/no-adhoc-spacing -- vertical rhythm between the detail sections, on the Text wrapper that sets their type scale
    <Text as="div" variant="body" className="space-y-3">
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
