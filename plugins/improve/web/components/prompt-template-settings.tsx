import { useEffect, useRef, useState } from "react";
import { resourceDescriptor, useResource } from "@core";
import { ShellCommands as Shell } from "@plugins/shell/web";
import { cn } from "@/lib/utils";
import type { ImproveConfig } from "../../shared/types";
import { DEFAULT_PROMPT_TEMPLATE } from "../../shared/types";

const improveConfigResource = resourceDescriptor<ImproveConfig>("improve.config");

async function saveTemplate(promptTemplate: string): Promise<void> {
  const res = await fetch("/api/improve/config", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ promptTemplate }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`PATCH failed: ${res.status} ${text}`);
  }
}

export function PromptTemplateSettings() {
  const { data } = useResource(improveConfigResource);
  const incoming = data?.promptTemplate ?? DEFAULT_PROMPT_TEMPLATE;
  const [local, setLocal] = useState(incoming);
  const focused = useRef(false);

  useEffect(() => {
    if (!focused.current) setLocal(incoming);
  }, [incoming]);

  const commit = async () => {
    focused.current = false;
    if (local === incoming) return;
    try {
      await saveTemplate(local);
    } catch (err) {
      Shell.Toast({
        description: `Save failed: ${(err as Error).message}`,
        variant: "error",
      });
      setLocal(incoming);
    }
  };

  const reset = async () => {
    setLocal(DEFAULT_PROMPT_TEMPLATE);
    try {
      await saveTemplate(DEFAULT_PROMPT_TEMPLATE);
    } catch (err) {
      Shell.Toast({
        description: `Reset failed: ${(err as Error).message}`,
        variant: "error",
      });
    }
  };

  return (
    <div className="flex flex-col gap-2 py-3">
      <div className="flex flex-col gap-0.5">
        <label className="text-sm font-medium">Prompt template</label>
        <p className="text-muted-foreground text-xs">
          Sent to the launched agent when submitting via Sonnet / Opus. Placeholders:{" "}
          <code>{"{{text}}"}</code>, <code>{"{{url}}"}</code>, <code>{"{{attachments}}"}</code>.
        </p>
      </div>
      <textarea
        spellCheck={false}
        rows={8}
        value={local}
        onFocus={() => {
          focused.current = true;
        }}
        onBlur={() => void commit()}
        onChange={(e) => setLocal(e.target.value)}
        className={cn(
          "w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1.5 font-mono text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30",
        )}
      />
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => void reset()}
          className="text-muted-foreground hover:text-foreground text-xs underline-offset-2 hover:underline"
        >
          Reset to default
        </button>
      </div>
    </div>
  );
}
