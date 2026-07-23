import type { ReactNode } from "react";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";

/**
 * Presentational label + hint wrapper shared by the add and edit server forms,
 * so both surfaces render an identical field layout. The caller owns the input
 * element (its value/handlers differ: local state on create, autosave on edit).
 */
export function FieldShell({
  label,
  required = false,
  hint,
  children,
  className,
}: {
  label: string;
  required?: boolean;
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Stack as="label" gap="xs" className={className}>
      <Text as="span" variant="label">
        {label}
        {required && <span className="text-destructive"> *</span>}
      </Text>
      {children}
      {hint && (
        <Text as="span" variant="caption" className="text-muted-foreground">
          {hint}
        </Text>
      )}
    </Stack>
  );
}

/** Shared input / textarea styling, so add and edit render pixel-identical controls. */
export const fieldInputClass = "bg-input rounded-md border px-sm py-xs text-body";
export const fieldTextareaClass =
  "bg-input rounded-md border px-sm py-xs font-mono text-caption";
