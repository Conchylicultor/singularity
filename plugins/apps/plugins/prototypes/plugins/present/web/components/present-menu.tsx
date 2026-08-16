import { useCallback, useState } from "react";
import {
  MdExpandMore,
  MdFullscreen,
  MdOpenInFull,
  MdOpenInNew,
} from "react-icons/md";
import {
  Button,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import {
  prototypeUrl,
  prototypesVersionResource,
} from "@plugins/apps/plugins/prototypes/plugins/files/core";
import { prototypeDetailPane } from "@plugins/apps/plugins/prototypes/plugins/gallery/web";
import { PresentOverlay } from "./present-overlay";

/** Where the prototype is shown when presented; `null` = not presenting. */
type PresentMode = "tab" | "fullscreen" | null;

/**
 * "Present" — the three ways to see the prototype without the app around it:
 * filling this browser tab, filling the screen, or opened as its own document
 * in a new browser tab (the last one leaves the app entirely, so it presents
 * nothing here).
 *
 * Contributed into `prototypeDetailPane.Actions`, so this whole feature is one
 * folder the detail pane knows nothing about.
 */
export function PresentMenu() {
  const { name } = prototypeDetailPane.useParams();
  const [mode, setMode] = useState<PresentMode>(null);
  // Stable: the overlay's fullscreen effect keys on this callback, and a fresh
  // identity each render would re-run it (exit + re-request every render).
  const close = useCallback(() => setMode(null), []);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="outline" />}>
          Present
          <MdExpandMore />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => setMode("tab")}>
            <MdOpenInFull className="size-4 text-muted-foreground" />
            In this tab
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setMode("fullscreen")}>
            <MdFullscreen className="size-4 text-muted-foreground" />
            Fullscreen
          </DropdownMenuItem>
          <NewTabItem name={name} />
        </DropdownMenuContent>
      </DropdownMenu>
      {mode !== null && (
        <PresentOverlay
          name={name}
          fullscreen={mode === "fullscreen"}
          onClose={close}
        />
      )}
    </>
  );
}

/**
 * Opens the raw prototype document as its own browser tab. The URL carries the
 * same `?v=` cache-bust the in-app iframes use, so a new tab never opens a copy
 * an agent has already edited past — which is why the item waits for the
 * version rather than opening an un-busted URL while it loads.
 */
function NewTabItem({ name }: { name: string }) {
  const versionResult = useResource(prototypesVersionResource);
  if (versionResult.pending) {
    return (
      <DropdownMenuItem disabled>
        <MdOpenInNew className="size-4 text-muted-foreground" />
        New tab
      </DropdownMenuItem>
    );
  }
  const v = versionResult.data;
  return (
    <DropdownMenuItem
      onClick={() =>
        window.open(prototypeUrl(name, { v }), "_blank", "noopener,noreferrer")
      }
    >
      <MdOpenInNew className="size-4 text-muted-foreground" />
      New tab
    </DropdownMenuItem>
  );
}
