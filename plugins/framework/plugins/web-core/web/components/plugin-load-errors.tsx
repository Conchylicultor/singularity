import type { PluginLoadError } from "@plugins/framework/plugins/web-sdk/core";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";

export function PluginLoadErrors({ errors }: { errors: PluginLoadError[] }) {
  return (
    <Text
      as="div"
      variant="caption"
      className="fixed top-0 right-0 left-0 z-max bg-destructive px-md py-xs text-destructive-foreground"
    >
      {errors.map((e, i) => (
        // eslint-disable-next-line spacing/no-adhoc-spacing -- trailing gap between inline error entries in a wrapping banner
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
