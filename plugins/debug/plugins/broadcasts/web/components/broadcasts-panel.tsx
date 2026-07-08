import { Button, ControlSizeProvider } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { IconButton } from "@plugins/primitives/plugins/icon-button/web";
import { useState, useCallback, useMemo } from "react";
import { MdAdd, MdDelete, MdRefresh } from "react-icons/md";
import { Badge } from "@plugins/primitives/plugins/css/plugins/badge/web";
import { Center } from "@plugins/primitives/plugins/css/plugins/center/web";
import { Scroll } from "@plugins/primitives/plugins/css/plugins/scroll/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Loading } from "@plugins/primitives/plugins/loading/web";
import { ToggleChip } from "@plugins/primitives/plugins/css/plugins/toggle-chip/web";
import { fetchEndpoint, useEndpoint } from "@plugins/infra/plugins/endpoints/web";
import {
  getBroadcasts,
  writeBroadcasts,
  type BroadcastEntry,
} from "../../shared/endpoints";

type BroadcastSeverity = BroadcastEntry["severity"];
type BroadcastCommand = "build" | "push" | "check";

const SEVERITY_STYLES: Record<BroadcastSeverity, string> = {
  error: "bg-destructive/10 text-destructive",
  warning: "bg-warning/10 text-warning",
  info: "bg-info/10 text-info",
};

const ALL_COMMANDS: BroadcastCommand[] = ["build", "push", "check"];

function defaultForm() {
  return {
    severity: "warning" as BroadcastSeverity,
    message: "",
    since: "",
    until: "",
    commands: [] as BroadcastCommand[],
  };
}

