import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { IconButton } from "@plugins/primitives/plugins/icon-button/web";
import type { PromptEditorActionProps } from "@plugins/primitives/plugins/prompt-editor/web";
import { useSpeechRecognition } from "./use-speech-recognition";
import { symbol } from "@plugins/ui/plugins/icons/core";

const micIcon = symbol("mic");

export function VoiceInputButton({ insertText }: PromptEditorActionProps) {
  const { isListening, error, toggle, isSupported } =
    useSpeechRecognition(insertText);

  if (!isSupported) return null;

  const label = isListening ? "Stop voice input" : "Start voice input";

  return (
    <IconButton
      icon={micIcon}
      motion={isListening ? "pulse" : undefined}
      label={label}
      tooltip={error ?? label}
      onMouseDown={(e) => e.preventDefault()}
      onClick={toggle}
      aria-pressed={isListening}
      // At rest the glyph wears the palette's `toolbarForeground` (the
      // inherited text colour by default), like the pane toolbar's glyphs.
      className={cn(
        "text-toolbar-foreground",
        isListening && "text-destructive-text bg-destructive/10",
        error && "text-destructive-text",
      )}
    />
  );
}
