import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { useConfig } from "@plugins/config_v2/web";
import type { ConfigRegistration } from "@plugins/config_v2/web";

export function ConfigNavRow({
  registration,
  selected,
  onClick,
}: {
  registration: ConfigRegistration;
  selected: boolean;
  onClick: () => void;
}) {
  const values = useConfig(registration.descriptor);
  const defaults = registration.descriptor.defaults as Record<string, unknown>;

  const modifiedCount = useMemo(() => {
    let count = 0;
    for (const key of Object.keys(registration.descriptor.fields)) {
      if (values[key] !== defaults[key]) count++;
    }
    return count;
  }, [values, defaults, registration.descriptor.fields]);

  return (
    <button
      onClick={onClick}
      className={cn(
        "flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm",
        "hover:bg-accent",
        selected && "bg-accent",
      )}
    >
      <span className="truncate">{registration.pluginName}</span>
      {modifiedCount > 0 && (
        <span className="ml-2 flex size-5 shrink-0 items-center justify-center rounded-full bg-primary text-[10px] font-medium text-primary-foreground">
          {modifiedCount}
        </span>
      )}
    </button>
  );
}
