import { useState } from "react";
import { Stack, Inset } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Surface } from "@plugins/primitives/plugins/css/plugins/surface/web";
import { Badge } from "@plugins/primitives/plugins/css/plugins/badge/web";
import { Button } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { BlockEditor } from "@plugins/page/plugins/editor/web";
import { SEED_DOC, TEXT_BLOCKS } from "../seed";

/**
 * Apps-pillar strip showcasing the block editor: a REAL `<BlockEditor>` running
 * in its in-memory (non-persisting) mode. Visitors can type, split lines, use the
 * slash menu, drag to reorder, and multi-select — all fully interactive — but the
 * document lives only in React state: no server rows, no network writes. The
 * palette is restricted to the text/document block family (attachment/media
 * blocks are excluded since there is no storage), and Reset remounts the editor
 * to reseed the starting document.
 */
export function EditorToySection() {
  const [resetKey, setResetKey] = useState(0);

  return (
    <section className="bg-background">
      <Inset x="xl" y="2xl">
        <Stack gap="lg" align="center" className="mx-auto w-full max-w-5xl">
          <Stack gap="2xs" align="center" className="text-center">
            <Text variant="eyebrow" tone="primary">
              Block editor
            </Text>
            <Text variant="heading" as="h2" className="tracking-tight">
              A living document, right here.
            </Text>
            <Text variant="body" tone="muted" className="max-w-xl">
              Type, press Enter to split, drag to reorder, or hit <kbd>/</kbd> for
              the block menu. Everything runs in your browser — nothing you write
              is saved or sent anywhere.
            </Text>
          </Stack>
          <div className="w-full max-w-3xl">
            <Surface level="raised">
              <Stack gap="none">
                <Inset x="lg" y="sm">
                  <Stack direction="row" justify="between" align="center" gap="sm">
                    <Badge variant="info" shape="pill">
                      In-memory demo
                    </Badge>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => setResetKey((k) => k + 1)}
                    >
                      Reset
                    </Button>
                  </Stack>
                </Inset>
                <BlockEditor
                  key={resetKey}
                  persist={false}
                  initialContent={SEED_DOC}
                  enabledBlockTypes={TEXT_BLOCKS}
                  contentClassName="mx-auto w-full max-w-2xl"
                />
              </Stack>
            </Surface>
          </div>
        </Stack>
      </Inset>
    </section>
  );
}
