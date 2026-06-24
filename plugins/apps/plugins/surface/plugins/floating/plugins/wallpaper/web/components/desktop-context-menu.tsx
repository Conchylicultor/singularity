import { useState } from "react";
import type { MouseEvent } from "react";
import { MdImage, MdRestartAlt } from "react-icons/md";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { useConfig, useSetConfig } from "@plugins/config_v2/web";
import { wallpaperConfig } from "../../core";
import { openWallpaperPicker } from "./wallpaper-picker";

interface MenuAnchor {
  x: number;
  y: number;
}

/**
 * The desktop context menu host: a transparent full-surface capture layer that
 * opens a cursor-anchored menu on right-click of the empty desktop. Owns the
 * config read/write (whether an image is set, the reset action) and the cursor
 * anchor; delegates the actual menu chrome to {@link DesktopContextMenuContent},
 * which renders no config so the config-picker lint rule (rightly) doesn't apply
 * — this is a desktop affordance, not a config-editing picker.
 *
 * The capture layer is mounted as the FIRST child of the floating backdrop (below
 * the dock + windows), so a right-click on a window hits that window's own system
 * menu instead — only the empty desktop reaches here. The anchored-menu pattern
 * (a zero-size fixed trigger at the cursor) is from `window-system-menu.tsx`.
 */
export function DesktopContextMenu() {
  const [anchor, setAnchor] = useState<MenuAnchor | null>(null);
  const { state } = useConfig(wallpaperConfig);
  const setConfig = useSetConfig(wallpaperConfig);

  const onContextMenu = (e: MouseEvent) => {
    e.preventDefault();
    setAnchor({ x: e.clientX, y: e.clientY });
  };

  const resetToDefault = () => {
    setConfig("state", {
      kind: "default",
      version: state.version,
      mime: "",
      attribution: {},
    });
  };

  return (
    <>
      {/* Transparent full-surface right-click capture layer for the empty desktop.
          Carries no visual; only the handler. */}
      <div
        aria-hidden
        onContextMenu={onContextMenu}
        // eslint-disable-next-line layout/no-adhoc-layout -- transparent full-bleed right-click capture layer for the empty desktop; it is itself the absolute backdrop-level layer, not an Overlay wrapping content
        className="absolute inset-0"
      />
      <DesktopContextMenuContent
        anchor={anchor}
        onClose={() => setAnchor(null)}
        hasImage={state.kind === "image"}
        onReset={resetToDefault}
      />
    </>
  );
}

/**
 * The presentational cursor-anchored desktop menu. Pure chrome — it reads no
 * config; the host passes the resolved `hasImage` flag + the reset action.
 */
function DesktopContextMenuContent({
  anchor,
  onClose,
  hasImage,
  onReset,
}: {
  anchor: MenuAnchor | null;
  onClose: () => void;
  hasImage: boolean;
  onReset: () => void;
}) {
  return (
    <DropdownMenu
      open={anchor !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DropdownMenuTrigger
        aria-hidden
        tabIndex={-1}
        style={{
          position: "fixed",
          left: anchor?.x ?? 0,
          top: anchor?.y ?? 0,
          width: 0,
          height: 0,
        }}
      />
      <DropdownMenuContent align="start" side="bottom">
        <DropdownMenuItem onClick={openWallpaperPicker}>
          <MdImage />
          Change wallpaper…
        </DropdownMenuItem>
        {hasImage && (
          <DropdownMenuItem onClick={onReset}>
            <MdRestartAlt />
            Reset to default
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
