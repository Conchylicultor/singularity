import { useId, useState, type ReactNode } from "react";
import { SiGithub } from "react-icons/si";
import {
  Button,
  ControlSizeProvider,
  cn,
} from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { Badge } from "@plugins/primitives/plugins/css/plugins/badge/web";
import { Fill } from "@plugins/primitives/plugins/css/plugins/fill/web";
import {
  Stack,
  insetClass,
} from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Switch } from "@plugins/primitives/plugins/css/plugins/switch/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { TextEditor } from "@plugins/primitives/plugins/text-editor/web";
import { SOURCE_URL } from "@plugins/apps/plugins/website/plugins/shell/core";
import { buildIssueUrl } from "../../core";
import { ReplaySteps, type ReplayRun } from "./replay-steps";

/** What the visitor has written so far. Owned by the header item, so it
 * survives the popover closing and reopening. */
export interface ImproveDraft {
  text: string;
  autoDeploy: boolean;
}

export const EMPTY_DRAFT: ImproveDraft = { text: "", autoDeploy: false };

/** A replay in progress, with everything it needs fixed at the moment it started. */
interface Replay extends ReplayRun {
  /** The page the idea was written on — the address when "Show me" was pressed. */
  pageUrl: string;
}

type PanelView = { kind: "compose" } | { kind: "replay"; replay: Replay };

/** Four base-36 characters, for the pretend branch name. */
function branchSuffix(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(4)), (byte) =>
    (byte % 36).toString(36),
  ).join("");
}

/**
 * Moves focus to the element as it mounts. A module-level function, so its
 * identity never changes and React calls it once, on attach — not again on
 * every render as an inline arrow would be.
 *
 * Used for "File it": the control that took the visitor to the replay ("Show
 * me", or the field on ⌘↵) has just unmounted, so focus would otherwise fall to
 * the page, and a popover with nothing focused in it is one a keyboard user can
 * no longer act in. "File it" is the replay's one action.
 */
function focusOnMount(el: HTMLElement | null) {
  el?.focus();
}

/**
 * The Improve popover's body: write an idea, watch what equin would do with it,
 * then file it on GitHub.
 *
 * Two views. **Compose** is the idea and the auto-deploy choice. **Replay** is a
 * scripted, sped-up run of equin's loop on that idea, and the link that files it.
 * Nothing here posts anywhere: no agent runs on the public site, so the only
 * place the idea can honestly land is a GitHub issue the visitor opens
 * themselves.
 *
 * The view is local — reopening the popover starts back at Compose — but the
 * draft is the caller's, so closing the popover never loses what was written.
 */
export function ImprovePanel({
  draft,
  onDraftChange,
  onFiled,
}: {
  draft: ImproveDraft;
  onDraftChange: (draft: ImproveDraft) => void;
  /** "File it" was clicked: the browser is opening the issue form. */
  onFiled: () => void;
}) {
  const [view, setView] = useState<PanelView>({ kind: "compose" });

  const showMe = () => {
    const text = draft.text.trim();
    if (text === "") return;
    setView({
      kind: "replay",
      replay: {
        text,
        autoDeploy: draft.autoDeploy,
        branch: `improve-${branchSuffix()}`,
        pageUrl: window.location.href,
        reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)")
          .matches,
      },
    });
  };

  return (
    <ControlSizeProvider size="sm">
      {view.kind === "compose" ? (
        <ComposeView
          draft={draft}
          onDraftChange={onDraftChange}
          onShowMe={showMe}
        />
      ) : (
        <ReplayView replay={view.replay} onFiled={onFiled} />
      )}
    </ControlSizeProvider>
  );
}

/** The panel's closing strip: a hairline, then one row of note and action. */
function PanelFooter({ children }: { children: ReactNode }) {
  return (
    <Stack
      direction="row"
      gap="md"
      align="center"
      className={cn("border-border border-t", insetClass({ t: "md" }))}
    >
      {children}
    </Stack>
  );
}

function ComposeView({
  draft,
  onDraftChange,
  onShowMe,
}: {
  draft: ImproveDraft;
  onDraftChange: (draft: ImproveDraft) => void;
  onShowMe: () => void;
}) {
  const switchId = useId();
  return (
    <Stack gap="md">
      <Stack gap="xs">
        <Text
          as="h2"
          variant="subheading"
          className="font-semibold tracking-tight"
        >
          Improve this page
        </Text>
        <Text as="p" variant="label" tone="muted">
          Say what you'd change, and an agent builds it in its own copy of the
          app while you keep working.
        </Text>
      </Stack>
      <TextEditor
        value={draft.text}
        onChange={(text) => onDraftChange({ ...draft, text })}
        onSubmit={onShowMe}
        submitMode="cmd-enter"
        minRows={4}
        autoFocus
        namespace="website-improve"
        placeholder="e.g. Show a 20-second demo under the headline"
      />
      <PanelFooter>
        <Fill>
          <Stack direction="row" gap="sm" align="start">
            <Switch
              id={switchId}
              checked={draft.autoDeploy}
              onCheckedChange={(autoDeploy) =>
                onDraftChange({ ...draft, autoDeploy })
              }
            />
            {/* A `<label for>` names the switch with BOTH lines, so a screen
                reader hears "no review" as part of what it is turning on — and
                clicking either line flips it, as a label does. */}
            <label htmlFor={switchId} className="cursor-pointer select-none">
              <Stack as="span" gap="none">
                <Text variant="label">Auto-deploy</Text>
                <Text variant="caption" tone="muted">
                  Ships as soon as checks pass, no review
                </Text>
              </Stack>
            </label>
          </Stack>
        </Fill>
        <Button disabled={draft.text.trim() === ""} onClick={onShowMe}>
          Show me
        </Button>
      </PanelFooter>
    </Stack>
  );
}

function ReplayView({
  replay,
  onFiled,
}: {
  replay: Replay;
  onFiled: () => void;
}) {
  const href = buildIssueUrl({
    repoUrl: SOURCE_URL,
    text: replay.text,
    pageUrl: replay.pageUrl,
    autoDeploy: replay.autoDeploy,
  });

  return (
    <Stack gap="md">
      <Stack gap="xs">
        <Stack direction="row" gap="md" align="center">
          <Fill>
            <Text
              as="h2"
              variant="subheading"
              className="font-semibold tracking-tight"
            >
              What equin would do now
            </Text>
          </Fill>
          <Badge shape="pill">Replay</Badge>
        </Stack>
        <Text as="p" variant="label" tone="muted">
          Scripted and sped up. A real run takes a few minutes.
        </Text>
      </Stack>
      <ReplaySteps run={replay} />
      <PanelFooter>
        <Fill>
          <Text as="p" variant="caption" className="text-muted-foreground/60">
            No agent runs here, so your idea goes to GitHub.
          </Text>
        </Fill>
        {/* A real link, live from the first frame of the replay: the visitor
            may skip the replay, and the browser — not this code — opens the
            tab, so it is only ever opened by their click. Clicking it also
            closes the popover and clears the draft; the default action still
            runs, because nothing prevents it. */}
        <Button
          ref={focusOnMount}
          render={<a href={href} target="_blank" rel="noopener noreferrer" />}
          onClick={onFiled}
        >
          <SiGithub />
          File it
        </Button>
      </PanelFooter>
    </Stack>
  );
}
