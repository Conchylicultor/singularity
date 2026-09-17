import { useCallback, useState, type ComponentType } from "react";
import {
  MdExpandMore,
  MdFullscreen,
  MdOpenInFull,
  MdOpenInNew,
  MdWebAsset,
} from "react-icons/md";
import {
  Button,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { embedUrl } from "@plugins/primitives/plugins/embed/web";
import { prototypesApp } from "@plugins/apps/plugins/prototypes/plugins/shell/core";
import {
  prototypeDetailPane,
  usePrototypeDetail,
} from "@plugins/apps/plugins/prototypes/plugins/gallery/web";
import { prototypePresentRoute } from "../panes";
import { PresentOverlay, type PresentPlacement } from "./present-overlay";

/**
 * "Present" — the four ways to see the prototype without the app around it,
 * ordered by how much they cover: the app tab's surface, this browser tab, the
 * screen, and finally a separate browser tab (which leaves the app entirely, so
 * it presents nothing here).
 *
 * Contributed into `prototypeDetailPane.Actions`, so this whole feature is one
 * folder the detail pane knows nothing about.
 */
export function PresentMenu() {
  const { name } = prototypeDetailPane.useParams();
  const [placement, setPlacement] = useState<PresentPlacement | null>(null);
  // Stable: the overlay's fullscreen effect keys on this callback, and a fresh
  // identity each render would re-run it (exit + re-request every render).
  const close = useCallback(() => setPlacement(null), []);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="outline" />}>
          Present
          <MdExpandMore />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {/* Each item carries a hint line: the first three differ only in what
              they cover, which a label alone cannot say. */}
          <PresentItem
            icon={MdOpenInFull}
            label="In this app tab"
            hint="Tab bar stays — keep switching tabs"
            onClick={() => setPlacement("surface")}
          />
          <PresentItem
            icon={MdWebAsset}
            label="In this browser tab"
            hint="Covers the whole page"
            onClick={() => setPlacement("viewport")}
          />
          <PresentItem
            icon={MdFullscreen}
            label="Fullscreen"
            hint="Covers the screen"
            onClick={() => setPlacement("screen")}
          />
          <NewTabItem name={name} />
        </DropdownMenuContent>
      </DropdownMenu>
      {placement !== null && (
        // Keyed by placement: changing destination remounts the stage rather
        // than swapping one overlay's portal container under it, which React
        // would reconcile into a half-move (and reload the iframe anyway).
        <PresentOverlay
          key={placement}
          name={name}
          placement={placement}
          onClose={close}
        />
      )}
    </>
  );
}

/** One destination row: icon, label, and the muted line saying what it covers. */
function PresentItem({
  icon: Icon,
  label,
  hint,
  onClick,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  hint: string;
  onClick?: () => void;
}) {
  return (
    <DropdownMenuItem onClick={onClick}>
      <Icon className="size-4 text-muted-foreground" />
      <Stack gap="none">
        <Text>{label}</Text>
        <Text variant="caption" tone="muted">
          {hint}
        </Text>
      </Stack>
    </DropdownMenuItem>
  );
}

/**
 * Opens the presentation as a page of its own in a new browser tab — the app's
 * `present/<id>` page, chromeless (`?embed=1`), not the bare prototype document.
 * The bare document has no app around it, so nothing could draw the options
 * picker there; the page draws the same stage as the in-app presentations.
 *
 * It carries the recorded version on screen, if any; the picks need no
 * carrying, since they are the one shared record every surface reads.
 */
function NewTabItem({ name }: { name: string }) {
  const { shownVersion } = usePrototypeDetail();
  const href = embedUrl(
    prototypePresentRoute.link(prototypesApp, {
      name,
      ...(shownVersion === null ? {} : { sha: shownVersion.sha }),
    }),
    "chromeless",
  );
  return (
    <PresentItem
      icon={MdOpenInNew}
      label="New browser tab"
      hint="Opens the prototype on its own"
      onClick={() => window.open(href, "_blank", "noopener,noreferrer")}
    />
  );
}
