export interface Step {
  id: string;
  label: string;
}

export interface SegmentedProgressBarProps<T extends string = string> {
  steps: readonly { id: T; label: string }[];
  activeStep: T;
  compact?: boolean;
}
