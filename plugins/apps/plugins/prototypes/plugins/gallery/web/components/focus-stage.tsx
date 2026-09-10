import { MdWarning } from "react-icons/md";
import { Column } from "@plugins/primitives/plugins/css/plugins/column/web";
import { Badge } from "@plugins/primitives/plugins/css/plugins/badge/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import {
  Inset,
  Stack,
} from "@plugins/primitives/plugins/css/plugins/spacing/web";
import type { PrototypeMeta } from "@plugins/apps/plugins/prototypes/plugins/files/core";
import type { PrototypeStageProps } from "../slots";
import { ScaledIframe } from "./scaled-iframe";

/**
 * The Focus stage: the open prototype alone, in a sandboxed iframe scaled to fit
 * the pane, under whatever is wrong with its folder.
 */
export function FocusStage({ meta, src }: PrototypeStageProps) {
  return (
    <Column
      className="h-full"
      header={<ProblemBanner meta={meta} />}
      body={<ScaledIframe meta={meta} src={src} />}
      scrollBody={false}
    />
  );
}

/**
 * What is wrong with this prototype's folder, above the prototype itself.
 *
 * Prototypes are user content in `~/.singularity/apps/prototypes/`, not code, so the
 * self-contained contract can't be enforced by a push-time check any more. It is
 * enforced when the folder is read, and reported here — in front of the person
 * who just wrote it, next to the thing that isn't rendering right.
 */
function ProblemBanner({ meta }: { meta: PrototypeMeta }) {
  if (meta.problems.length === 0) return null;
  return (
    <Inset pad="sm">
      <Stack direction="col" gap="2xs">
        <Badge variant="warning" icon={<MdWarning />}>
          {meta.problems.length === 1
            ? "1 problem with this folder"
            : `${meta.problems.length} problems with this folder`}
        </Badge>
        {meta.problems.map((p) => (
          <Text
            key={`${p.path}:${p.detail}`}
            as="div"
            variant="caption"
            tone="muted"
          >
            {p.path === "" ? p.detail : `${p.path} — ${p.detail}`}
          </Text>
        ))}
      </Stack>
    </Inset>
  );
}
