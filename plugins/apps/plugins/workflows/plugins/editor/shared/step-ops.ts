import type {
  DefinitionStep,
  WorkflowDefinition,
} from "@plugins/apps/plugins/workflows/plugins/engine/core";

/**
 * The shape every step op returns: the full step map plus the entry step to
 * PATCH. Both are always returned so the caller can send them verbatim — the
 * server treats `steps`/`entryStepId` as optional, but sending the complete
 * pair keeps the persisted state consistent.
 */
export interface StepPatch {
  steps: Record<string, DefinitionStep>;
  entryStepId: string | null;
}

export interface AddStepResult extends StepPatch {
  newStepId: string;
}

/** Deep-clone a single step (config + nextStepMapping), so ops never mutate `def`. */
function cloneStep(step: DefinitionStep): DefinitionStep {
  return {
    ...step,
    config: { ...step.config },
    nextStepMapping: step.nextStepMapping ? { ...step.nextStepMapping } : null,
  };
}

/** Deep-clone the whole step map. */
function cloneSteps(def: WorkflowDefinition): Record<string, DefinitionStep> {
  const out: Record<string, DefinitionStep> = {};
  for (const [id, step] of Object.entries(def.steps)) out[id] = cloneStep(step);
  return out;
}

/** A no-op result that hands back the current state unchanged. */
function passthrough(def: WorkflowDefinition): StepPatch {
  return { steps: def.steps, entryStepId: def.entryStepId };
}

/** Smallest `case-N` key not already present in the mapping. */
function uniqueCaseKey(mapping: Record<string, string> | null): string {
  let n = 1;
  while (mapping && `case-${n}` in mapping) n++;
  return `case-${n}`;
}

function freshStepId(): string {
  return `step-${crypto.randomUUID().slice(0, 8)}`;
}

/** Add a new step of the given type. Becomes the entry step iff the def is empty. */
export function addStep(
  def: WorkflowDefinition,
  pluginId: string,
  typeLabel: string,
): AddStepResult {
  const steps = cloneSteps(def);
  const id = freshStepId();
  steps[id] = {
    id,
    pluginId,
    label: typeLabel,
    config: {},
    next: null,
    nextStepMapping: null,
  };
  const wasEmpty = Object.keys(def.steps).length === 0;
  const entryStepId = wasEmpty ? id : def.entryStepId;
  return { steps, entryStepId, newStepId: id };
}

/** Drop a step and prune every dangling reference to it (next + mapping values). */
export function deleteStep(def: WorkflowDefinition, stepId: string): StepPatch {
  const steps = cloneSteps(def);
  delete steps[stepId];
  for (const step of Object.values(steps)) {
    if (step.next === stepId) step.next = null;
    if (step.nextStepMapping) {
      for (const [k, v] of Object.entries(step.nextStepMapping)) {
        if (v === stepId) delete step.nextStepMapping[k];
      }
      if (Object.keys(step.nextStepMapping).length === 0) step.nextStepMapping = null;
    }
  }
  const entryStepId = def.entryStepId === stepId ? null : def.entryStepId;
  return { steps, entryStepId };
}

/** Mark `stepId` as the entry step. */
export function setEntry(def: WorkflowDefinition, stepId: string): StepPatch {
  return { steps: cloneSteps(def), entryStepId: stepId };
}

/** Set a step's editable label. */
export function setLabel(
  def: WorkflowDefinition,
  stepId: string,
  label: string,
): StepPatch {
  const steps = cloneSteps(def);
  const step = steps[stepId];
  if (step) step.label = label;
  return { steps, entryStepId: def.entryStepId };
}

/** Set (or clear, with `null`) a step's default `next` edge. */
export function setNext(
  def: WorkflowDefinition,
  stepId: string,
  target: string | null,
): StepPatch {
  const steps = cloneSteps(def);
  const step = steps[stepId];
  if (step) step.next = target;
  return { steps, entryStepId: def.entryStepId };
}

/**
 * Draw an edge `source → target`. Fills the default `next` first; once that's
 * taken, adds a `case-N` conditional route. No self-loops, no exact duplicates.
 */
export function connect(
  def: WorkflowDefinition,
  source: string,
  target: string,
): StepPatch {
  if (source === target) return passthrough(def);
  const existing = def.steps[source];
  if (!existing) return passthrough(def);
  // An identical route already exists (default or conditional) → no-op.
  if (existing.next === target) return passthrough(def);
  if (existing.nextStepMapping && Object.values(existing.nextStepMapping).includes(target)) {
    return passthrough(def);
  }
  const steps = cloneSteps(def);
  const step = steps[source];
  if (!step) return passthrough(def);
  if (step.next == null) {
    step.next = target;
  } else {
    const mapping = step.nextStepMapping ?? {};
    mapping[uniqueCaseKey(step.nextStepMapping)] = target;
    step.nextStepMapping = mapping;
  }
  return { steps, entryStepId: def.entryStepId };
}

/** Rename a conditional-route key. Rejected (no-op) if the new key is empty or collides. */
export function setRouteKey(
  def: WorkflowDefinition,
  stepId: string,
  oldKey: string,
  newKey: string,
): StepPatch {
  if (!newKey) return passthrough(def);
  const existing = def.steps[stepId];
  if (!existing || !existing.nextStepMapping) return passthrough(def);
  if (!(oldKey in existing.nextStepMapping)) return passthrough(def);
  if (newKey === oldKey) return passthrough(def);
  if (newKey in existing.nextStepMapping) return passthrough(def);
  const steps = cloneSteps(def);
  const step = steps[stepId];
  if (!step?.nextStepMapping) return passthrough(def);
  // Rebuild preserving insertion order, swapping the renamed key in place.
  const renamed: Record<string, string> = {};
  for (const [k, v] of Object.entries(step.nextStepMapping)) {
    renamed[k === oldKey ? newKey : k] = v;
  }
  step.nextStepMapping = renamed;
  return { steps, entryStepId: def.entryStepId };
}

/** Point an existing conditional-route key at a different target step. */
export function setRouteTarget(
  def: WorkflowDefinition,
  stepId: string,
  key: string,
  target: string,
): StepPatch {
  const steps = cloneSteps(def);
  const step = steps[stepId];
  if (step && step.nextStepMapping && key in step.nextStepMapping) {
    step.nextStepMapping[key] = target;
  }
  return { steps, entryStepId: def.entryStepId };
}

/** Add a new conditional route under a fresh `case-N` key. */
export function addRoute(
  def: WorkflowDefinition,
  stepId: string,
  target: string,
): StepPatch {
  const steps = cloneSteps(def);
  const step = steps[stepId];
  if (step) {
    const mapping = step.nextStepMapping ?? {};
    mapping[uniqueCaseKey(step.nextStepMapping)] = target;
    step.nextStepMapping = mapping;
  }
  return { steps, entryStepId: def.entryStepId };
}

/** Remove a conditional route; null the mapping once it's empty. */
export function removeRoute(
  def: WorkflowDefinition,
  stepId: string,
  key: string,
): StepPatch {
  const steps = cloneSteps(def);
  const step = steps[stepId];
  if (step && step.nextStepMapping) {
    delete step.nextStepMapping[key];
    if (Object.keys(step.nextStepMapping).length === 0) step.nextStepMapping = null;
  }
  return { steps, entryStepId: def.entryStepId };
}
