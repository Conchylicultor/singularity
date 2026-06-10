import type { PluginLoadError } from "@plugins/framework/plugins/web-sdk/core";
import { Text } from "@plugins/primitives/plugins/text/web";

export function PluginLoadErrors({ errors }: { errors: PluginLoadError[] }) {
  return (
    <Text
      as="div"
      variant="caption"
      className="fixed top-0 right-0 left-0 z-max bg-destructive px-3 py-1.5 text-destructive-foreground"
    >
      {errors.map((e, i) => (
        <span key={i} className="mr-4">
          <span className="font-semibold">{e.pluginPath}</span>{" "}
          <span className="opacity-80">
            {e.error instanceof Error ? e.error.message : String(e.error)}
          </span>
        </span>
      ))}
    </Text>
  );
}
