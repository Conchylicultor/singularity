import type { ToolRendererProps } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/tool-call/core";
import { ToolCallCard } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/tool-call/web";
import { ContentScope } from "@plugins/primitives/plugins/select-scope/web";
import { Text } from "@plugins/primitives/plugins/text/web";

interface BashInput {
  command: string;
  description?: string;
}

function stripAnsi(text: string): string {
  return text
    .replace(/\x1b\[[0-9;]*[mGKHF]/g, "")
    .replace(/\x1b\][^\x07]*\x07/g, "");
}

export function BashToolView({ event }: ToolRendererProps) {
  const input = event.input as BashInput;
  const result = event.result;
  const output = result?.content ? stripAnsi(result.content) : null;

  return (
    <ToolCallCard
      event={event}
      summary={input.description || `$ ${input.command}`}
    >
      <ContentScope>
      <Text
        as="div"
        variant="caption"
        // eslint-disable-next-line spacing/no-adhoc-spacing -- mt-2 offsets this output block from the ToolCallCard header; the element mixes border+bg+rounded so it's not a clean Stack/Inset
        className="mt-2 overflow-hidden rounded-md border border-border/40 bg-muted font-mono"
      >
        <div className="flex items-start gap-sm px-md py-sm">
          <span className="select-none text-muted-foreground/40">$</span>
          <span className="flex-1 whitespace-pre-wrap break-words text-foreground">
            {input.command}
          </span>
        </div>
        {result && (
          <>
            <div className="border-t border-border/30" />
            <pre
              className={`max-h-72 overflow-auto whitespace-pre-wrap break-words px-md py-sm ${
                result.isError ? "text-destructive" : "text-muted-foreground"
              }`}
            >
              {output ?? (
                <span className="italic opacity-50">(no output)</span>
              )}
            </pre>
          </>
        )}
      </Text>
      </ContentScope>
    </ToolCallCard>
  );
}
