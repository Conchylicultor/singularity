import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";

/** Fallback rendered by `Sonata.Display.Dispatch` when no display matches. */
export function NoDisplay() {
  return (
    <Text
      as="div"
      variant="body"
      className="flex h-full items-center justify-center p-2xl text-muted-foreground"
    >
      No display selected.
    </Text>
  );
}
