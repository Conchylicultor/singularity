import { useState, useEffect, useCallback } from "react";
import { MdAdd, MdDelete, MdRefresh } from "react-icons/md";
import { Badge } from "@plugins/primitives/plugins/badge/web";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

type BroadcastSeverity = "error" | "warning" | "info";
type BroadcastCommand = "build" | "push" | "check";

interface BroadcastEntry {
  severity: BroadcastSeverity;
  message: string;
  since?: string;
  until?: string;
  commands?: BroadcastCommand[];
}

type ReadResponse = { ok: true; entries: BroadcastEntry[]; path: string };
type WriteResponse = { ok: true } | { ok: false; error: string };

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
  const [entries, setEntries] = useState<BroadcastEntry[]>([]);
  const [filePath, setFilePath] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(defaultForm);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/debug/broadcasts");
      const data = (await res.json()) as ReadResponse;
      setEntries(data.entries);
      setFilePath(data.path);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = useCallback(async (updated: BroadcastEntry[]): Promise<boolean> => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/debug/broadcasts", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entries: updated }),
      });
      const data = (await res.json()) as WriteResponse;
      if (!data.ok) {
        setError("error" in data ? data.error : "Save failed");
        return false;
      }
      setEntries(updated);
      return true;
    } catch (e) {
      setError(String(e));
      return false;
    } finally {
      setSaving(false);
    }
  }, []);

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
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="min-w-0">
          <span className="text-sm font-medium">Broadcast Messages</span>
          {filePath && (
            <p
              className="mt-0.5 truncate font-mono text-[9px] text-muted-foreground/50"
              title={filePath}
            >
              {filePath}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            onClick={() => void load()}
            title="Refresh"
          >
            <MdRefresh className="size-4" />
          </Button>
          <Button
            size="sm"
            className="h-7 gap-1"
            onClick={() => setShowForm((v) => !v)}
          >
            <MdAdd className="size-4" />
            Add
          </Button>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="border-b bg-destructive/10 px-4 py-2 text-xs text-destructive">
          {error}
        </div>
      )}

      {/* Add form */}
      {showForm && (
        <div className="flex flex-col gap-2.5 border-b bg-muted/30 px-4 py-3">
          {/* Severity */}
          <div className="flex items-center gap-2">
            <span className="w-16 shrink-0 text-xs text-muted-foreground">Severity</span>
            <div className="flex gap-1">
              {(["error", "warning", "info"] as BroadcastSeverity[]).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, severity: s }))}
                  className={cn(
                    "rounded px-2 py-0.5 text-xs font-medium transition-all",
                    form.severity === s
                      ? SEVERITY_STYLES[s]
                      : "bg-muted text-muted-foreground hover:bg-muted/80",
                  )}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* Message */}
          <div className="flex gap-2">
            <span className="mt-1.5 w-16 shrink-0 text-xs text-muted-foreground">Message</span>
            <textarea
              className="flex-1 resize-none rounded border bg-background px-2 py-1.5 text-xs leading-relaxed focus:outline-none focus:ring-1 focus:ring-ring"
              rows={2}
              placeholder="Rebase required: breaking DB changes landed in abc1234"
              value={form.message}
              onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))}
            />
          </div>

          {/* Since / Until */}
          <div className="flex items-center gap-2">
            <span className="w-16 shrink-0 text-xs text-muted-foreground">Since</span>
            <input
              className="w-28 rounded border bg-background px-2 py-1 font-mono text-xs focus:outline-none focus:ring-1 focus:ring-ring"
              placeholder="abc1234"
              value={form.since}
              onChange={(e) => setForm((f) => ({ ...f, since: e.target.value }))}
            />
            <span className="text-xs text-muted-foreground">Until</span>
            <input
              className="w-28 rounded border bg-background px-2 py-1 font-mono text-xs focus:outline-none focus:ring-1 focus:ring-ring"
              placeholder="def5678"
              value={form.until}
              onChange={(e) => setForm((f) => ({ ...f, until: e.target.value }))}
            />
          </div>

          {/* Commands filter */}
          <div className="flex items-center gap-2">
            <span className="w-16 shrink-0 text-xs text-muted-foreground">Commands</span>
            <div className="flex items-center gap-2">
              {ALL_COMMANDS.map((cmd) => (
                <label key={cmd} className="flex cursor-pointer items-center gap-1">
                  <input
                    type="checkbox"
                    className="size-3"
                    checked={form.commands.includes(cmd)}
                    onChange={() => toggleCommand(cmd)}
                  />
                  <span className="text-xs">{cmd}</span>
                </label>
              ))}
              {form.commands.length === 0 && (
                <span className="ml-1 text-xs italic text-muted-foreground">(all)</span>
              )}
            </div>
          </div>

          {/* Form actions */}
          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="h-7"
              onClick={() => {
                setShowForm(false);
                setForm(defaultForm);
              }}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              className="h-7"
              disabled={!form.message.trim() || saving}
              onClick={() => void handleAdd()}
            >
              Add
            </Button>
          </div>
        </div>
      )}

      {/* Entry list */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            Loading…
          </div>
        ) : entries.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            No active broadcasts
          </div>
        ) : (
          <ul className="divide-y">
            {entries.map((entry, i) => (
              <li key={i} className="flex items-start gap-3 px-4 py-3 hover:bg-muted/30">
                <Badge
                  size="sm"
                  colorClass={SEVERITY_STYLES[entry.severity]}
                  className="mt-0.5 shrink-0"
                >
                  {entry.severity}
                </Badge>
                <div className="min-w-0 flex-1">
                  <p className="text-sm">{entry.message}</p>
                  {(entry.since ?? entry.until ?? entry.commands) && (
                    <div className="mt-1 flex flex-wrap items-center gap-2 font-mono text-[10px] text-muted-foreground">
                      {entry.since && <span>since: {entry.since.slice(0, 8)}</span>}
                      {entry.until && <span>until: {entry.until.slice(0, 8)}</span>}
                      {entry.commands && (
                        <span className="font-sans">[{entry.commands.join(", ")}]</span>
                      )}
                    </div>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-6 shrink-0 text-muted-foreground hover:text-destructive"
                  disabled={saving}
                  onClick={() => void handleDelete(i)}
                  title="Delete"
                >
                  <MdDelete className="size-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
