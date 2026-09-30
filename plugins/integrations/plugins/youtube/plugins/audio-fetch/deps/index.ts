// audio-fetch's dependency: the `youtube-audio` env (yt-dlp), collected into
// infra/deps' registry through the `default` array (Settings → Dependencies,
// `./singularity deps install youtube-audio`).
import { youtubeAudioDep } from "./internal/youtube-audio";

export { youtubeAudioDep } from "./internal/youtube-audio";

export default [youtubeAudioDep];