export function BroadcastsPanel() {
  const { data, isLoading, refetch } = useEndpoint(getBroadcasts, {});
  const entries = useMemo(() => data?.entries ?? [], [data]);
  const filePath = data?.path ?? "";

  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(defaultForm);

  const save = useCallback(async (updated: BroadcastEntry[]): Promise<boolean> => {
    setSaving(true);
    setError(null);
    try {
      const result = await fetchEndpoint(writeBroadcasts, {}, { body: { entries: updated } });
      if (!result.ok) {
        setError("error" in result ? result.error : "Save failed");
        return false;
      }
      void refetch();
      return true;
    // eslint-disable-next-line promise-safety/no-absorbed-failure -- the error IS surfaced to the user via setError(String(e)); false is the save-handler's failure status the caller branches on, not a swallowed error
    } catch (e) {
      setError(String(e));
      return false;
    } finally {
      setSaving(false);
    }
  }, [refetch]);

  const handleDelete = useCallback(
    async (index: number) => {
      await save(entries.filter((_, i) => i !== index));
    },
    [entries, save],
  );

  const handleAdd = useCallback(async () => {
    if (!form.message.trim()) return;
    const entry: BroadcastEntry = {
      severity: form.severity,
      message: form.message.trim(),
    };
    if (form.since.trim()) entry.since = form.since.trim();
    if (form.until.trim()) entry.until = form.until.trim();
    if (form.commands.length > 0) entry.commands = [...form.commands];
    const ok = await save([...entries, entry]);
    if (ok) {
      setForm(defaultForm);
      setShowForm(false);
    }
  }, [form, entries, save]);

  const toggleCommand = (cmd: BroadcastCommand) => {
    setForm((f) => ({
      ...f,
      commands: f.commands.includes(cmd)
        ? f.commands.filter((c) => c !== cmd)
        : [...f.commands, cmd],
    }));
  };

  return (
    <Stack gap="none" className="h-full">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-lg py-md">
        <div className="min-w-0">
          <Text as="span" variant="label">Broadcast Messages</Text>
          {filePath && (
            <p
              // eslint-disable-next-line spacing/no-adhoc-spacing -- tiny one-off offset below label, no parent gap to own it
              className="mt-0.5 truncate font-mono text-3xs text-muted-foreground/50"
              title={filePath}
            >
              {filePath}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-xs">
          <ControlSizeProvider size="sm">
            <IconButton
              icon={MdRefresh}
              label="Refresh"
              variant="ghost"
              onClick={() => refetch()}
            />
            <Button
              className="gap-xs"
              onClick={() => setShowForm((v) => !v)}
            >
              <MdAdd className="size-4" />
              Add
            </Button>
          </ControlSizeProvider>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <Text as="div" variant="caption" className="border-b bg-destructive/10 px-lg py-sm text-destructive">
          {error}
        </Text>
      )}

      {/* Add form */}
      {showForm && (
        <Stack gap="sm" className="border-b bg-muted/30 px-lg py-md">
          {/* Severity */}
          <div className="flex items-center gap-sm">
            <Text as="span" variant="caption" className="w-16 shrink-0 text-muted-foreground">Severity</Text>
            <div className="flex gap-xs">
              {(["error", "warning", "info"] as BroadcastSeverity[]).map((s) => (
                <ToggleChip
                  key={s}
                  variant="ghost"
                  active={form.severity === s}
                  onClick={() => setForm((f) => ({ ...f, severity: s }))}
                  className={form.severity === s ? SEVERITY_STYLES[s] : undefined}
                >
                  {s}
                </ToggleChip>
              ))}
            </div>
          </div>

          {/* Message */}
          <div className="flex gap-sm">
            {/* eslint-disable-next-line spacing/no-adhoc-spacing -- one-off top offset to baseline-align label with textarea */}
            <Text as="span" variant="caption" className="mt-1.5 w-16 shrink-0 text-muted-foreground">Message</Text>
            <textarea
              className="w-full resize-none rounded-md border bg-background px-sm py-xs text-caption focus:outline-none focus:ring-1 focus:ring-ring"
              rows={2}
              placeholder="Rebase required: breaking DB changes landed in abc1234"
              value={form.message}
              onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))}
            />
          </div>

          {/* Since / Until */}
          <div className="flex items-center gap-sm">
            <Text as="span" variant="caption" className="w-16 shrink-0 text-muted-foreground">Since</Text>
            <input
              className="w-28 rounded-md border bg-background px-sm py-xs font-mono text-caption focus:outline-none focus:ring-1 focus:ring-ring"
              placeholder="abc1234"
              value={form.since}
              onChange={(e) => setForm((f) => ({ ...f, since: e.target.value }))}
            />
            <Text as="span" variant="caption" className="text-muted-foreground">Until</Text>
            <input
              className="w-28 rounded-md border bg-background px-sm py-xs font-mono text-caption focus:outline-none focus:ring-1 focus:ring-ring"
              placeholder="def5678"
              value={form.until}
              onChange={(e) => setForm((f) => ({ ...f, until: e.target.value }))}
            />
          </div>

          {/* Commands filter */}
          <div className="flex items-center gap-sm">
            <Text as="span" variant="caption" className="w-16 shrink-0 text-muted-foreground">Commands</Text>
            <div className="flex items-center gap-sm">
              {ALL_COMMANDS.map((cmd) => (
                <label key={cmd} className="flex cursor-pointer items-center gap-xs">
                  <input
                    type="checkbox"
                    className="size-3"
                    checked={form.commands.includes(cmd)}
                    onChange={() => toggleCommand(cmd)}
                  />
                  <Text as="span" variant="caption">{cmd}</Text>
                </label>
              ))}
              {form.commands.length === 0 && (
                // eslint-disable-next-line spacing/no-adhoc-spacing -- one-off inline gap after checkboxes
                <Text as="span" variant="caption" className="ml-1 italic text-muted-foreground">(all)</Text>
              )}
            </div>
          </div>

          {/* Form actions */}
          <ControlSizeProvider size="sm">
            <Stack direction="row" gap="sm" justify="end">
              <Button
                variant="ghost"
                onClick={() => {
                  setShowForm(false);
                  setForm(defaultForm);
                }}
              >
                Cancel
              </Button>
              <Button
                loading={saving}
                disabled={!form.message.trim()}
                onClick={() => handleAdd()}
              >
                Add
              </Button>
            </Stack>
          </ControlSizeProvider>
        </Stack>
      )}

      {/* Entry list */}
      <Scroll fill>
        {isLoading ? (
          <Center className="h-full">
            <Loading />
          </Center>
        ) : entries.length === 0 ? (
          <Center className="h-full">
            <Text as="div" variant="body" className="text-muted-foreground">
              No active broadcasts
            </Text>
          </Center>
        ) : (
          <ul className="divide-y">
            {entries.map((entry, i) => (
              <li key={i} className="flex items-start gap-md px-lg py-md hover:bg-muted/30">
                <Badge
                  colorClass={SEVERITY_STYLES[entry.severity]}
                  // eslint-disable-next-line spacing/no-adhoc-spacing -- one-off top offset to align badge with first text line
                  className="mt-0.5 shrink-0"
                >
                  {entry.severity}
                </Badge>
                <div className="min-w-0 flex-1">
                  <Text as="p" variant="body">{entry.message}</Text>
                  {(entry.since ?? entry.until ?? entry.commands) && (
                    // eslint-disable-next-line spacing/no-adhoc-spacing -- one-off top offset below message line
                    <div className="mt-1 flex flex-wrap items-center gap-sm font-mono text-3xs text-muted-foreground">
                      {entry.since && <span>since: {entry.since.slice(0, 8)}</span>}
                      {entry.until && <span>until: {entry.until.slice(0, 8)}</span>}
                      {entry.commands && (
                        <span className="font-sans">[{entry.commands.join(", ")}]</span>
                      )}
                    </div>
                  )}
                </div>
                <ControlSizeProvider size="xs">
                  <IconButton
                    icon={MdDelete}
                    label="Delete"
                    variant="ghost"
                    className="text-muted-foreground hover:text-destructive"
                    loading={saving}
                    onClick={() => handleDelete(i)}
                  />
                </ControlSizeProvider>
              </li>
            ))}
          </ul>
        )}
      </Scroll>
    </Stack>
  );
}
