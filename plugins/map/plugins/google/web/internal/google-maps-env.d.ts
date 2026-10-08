// The `google.maps` namespace the Maps JavaScript API defines once its script
// loads. The repo's tsconfig lists its global `types` explicitly, so the
// declarations this renderer programs against (OverlayView, MapTypeStyle) are
// pulled in here, by the one plugin that talks to Google.
/// <reference types="google.maps" />
