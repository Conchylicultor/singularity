import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { BouncingDots } from "@plugins/primitives/plugins/css/plugins/bouncing-dots/web";

// Presentational optimistic echo of a just-sent user turn. The card chrome
// mirrors UserTextRow (rounded-md border border-border/60 bg-background px-md
// py-sm + body Text with whitespace-pre-wrap break-words) but in a dimmed
// "pending" treatment, with the shared BouncingDots activity indicator below.
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
        <BouncingDots />
        <Text as="span" variant="caption" className="text-muted-foreground/60">
          Starting…
        </Text>
      </Stack>
    </Stack>
  );
}
