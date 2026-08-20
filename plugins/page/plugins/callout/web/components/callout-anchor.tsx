import { MdLightbulb } from "react-icons/md";
import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import {
  PageIcon,
  type BlockAnchorProps,
} from "@plugins/page/plugins/editor/web";
import { ContainerAnchor } from "@plugins/page/plugins/container/web";
import {
  CalloutAppearanceFor,
  readCalloutAppearance,
} from "./callout-appearance";
import { COLOR_TEXT } from "./callout-colors";

/**
 * The callout's leading glyph — the ONLY thing its row paints, and APPEARANCE
 * only.
 *
 * The structural actions (Remove callout / Delete / Collapse) used to live in
 * this popover, because an anchor row paints no hover rail and there was nowhere
 * else to hang a block-actions menu. There is now: the rail on the line the
 * callout BORROWS resolves the callout as its owner, so its `⠿` handle opens
 * them — generically, for every container. What is left here is what is
 * genuinely the callout's own: the glyph, and the icon/colour controls behind
 * it, which also render in that rail menu (`CalloutMenu`) so appearance is
 * reachable from both.
 *
 * The static-vs-interactive branch on `editor`, the `preventDefault`ed trigger
 * and the popover all still belong to `ContainerAnchor`; `panel="picker"` is the
 * callout's own, because its sections are a control panel whose body hosts the
 * full icon picker's grid.
 */
export function CalloutAnchor({ data, editor }: BlockAnchorProps) {
  const { iconSvgNodes, color } = readCalloutAppearance(data);

  return (
    <ContainerAnchor
      editor={editor}
      triggerLabel="Callout icon and color"
      // Its sections are a CONTROL PANEL whose body is an icon grid — the
      // `picker` role (320px, the width this popover already had as `xl`).
      panel="picker"
      glyph={
        <PageIcon
          nodes={iconSvgNodes}
          fallback={MdLightbulb}
          className={cn("size-5", COLOR_TEXT[color])}
        />
      }
      sections={({ editor: api, close }) => (
        <CalloutAppearanceFor data={data} api={api} close={close} />
      )}
    />
  );
}
