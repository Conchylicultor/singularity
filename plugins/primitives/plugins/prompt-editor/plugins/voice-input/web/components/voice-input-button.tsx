import { MdMic } from "react-icons/md";
import { IconButton } from "@plugins/primitives/plugins/icon-button/web";
import type { PromptEditorActionProps } from "@plugins/primitives/plugins/prompt-editor/web";
import { cn } from "@/lib/utils";
import { useSpeechRecognition } from "./use-speech-recognition";

export function VoiceInputButton({ insertText }: PromptEditorActionProps) {
  const { isListening, error, toggle, isSupported } =
    useSpeechRecognition(insertText);

  if (!isSupported) return null;

  const label = isListening ? "Stop voice input" : "Start voice input";

  return (
    <IconButton
      icon={({ className }) => (
        <MdMic className={cn(className, isListening && "animate-pulse")} />
      )}
      label={label}
      tooltip={error ?? label}
      onMouseDown={(e) => e.preventDefault()}
      onClick={toggle}
      aria-pressed={isListening}
      className={cn(
        isListening && "text-destructive bg-destructive/10",
        error && "text-destructive",
      )}
    />
  );
}
