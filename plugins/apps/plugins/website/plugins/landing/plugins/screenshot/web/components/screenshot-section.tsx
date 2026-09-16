import type { CSSProperties, ReactNode } from "react";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { WebsiteBand } from "@plugins/apps/plugins/website/plugins/shell/web";
import "./screenshot-section.css";

const CAPTION =
  "One surface: the agent manager, a Notion-like page and Sonata with a song playing, side by side.";

/** A grey text line of the drawing, `width` as a CSS length. `tone` picks the heading or accent bar. */
function Line({ width, tone }: { width: string; tone?: "heading" | "accent" }) {
  const style: CSSProperties = { width };
  return (
    <i
      className={
        tone === undefined
          ? "website-shot-line"
          : `website-shot-line is-${tone}`
      }
      style={style}
    />
  );
}

/** One window of the drawing: a title bar with its three lights, then the body. */
function Window({
  kind,
  title,
  children,
}: {
  kind: "agents" | "pages" | "sonata";
  title: string;
  children: ReactNode;
}) {
  return (
    <div className={`website-shot-window is-${kind}`}>
      <div className="website-shot-titlebar">
        <i className="is-close" />
        <i className="is-minimize" />
        <i className="is-zoom" />
        <span>{title}</span>
      </div>
      <div className="website-shot-body">{children}</div>
    </div>
  );
}

/** The agent manager's conversation list: each row a status light and a title line. */
const AGENT_ROWS: { status: "busy" | "done" | "idle"; width: string }[] = [
  { status: "busy", width: "70%" },
  { status: "done", width: "55%" },
  { status: "busy", width: "80%" },
  { status: "idle", width: "60%" },
  { status: "idle", width: "45%" },
  { status: "done", width: "65%" },
];

/** Which of the 14 white keys, and which black keys (by left offset), are held down. */
const WHITE_KEYS_DOWN = new Set([2, 8]);
const BLACK_KEYS: { left: string; down?: boolean }[] = [
  { left: "5.4%" },
  { left: "12.5%" },
  { left: "26.8%", down: true },
  { left: "34%" },
  { left: "41.1%" },
  { left: "55.4%" },
  { left: "62.5%" },
  { left: "76.8%" },
  { left: "84%", down: true },
  { left: "91.1%" },
];

/**
 * A picture of equin in desktop mode, drawn rather than captured: three windows
 * overlapping on one wallpaper — the agent manager mid-conversation, a Pages
 * document with a checklist, and Sonata playing "Clair de lune".
 *
 * Drawn, not a screenshot, so it is the same crisp picture at every width and
 * re-tints with the site's theme: every colour in `screenshot-section.css` is
 * mixed from theme tokens. It is one illustration, so it is one image to
 * assistive technology (`role="img"` with a label), and its geometry — windows
 * placed by percentages over a fixed aspect ratio — lives in that CSS file
 * with the paint, as a drawing's does.
 */
export function ScreenshotSection() {
  return (
    <WebsiteBand divider rhythm="section">
      <Stack gap="md">
        <div
          role="img"
          aria-label="equin in desktop mode: the agent manager, a Pages document and Sonata as three windows on one surface"
          className="website-shot"
        >
          <div className="website-shot-rail" aria-hidden>
            <i className="is-on" />
            <i />
            <i />
            <i />
            <i />
          </div>
          <div aria-hidden>
            <Window kind="agents" title="Agent manager">
              <div className="website-shot-list">
                {AGENT_ROWS.map((row, index) => (
                  <div
                    key={index}
                    className={
                      index === 0
                        ? "website-shot-row is-selected"
                        : "website-shot-row"
                    }
                  >
                    <i className={`website-shot-status is-${row.status}`} />
                    <Line width={row.width} />
                  </div>
                ))}
              </div>
              <div className="website-shot-chat">
                <div className="website-shot-message is-mine">
                  <Line width="7.5em" />
                  <Line width="5em" />
                </div>
                <div className="website-shot-message">
                  <Line width="10em" />
                  <Line width="8.75em" />
                  <Line width="5.6em" tone="accent" />
                </div>
                <div className="website-shot-message">
                  <Line width="6.9em" />
                </div>
                <div className="website-shot-compose" />
              </div>
            </Window>
            <Window kind="pages" title="Pages">
              <div className="website-shot-doc">
                <b>Website launch</b>
                <Line width="90%" />
                <Line width="76%" />
                <div className="website-shot-check">
                  <i className="is-done" />
                  <Line width="60%" />
                </div>
                <div className="website-shot-check">
                  <i className="is-done" />
                  <Line width="48%" />
                </div>
                <div className="website-shot-check">
                  <i />
                  <Line width="70%" />
                </div>
                <div className="website-shot-callout">
                  <Line width="50%" tone="accent" />
                  <Line width="82%" />
                </div>
                <Line width="40%" tone="heading" />
                <Line width="88%" />
                <Line width="64%" />
              </div>
            </Window>
            <Window kind="sonata" title="Sonata">
              <div className="website-shot-player">
                <i className="website-shot-play" />
                <span>
                  Now playing <b>Clair de lune</b> · Debussy
                </span>
              </div>
              <div className="website-shot-progress">
                <i />
              </div>
              <div className="website-shot-keys">
                {Array.from({ length: 14 }, (_, index) => (
                  <i
                    key={index}
                    className={
                      WHITE_KEYS_DOWN.has(index)
                        ? "website-shot-key is-down"
                        : "website-shot-key"
                    }
                  />
                ))}
                {BLACK_KEYS.map((key) => (
                  <i
                    key={key.left}
                    className={
                      key.down
                        ? "website-shot-black-key is-down"
                        : "website-shot-black-key"
                    }
                    style={{ left: key.left }}
                  />
                ))}
              </div>
            </Window>
            <span className="website-shot-label">desktop mode</span>
          </div>
        </div>
        <Text
          as="p"
          variant="label"
          tone="muted"
          className="text-muted-foreground/60 text-center font-normal"
        >
          {CAPTION}
        </Text>
      </Stack>
    </WebsiteBand>
  );
}
