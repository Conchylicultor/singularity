export interface Check {
  id: string;
  description: string;
  run(): Promise<CheckResult>;
}

export type CheckResult =
  | { ok: true }
  | { ok: false; message: string; hint?: string };
