import { useCallback, useEffect, useRef, useState } from "react";
import { useLatestRef } from "@plugins/primitives/plugins/latest-ref/web";

interface SpeechRecognitionResult {
  readonly isFinal: boolean;
  readonly length: number;
  readonly [index: number]: { readonly transcript: string };
}

interface SpeechRecognitionResultList {
  readonly length: number;
  readonly [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionEventLike {
  readonly resultIndex: number;
  readonly results: SpeechRecognitionResultList;
}

interface SpeechRecognitionErrorEventLike {
  readonly error: string;
}

interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as Record<string, unknown>;
  return (
    (w["SpeechRecognition"] as SpeechRecognitionCtor | undefined) ??
    (w["webkitSpeechRecognition"] as SpeechRecognitionCtor | undefined) ??
    null
  );
}

const Ctor = getSpeechRecognitionCtor();

const ERROR_MESSAGES: Record<string, string> = {
  "not-allowed": "Microphone access denied",
  "service-not-allowed": "Speech service unavailable",
  "audio-capture": "No microphone found",
  network: "Network error",
};

export function useSpeechRecognition(
  onFinalResult: (transcript: string) => void,
) {
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const mountedRef = useRef(true);
  const callbackRef = useLatestRef(onFinalResult);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      recognitionRef.current?.abort();
    };
  }, []);

  const toggle = useCallback(() => {
    if (!Ctor) return;

    if (recognitionRef.current && listening) {
      recognitionRef.current.stop();
      return;
    }

    setError(null);

    const recognition = new Ctor();
    recognition.continuous = true;
    recognition.interimResults = false;
    recognitionRef.current = recognition;

    recognition.onresult = (event) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result?.isFinal && result[0]) {
          callbackRef.current(result[0].transcript);
        }
      }
    };

    recognition.onerror = (event) => {
      if (!mountedRef.current) return;
      const message = ERROR_MESSAGES[event.error];
      if (message) setError(message);
      setListening(false);
      recognitionRef.current = null;
    };

    recognition.onend = () => {
      if (!mountedRef.current) return;
      setListening(false);
      recognitionRef.current = null;
    };

    recognition.start();
    setListening(true);
  }, [listening]);

  return {
    isListening: listening,
    error,
    toggle,
    isSupported: Ctor !== null,
  } as const;
}
