import { Apps, type ActiveApp, useCurrentAppId } from "@plugins/apps/web";
import { DataView } from "@plugins/primitives/plugins/data-view/web";
import { IconButton } from "@plugins/primitives/plugins/icon-button/web";
import { MdAdd } from "react-icons/md";

function navigateToPath(path: string) {
  if (window.location.pathname === path) return;
  window.history.pushState({}, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

export function AppGrid() {
  const apps = Apps.App.useContributions();
  const currentId = useCurrentAppId();
  const launchable = apps.filter((a) => a.id !== currentId);

  return (
    <DataView<ActiveApp>
      rows={launchable}
      rowKey={(a) => a.id}
      fields={[
        { id: "name", label: "Name", type: "text", value: (a) => a.tooltip },
      ]}
      views={["gallery"]}
      defaultView="gallery"
      storageKey="home:apps"
      onRowActivate={(a) =>
        a.onClick ? a.onClick() : navigateToPath(a.path)
      }
      actions={
        <IconButton
          icon={MdAdd}
          label="New app"
          variant="ghost"
          onClick={() => {}}
        />
      }
      emptyState="No apps installed."
      viewOptions={{
        // Plain literal (not the gallery child's `galleryOptions`) to respect
        // data-view's collection-consumer separation. The icon cover renders
        // the app glyph in the default card's tinted cover frame.
        gallery: {
          cover: (a: ActiveApp) => ({
            kind: "icon",
            icon: <a.icon className="size-7" />,
          }),
        },
      }}
    />
  );
}
