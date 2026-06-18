import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";

// Presentational optimistic echo of a just-sent user turn. The card chrome
// mirrors UserTextRow (rounded-md border border-border/60 bg-background px-md
// py-sm + body Text with whitespace-pre-wrap break-words) but in a dimmed
// "pending" treatment, and the bouncing-dots indicator below mirrors the
// jsonl-viewer WorkingIndicator's three animate-bounce spans exactly. The dot
// markup is intentionally duplicated rather than extracted into a shared
// primitive — see the plugin report follow-up.
export function PendingTurnEcho({ text }: { text: string }) {
  return (
    <Stack gap="sm" className="opacity-70">
      <div className="relative rounded-md border border-border/60 bg-background px-md py-sm">
        <Text as="div" variant="body" className="whitespace-pre-wrap break-words">
          {text}
        </Text>
        {/* eslint-disable-next-line spacing/no-adhoc-spacing -- mt-1 spaces the Sending caption from the message text above, mirroring user-text-row */}
        <Text as="div" variant="caption" className="mt-1 text-muted-foreground/60">
          Sending…
        </Text>
      </div>
      <Stack direction="row" gap="sm" align="center" className="px-xs py-xs">
        <Stack direction="row" gap="xs" align="center">
          {[0, 150, 300].map((delay) => (
            <span
              key={delay}
              className="size-1.5 animate-bounce rounded-full bg-muted-foreground/40"
              style={{ animationDelay: `${delay}ms` }}
            />
          ))}
        </Stack>
        <Text as="span" variant="caption" className="text-muted-foreground/60">
          Starting…
        </Text>
      </Stack>
    </Stack>
  );
}
