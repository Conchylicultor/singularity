import { useState } from "react";
import type { MouseEvent } from "react";
import { MdImage, MdRestartAlt } from "react-icons/md";
import { DropdownMenuItem } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import {
  CursorAnchoredMenu,
  type CursorAnchor,
} from "@plugins/primitives/plugins/cursor-menu/web";
import { useConfig, useSetConfig } from "@plugins/config_v2/web";
import { wallpaperConfig } from "../../core";
import { openWallpaperPicker } from "./wallpaper-picker";

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
 * menu instead — only the empty desktop reaches here. The cursor-anchored menu
 * itself is the shared {@link CursorAnchoredMenu} primitive, which body-portals its
 * zero-size anchor so `position: fixed` escapes the backdrop's `transform-gpu`.
 */
export function DesktopContextMenu() {
  const [anchor, setAnchor] = useState<CursorAnchor | null>(null);
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
  anchor: CursorAnchor | null;
  onClose: () => void;
  hasImage: boolean;
  onReset: () => void;
}) {
  return (
    <CursorAnchoredMenu anchor={anchor} onClose={onClose}>
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
    </CursorAnchoredMenu>
  );
}
