import { useCallback, useEffect, useRef, useState } from "react";

export interface UseEditableFieldOptions<T extends string> {
  value: T;
  onSave: (next: T) => void | Promise<void>;
  debounceMs?: number;
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
  const { value, debounceMs = 500 } = opts;

  const [draft, setDraft] = useState<T>(value);
  const [isSaving, setIsSaving] = useState(false);

  const focusedRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savePromiseRef = useRef<Promise<void> | null>(null);
  const lastSavedRef = useRef<T>(value);
  const onSaveRef = useRef(opts.onSave);

  useEffect(() => {
    onSaveRef.current = opts.onSave;
  });

  useEffect(() => {
    if (focusedRef.current) return;
    if (timerRef.current) return;
    if (savePromiseRef.current) return;
    if (Object.is(value, lastSavedRef.current)) return;
    lastSavedRef.current = value;
    setDraft(value);
  }, [value]);

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
      } catch {
        // Surface the error to the original caller of runSave, not here.
      }
    }
  }, [draft, runSave]);

  const onBlur = useCallback(() => {
    focusedRef.current = false;
    void flush();
  }, [flush]);

  return { value: draft, onChange, onFocus, onBlur, flush, isSaving };
}
