import { useActiveApp } from "@plugins/apps-core/web";
import { navigate } from "@plugins/apps-core/plugins/tabs/web";
import { currentRoutePath } from "@plugins/primitives/plugins/pane/web";
import { linkGestureProps } from "@plugins/primitives/plugins/link-gesture/web";
import { Button, cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { Line } from "@plugins/primitives/plugins/css/plugins/line/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { fillClasses } from "@plugins/primitives/plugins/css/plugins/fill/web";
import type { AppShellBrandForm } from "@plugins/primitives/plugins/app-shell/web";
import { AppLauncher } from "./app-launcher";

/**
 * The `AppShell.Brand` contribution. `icon` is the launcher alone (the leading
 * edge of a sidebar-less app's top chrome); `header` heads the sidebar with the
 * launcher plus the current app's name, which links to that app's own home —
 * its base path — rather than to the gallery the launcher leads to.
 */
export function AppBrand({ form }: { form: AppShellBrandForm }) {
  const active = useActiveApp();
  if (form === "icon" || !active) return <AppLauncher form={form} />;
  const home = active.app.basePath;
  return (
    <Line className="gap-2xs">
      <AppLauncher form={form} />
      <Button
        variant="ghost"
        {...linkGestureProps(({ newTab }) => {
          // Already on the app's home: nothing to navigate to.
          if (!newTab && currentRoutePath() === home) return;
          navigate(home, { newTab });
        })}
        // The name is the row's one flexible cell (it takes the slack and
        // truncates; the launcher stays rigid), its text at the leading edge
        // of that cell.
        // eslint-disable-next-line layout/no-adhoc-layout -- justify-start re-anchors Button's own centred content to the leading edge of the fill cell
        className={cn(fillClasses("x"), "justify-start")}
      >
        {/* The label rung, bold and tight, in the sidebar's emphasised text: a
            brand in the sidebar chrome, not a heading of the page. */}
        <Text
          variant="label"
          className="font-bold tracking-tight text-sidebar-accent-foreground"
        >
          {active.app.name}
        </Text>
      </Button>
    </Line>
  );
}
