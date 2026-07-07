import type { ReactNode } from "react";
import { MdLock } from "react-icons/md";
import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { Clip } from "@plugins/primitives/plugins/css/plugins/clip/web";
import { Pin } from "@plugins/primitives/plugins/css/plugins/pin/web";
import { Fill } from "@plugins/primitives/plugins/css/plugins/fill/web";
import { Stack, Inset } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import type { ReleaseTargetId } from "../../core";

/**
 * The morphing frame chrome the sample app is "re-hosted" in. One shared
 * skeleton across all three targets — the wrapped app (`children`) sits at the
 * exact SAME position in the element tree for every target, so switching morphs
 * the chrome around a persistent vignette (it never unmounts) rather than
 * swapping one app for another. Only the per-target class maps and the small
 * chrome sub-parts (title bar / browser bars / OS rail + window bar) differ.
 *
 * The `transition-all` on the outer box, the screen gutter, and the window body
 * is what animates the re-host: as the class maps flip, radius / shadow / border
 * / padding tween instead of cutting.
 */

/** Outer shell: desktop & web are the app *window*; workspace is the equin desktop. */
const SHELL_CLASS: Record<ReleaseTargetId, string> = {
  desktop: "rounded-xl border border-border bg-card shadow-lg",
  web: "rounded-xl border border-border bg-card shadow-lg",
  workspace: "rounded-xl border border-border bg-background shadow-md",
};

/** Inner window body: bare for the standalone targets, a floating window in the workspace. */
const BODY_CLASS: Record<ReleaseTargetId, string> = {
  desktop: "",
  web: "",
  workspace: "rounded-lg border border-border bg-card shadow-lg",
};

const TRANSITION = "transition-all duration-300";

/** Three inert traffic-light dots — the standalone-window signature. */
function TrafficDots() {
  return (
    <Stack direction="row" align="center" gap="2xs">
      <span className="size-2.5 rounded-full bg-muted-foreground/25" />
      <span className="size-2.5 rounded-full bg-muted-foreground/25" />
      <span className="size-2.5 rounded-full bg-muted-foreground/25" />
    </Stack>
  );
}

/** Native desktop title bar: traffic lights + a centered app caption. */
function DesktopChrome() {
  return (
    <Inset x="md" y="sm" className="border-b border-border">
      <Stack direction="row" align="center" gap="sm">
        <TrafficDots />
        <Fill>
          <Text variant="caption" tone="muted" className="text-center">
            Aurora — equin native
          </Text>
        </Fill>
        {/* Mirror the dots' width, invisibly, so the caption reads dead-center. */}
        <div className="opacity-0">
          <TrafficDots />
        </div>
      </Stack>
    </Inset>
  );
}

/** Browser chrome: a single active tab over an address bar. */
function WebChrome() {
  return (
    <div className="border-b border-border">
      <Inset x="sm" t="xs">
        <Inset
          x="sm"
          y="2xs"
          className="rounded-t-md border border-b-0 border-border bg-background"
        >
          <Stack direction="row" align="center" gap="2xs">
            <span className="size-2 rounded-full bg-primary" />
            <Text variant="caption" tone="muted">
              Aurora
            </Text>
          </Stack>
        </Inset>
      </Inset>
      <Inset x="sm" y="xs">
        <Inset
          x="sm"
          y="2xs"
          className="rounded-md border border-border bg-muted"
        >
          <Stack direction="row" align="center" gap="2xs">
            <MdLock className="size-3.5 text-muted-foreground" aria-hidden />
            <Text variant="caption" tone="muted">
              aurora.equin.app
            </Text>
          </Stack>
        </Inset>
      </Inset>
    </div>
  );
}

/** Full-height app rail down the left edge of the equin desktop (workspace only). */
const RAIL_ICONS = ["a", "b", "c", "d"] as const;
function WorkspaceRail() {
  return (
    <Pin to="left" stretch decorative layer="base" className="w-8 bg-muted/40">
      <Inset x="2xs" y="sm">
        <Stack align="center" gap="xs">
          {RAIL_ICONS.map((id, i) => (
            <span
              key={id}
              className={cn(
                "size-5 rounded-md",
                i === 0 ? "bg-primary/15 ring-1 ring-primary/40" : "bg-muted",
              )}
            />
          ))}
        </Stack>
      </Inset>
    </Pin>
  );
}

/** The equin desktop's top tab-bar hint strip (workspace only). */
function WorkspaceTopStrip() {
  return (
    <Inset x="sm" y="2xs" className="rounded-md border border-border bg-muted">
      <Stack direction="row" align="center" gap="2xs">
        <span className="size-2 rounded-full bg-primary" />
        <Text variant="caption" tone="muted">
          Aurora
        </Text>
        <Fill>
          <span className="block h-1.5 rounded-full bg-muted-foreground/15" />
        </Fill>
      </Stack>
    </Inset>
  );
}

/** The floating window's own slim title bar (workspace only). */
function WorkspaceWindowBar() {
  return (
    <Inset x="sm" y="2xs" className="border-b border-border">
      <Stack direction="row" align="center" gap="2xs">
        <span className="size-2 rounded-full bg-muted-foreground/25" />
        <span className="size-2 rounded-full bg-muted-foreground/25" />
        <span className="size-2 rounded-full bg-muted-foreground/25" />
        <Text variant="caption" tone="muted" className="text-center">
          Aurora
        </Text>
      </Stack>
    </Inset>
  );
}

export interface TargetFrameProps {
  target: ReleaseTargetId;
  /** The persistent sample app, framed by this target's chrome. */
  children: ReactNode;
}

/**
 * Frames `children` as the given release target. The element positions below are
 * identical for every `target` (only class maps and the null-able chrome parts
 * change), so React keeps `children` mounted across a target switch — the whole
 * point of the demo.
 */
export function TargetFrame({ target, children }: TargetFrameProps) {
  const isWorkspace = target === "workspace";
  return (
    <Clip
      as="figure"
      role="group"
      aria-label="Release preview"
      data-release-target={target}
      className={cn("relative w-full", TRANSITION, SHELL_CLASS[target])}
    >
      <Stack gap="none">
        {/* Top chrome for the standalone targets; the workspace draws its own. */}
        {target === "desktop" && <DesktopChrome />}
        {target === "web" && <WebChrome />}
        <Inset
          pad={isWorkspace ? "md" : "none"}
          l={isWorkspace ? "2xl" : undefined}
          className={TRANSITION}
        >
          <Stack gap="sm">
            {isWorkspace && <WorkspaceTopStrip />}
            <div className={cn(TRANSITION, BODY_CLASS[target])}>
              {isWorkspace && <WorkspaceWindowBar />}
              <Inset pad="md">{children}</Inset>
            </div>
          </Stack>
        </Inset>
      </Stack>
      {isWorkspace && <WorkspaceRail />}
    </Clip>
  );
}
