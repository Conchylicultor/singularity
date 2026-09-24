import { useState } from "react";
import type { SpecimenProps } from "@plugins/plugin-meta/plugins/specimens/web";
import type { LaunchOptionValues } from "@plugins/tasks/plugins/launch-options/web";
import { useCaptureUrlDefault } from "../use-capture-url-default";
import { TaskDraftComposer } from "./task-draft-composer";

/**
 * The Improve popover's composer, exhibited on its own (a specimen): the real
 * field, URL toggle, prose actions and launch-option pills, seeded from the
 * same defaults the popover uses. An exhibit, not a working copy — typing and
 * toggling work, submitting does nothing.
 */
export function ComposerSpecimen(_props: SpecimenProps) {
  const captureUrlDefault = useCaptureUrlDefault();
  const [text, setText] = useState("");
  const [launchOptions, setLaunchOptions] = useState<LaunchOptionValues>({});
  const [includeUrl, setIncludeUrl] = useState(captureUrlDefault);
  return (
    <TaskDraftComposer
      cardId="specimen"
      text={text}
      launchOptions={launchOptions}
      autoFocus={false}
      disabled={false}
      onTextChange={setText}
      onLaunchOptionsChange={setLaunchOptions}
      onSubmitChord={() => {}}
      isHead
      includeUrl={includeUrl}
      onToggleUrl={setIncludeUrl}
      relate={null}
    />
  );
}
