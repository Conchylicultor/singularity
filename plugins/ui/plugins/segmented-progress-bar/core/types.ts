export interface Step<T extends string = string> {
  id: T;
  label: string;
  /** What this step means, in one line — the steps tooltip lists it under the label so a new user learns what each step stands for. */
  description: string;
}

export interface SegmentedProgressBarProps<T extends string = string> {
  steps: readonly Step<T>[];
  activeStep: T;
  /** What the whole bar tracks, in one line — the steps tooltip's subtitle. */
  summary: string;
  compact?: boolean;
}
