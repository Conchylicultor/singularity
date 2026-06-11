import { useCallback, useEffect, useRef, useState } from "react";

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
}

export interface EditableField<T extends string> {
  value: T;
  onChange: (next: T) => void;
  onFocus: () => void;
  onBlur: () => void;
  flush: () => Promise<void>;
  isSaving: boolean;
}

export function useEditableField<T extends string>(
  opts: UseEditableFieldOptions<T>,
): EditableField<T> {
  const { value, debounceMs = 500, frozen = false } = opts;

  const [draft, setDraft] = useState<T>(value);
  const [isSaving, setIsSaving] = useState(false);

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
      await onSaveRef.current(next);
      lastSavedRef.current = next;
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

  return { value: draft, onChange, onFocus, onBlur, flush, isSaving };
}
