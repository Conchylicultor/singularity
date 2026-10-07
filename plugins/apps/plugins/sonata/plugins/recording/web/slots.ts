import { defineMountSlot } from "@plugins/primitives/plugins/slot-render/web";

/**
 * The recording's extension points.
 *
 * - `Refused` — headless effects mounted by the video panel while YouTube
 *   refuses to play the score's recording in an embed (the player's `onError`
 *   says the video is gone or not embeddable). Read what was refused with
 *   `useMediaRefusal()`. Mounted once per refusal, so a contribution reports it
 *   from a mount effect — whoever chose the video (the UG alignment's video
 *   pick) learns it cannot be played here and can pick another. The recording
 *   names no such contributor; with none, the panel still shows the refusal.
 */
export const SonataRecording = {
  Refused: defineMountSlot({ docLabel: (p) => p.id }),
};
