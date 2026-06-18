import { useCallback, useEffect, useRef, useState } from "react";
import { useReportSync } from "@plugins/primitives/plugins/sync-status/web";

export interface UseEditableFieldOptions<T extends string> {
  value: T;
  onSave: (next: T) => void | Promise<void>;
  debounceMs?: number;
  /**
   * When true, the server owns this field right now: mirror the incoming
   * `value` into the draft and never autosave. Lets a consumer suspend a
   * field's autosave while a structural op rewrites that field server-side,
   * so the autosave can't clobber the server's edit.
   */
  frozen?: boolean;
  /**
   * Human-readable name of the field being saved. Surfaced by the universal
   * sync-status indicator in the error state (e.g. "Couldn't save Task title").
   */
  label?: string;
}

export interface EditableField<T extends string> {
  value: T;
  onChange: (next: T) => void;
  onFocus: () => void;
  onBlur: () => void;
  flush: () => Promise<void>;
  isSaving: boolean;
  /** True when the most recent save rejected; cleared on the next success. */
  isError: boolean;
  /** Re-run the save of the current draft (drives the indicator's Retry). */
  retry: () => void;
}

export function useEditableField<T extends string>(
  opts: UseEditableFieldOptions<T>,
): EditableField<T> {
  const { value, debounceMs = 500, frozen = false, label } = opts;

  const [draft, setDraft] = useState<T>(value);
  const [isSaving, setIsSaving] = useState(false);
  const [isError, setIsError] = useState(false);
  // Explicit "this field's save completed" timestamp, reported to sync-status.
  // A persistent state value (unlike the transient isSaving boolean, which a
  // warm local socket can flip true→false inside one coalesced render).
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const focusedRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savePromiseRef = useRef<Promise<void> | null>(null);
  const lastSavedRef = useRef<T>(value);
  const onSaveRef = useRef(opts.onSave);
  const frozenRef = useRef(frozen);

  useEffect(() => {
    onSaveRef.current = opts.onSave;
    frozenRef.current = frozen;
  });

  // Entering frozen: drop any pending debounce so it can't fire after the
  // server takes over the field.
  useEffect(() => {
    if (frozen && timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, [frozen]);

  useEffect(() => {
    // While frozen, the server owns the field: mirror its `value` into the
    // draft unconditionally (bypass the focus/timer/save guards) and keep
    // lastSavedRef in sync so unfreezing fires no spurious save.
    if (!frozen) {
      if (focusedRef.current) return;
      if (timerRef.current) return;
      if (savePromiseRef.current) return;
    }
    if (Object.is(value, lastSavedRef.current)) return;
    lastSavedRef.current = value;
    setDraft(value);
  }, [value, frozen]);

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, []);

  const runSave = useCallback(async (next: T): Promise<void> => {
    const prior = savePromiseRef.current;
    const promise = (async () => {
      if (prior) {
        try {
          await prior;
        // eslint-disable-next-line promise-safety/no-bare-catch
        } catch {
          // Prior save's error is its own problem; don't block this save.
        }
      }
      try {
        await onSaveRef.current(next);
      } catch (err) {
        // Record the failure for the sync-status indicator, then re-throw so
        // flush/callers keep their existing error-propagation semantics.
        setIsError(true);
        throw err;
      }
      lastSavedRef.current = next;
      setIsError(false);
      setSavedAt(Date.now());
    })();
    savePromiseRef.current = promise;
    setIsSaving(true);
    try {
      await promise;
    } finally {
      if (savePromiseRef.current === promise) {
        savePromiseRef.current = null;
        setIsSaving(false);
      }
    }
  }, []);

  const onChange = useCallback(
    (next: T) => {
      setDraft(next);
      // While frozen, keep the display live but never schedule a save —
      // the server owns the field.
      if (frozenRef.current) return;
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        void runSave(next);
      }, debounceMs);
    },
    [debounceMs, runSave],
  );

  const onFocus = useCallback(() => {
    focusedRef.current = true;
  }, []);

  const flush = useCallback(async (): Promise<void> => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (!Object.is(draft, lastSavedRef.current)) {
      await runSave(draft);
      return;
    }
    if (savePromiseRef.current) {
      try {
        await savePromiseRef.current;
      // eslint-disable-next-line promise-safety/no-bare-catch
      } catch {
        // Surface the error to the original caller of runSave, not here.
      }
    }
  }, [draft, runSave]);

  const onBlur = useCallback(() => {
    focusedRef.current = false;
    // While frozen there is nothing to flush — the server owns the field.
    if (frozenRef.current) return;
    void flush();
  }, [flush]);

  // Keep the latest draft in a ref so `retry` can stay referentially stable
  // (the sync-status indicator pulls it imperatively, so churn would thrash).
  const draftRef = useRef<T>(draft);
  draftRef.current = draft;

  const retry = useCallback(() => {
    void runSave(draftRef.current);
  }, [runSave]);

  // Auto-report to the universal sync-status indicator. Harmless no-op when no
  // <SyncStatusProvider> is above (unit tests, non-surface mounts).
  const phase = isError ? "error" : isSaving ? "syncing" : "idle";
  useReportSync({ phase, label, retry: isError ? retry : undefined, savedAt });

  return { value: draft, onChange, onFocus, onBlur, flush, isSaving, isError, retry };
}
