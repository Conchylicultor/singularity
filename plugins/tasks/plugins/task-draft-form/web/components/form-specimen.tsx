import { useState } from "react";
import type { SpecimenProps } from "@plugins/plugin-meta/plugins/specimens/web";
import type { TaskChainRelateMode } from "@plugins/tasks/core";
import { useLaunchOptionDefaults } from "@plugins/tasks/plugins/launch-options/web";
import { useCaptureUrlDefault } from "../use-capture-url-default";
import { TaskDraftForm, makeCard, type CardDraft } from "./task-draft-form";

/**
 * The whole Improve popover form, exhibited on its own (a specimen): the
 * header, the chain of composers with their grips and connectors, and the
 * footer — seeded from the same defaults the popover uses, with the Dependency
 * pill on, as when Improve is opened from a task.
 *
 * An exhibit, not a working copy: adding, reordering, linking and removing
 * tasks all work, but Create and Cancel do nothing — nothing is ever filed.
 * There is no real related task behind the Dependency pill, so its follow-up
 * "Insert before" group never appears here.
 */
export function FormSpecimen(_props: SpecimenProps) {
  const optionDefaults = useLaunchOptionDefaults();
  const captureUrlDefault = useCaptureUrlDefault();
  const [cards, setCards] = useState<CardDraft[]>(() => [
    makeCard({ ...optionDefaults }, captureUrlDefault),
  ]);
  const [autoFocusId, setAutoFocusId] = useState<string | null>(null);
  const [relateMode, setRelateMode] = useState<
    TaskChainRelateMode | undefined
  >();
  return (
    <TaskDraftForm
      cards={cards}
      onCardsChange={setCards}
      autoFocusId={autoFocusId}
      onAutoFocusHandled={() => setAutoFocusId(null)}
      submitting={false}
      onSubmit={() => {}}
      onCancel={() => {}}
      relateMode={relateMode}
      onRelateModeChange={setRelateMode}
      showIndependentRelate
      heading="Improve this app"
    />
  );
}
