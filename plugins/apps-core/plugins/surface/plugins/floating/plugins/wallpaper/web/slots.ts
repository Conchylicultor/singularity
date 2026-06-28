import type { ComponentType } from "react";
import { defineSlot } from "@plugins/framework/plugins/web-sdk/core";
import type { WallpaperCandidate } from "../core";

/** Icon component convention used across the platform (react-icons/md style). */
type IconType = ComponentType<{ className?: string }>;

/**
 * The wallpaper image-source registry (collection-consumer). Each source — an
 * open-license search, an upload, a paste-URL — is a uniform contribution: a
 * tabbed Panel that produces a {@link WallpaperCandidate}. The picker reads
 * `Wallpaper.Provider.useContributions()` and renders one tab per provider,
 * never naming a specific one — a future provider drops in with zero picker
 * edits. Pattern mirrors `Sonata.Source`.
 */
export const Wallpaper = {
  Provider: defineSlot<{
    id: string;
    label: string;
    icon?: IconType;
    Panel: ComponentType<{ onPick: (candidate: WallpaperCandidate) => void }>;
  }>("floating.wallpaper-provider", { docLabel: (p) => p.label }),
};
