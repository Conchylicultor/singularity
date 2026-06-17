import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Badge } from "@plugins/primitives/plugins/css/plugins/badge/web";

// --- Helpers -----------------------------------------------------------------

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function stableStringify(v: unknown): string {
  // Deterministic JSON: sort object keys so a key-reorder is not a false diff.
  return JSON.stringify(v, (_k, val) => {
    if (isPlainObject(val)) {
      return Object.fromEntries(
        Object.keys(val)
          .sort()
          .map((k) => [k, val[k]]),
      );
    }
    return val;
  });
}

function equal(a: unknown, b: unknown): boolean {
  return stableStringify(a) === stableStringify(b);
}

function preview(v: unknown): string {
  if (v === undefined) return "—";
  if (typeof v === "string") return v;
  return JSON.stringify(v);
}

/** Stable identity for an array item: an `id` field when present, else its index. */
function itemKey(item: unknown, index: number): string {
  if (isPlainObject(item) && typeof item.id === "string") return item.id;
  return `#${index}`;
}

type ChangeKind = "added" | "removed" | "changed";

const KIND_VARIANT: Record<ChangeKind, "success" | "destructive" | "warning"> = {
  added: "success",
  removed: "destructive",
  changed: "warning",
};

// --- Field-level rows --------------------------------------------------------

function ScalarFieldRow({
  field,
  before,
  after,
}: {
  field: string;
  before: unknown;
  after: unknown;
}) {
  return (
    <Stack direction="row" gap="sm" align="baseline">
      <Text variant="label" as="span">
        {field}
      </Text>
      <Text variant="caption" tone="muted" as="span">
        {preview(before)}
      </Text>
      <Text variant="caption" tone="muted" as="span">
        →
      </Text>
      <Text variant="caption" as="span">
        {preview(after)}
      </Text>
    </Stack>
  );
}

function ArrayChangeRow({
  kind,
  label,
}: {
  kind: ChangeKind;
  label: string;
}) {
  return (
    <Stack direction="row" gap="sm" align="center">
      <Badge variant={KIND_VARIANT[kind]} size="sm">
        {kind}
      </Badge>
      <Text variant="caption" as="span">
        {label}
      </Text>
    </Stack>
  );
}

function ArrayFieldDiff({
  field,
  before,
  after,
}: {
  field: string;
  before: unknown[];
  after: unknown[];
}) {
  const beforeByKey = new Map(before.map((it, i) => [itemKey(it, i), it]));
  const afterByKey = new Map(after.map((it, i) => [itemKey(it, i), it]));

  const changes: { kind: ChangeKind; label: string }[] = [];
  for (const [key, it] of afterByKey) {
    if (!beforeByKey.has(key)) {
      changes.push({ kind: "added", label: `${key}: ${preview(it)}` });
    } else if (!equal(beforeByKey.get(key), it)) {
      changes.push({ kind: "changed", label: `${key}: ${preview(it)}` });
    }
  }
  for (const [key, it] of beforeByKey) {
    if (!afterByKey.has(key)) {
      changes.push({ kind: "removed", label: `${key}: ${preview(it)}` });
    }
  }

  return (
    <Stack gap="xs">
      <Text variant="label" as="span">
        {field}
      </Text>
      <Stack gap="2xs">
        {changes.length === 0 ? (
          <Text variant="caption" tone="muted" as="span">
            reordered (no items added or removed)
          </Text>
        ) : (
          changes.map((c, i) => (
            <ArrayChangeRow key={`${c.kind}-${i}`} kind={c.kind} label={c.label} />
          ))
        )}
      </Stack>
    </Stack>
  );
}

// --- Top-level diff ----------------------------------------------------------

/**
 * Generic structural before→after diff of two config documents. The fallback
 * when no contributed `Staging.DiffRenderer` matches a staged key.
 *
 * Compares per top-level field: array fields show added / removed / changed by
 * `id` (when items carry one) else by index; scalar / object fields show a
 * before→after value line. Unchanged fields are omitted.
 */
export function GenericConfigDiff({
  before,
  after,
}: {
  before: unknown;
  after: unknown;
}) {
  const beforeObj = isPlainObject(before) ? before : {};
  const afterObj = isPlainObject(after) ? after : {};
  const keys = [...new Set([...Object.keys(beforeObj), ...Object.keys(afterObj)])].sort();

  const changed = keys.filter((k) => !equal(beforeObj[k], afterObj[k]));

  if (changed.length === 0) {
    return (
      <Text variant="caption" tone="muted" as="span">
        No changes.
      </Text>
    );
  }

  return (
    <Stack gap="sm">
      {changed.map((k) => {
        const b = beforeObj[k];
        const a = afterObj[k];
        if (Array.isArray(a) || Array.isArray(b)) {
          return (
            <ArrayFieldDiff
              key={k}
              field={k}
              before={Array.isArray(b) ? b : []}
              after={Array.isArray(a) ? a : []}
            />
          );
        }
        return <ScalarFieldRow key={k} field={k} before={b} after={a} />;
      })}
    </Stack>
  );
}
