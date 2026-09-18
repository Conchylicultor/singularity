import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";

/** The plain-sentence consequences shown in the confirm dialog. */
export function LossList({ lines }: { lines: string[] }) {
  return (
    <Stack gap="sm">
      {lines.map((line) => (
        <p key={line} className="text-body text-muted-foreground">
          {line}
        </p>
      ))}
    </Stack>
  );
}
