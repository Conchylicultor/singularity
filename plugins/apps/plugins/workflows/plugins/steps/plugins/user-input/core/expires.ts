import { z } from "zod";

/**
 * Configurable bound on how long a `user-input` step may wait for a human.
 * There is deliberately **no "never" option** — every wait is bounded by
 * construction so a suspended run always reaches a terminal state.
 */
export const ExpiresAfterSchema = z.object({
  amount: z.number().int().positive(),
  unit: z.enum(["minutes", "hours", "days"]),
});
export type ExpiresAfter = z.infer<typeof ExpiresAfterSchema>;

/** Default deadline applied when the step config omits `expiresAfter`. */
export const DEFAULT_EXPIRES_AFTER: ExpiresAfter = { amount: 7, unit: "days" };

const MS_PER_UNIT: Record<ExpiresAfter["unit"], number> = {
  minutes: 60_000,
  hours: 3_600_000,
  days: 86_400_000,
};

/** Hard ceiling so a typo (e.g. 9999 days) can't schedule an absurd racer. */
export const MAX_EXPIRES_MS = 30 * MS_PER_UNIT.days;

/**
 * Resolves a user-input step config to its wait timeout in milliseconds.
 * Falls back to {@link DEFAULT_EXPIRES_AFTER} when unset and clamps to
 * {@link MAX_EXPIRES_MS}.
 */
export function resolveTimeoutMs(config: { expiresAfter?: ExpiresAfter } | undefined): number {
  const { amount, unit } = config?.expiresAfter ?? DEFAULT_EXPIRES_AFTER;
  const ms = amount * MS_PER_UNIT[unit];
  return Math.min(ms, MAX_EXPIRES_MS);
}
