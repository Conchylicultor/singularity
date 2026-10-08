import { useEffect, useState } from "react";
import {
  APIProvider,
  Map as GoogleMap,
  Polygon,
  Polyline,
  useMap,
  type PolylineProps,
} from "@vis.gl/react-google-maps";
import { useLatestRef } from "@plugins/primitives/plugins/latest-ref/web";
import { Center } from "@plugins/primitives/plugins/css/plugins/center/web";
import { Loading } from "@plugins/primitives/plugins/loading/web";
import {
  cameraFor,
  overlayPositions,
  positionsKey,
  type MapArea,
  type MapOverlay,
  type MapPath,
} from "@plugins/map/core";
import type { MapRendererProps } from "@plugins/map/web";
import {
  MapsMapAccessAction,
  useMapsBrowserConfig,
} from "@plugins/integrations/plugins/google-maps/web";
import { useGoogleAuthRefused } from "../internal/auth-failure";
import {
  DEFAULT_TONE,
  useToneColors,
  type ToneColors,
} from "../internal/tone-colors";
import { MapErrorCard } from "./map-error-card";
import { GOOGLE_COLOR_SCHEME, GOOGLE_TILES } from "../internal/tiles";
import { OverlayPin } from "./overlay-pin";

/**
 * Google's own places (shops, museums, restaurants, parks' names) are hidden:
 * on a map whose content is the user's pins, they read as more pins and crowd
 * the real ones out. Streets, districts and transit stay as context, and parks
 * keep their green.
 *
 * Inline styles only apply to a map WITHOUT a Map ID, which is why pins are
 * `OverlayPin`s rather than Advanced Markers.
 */
const BASEMAP_STYLES: google.maps.MapTypeStyle[] = [
  {
    featureType: "poi",
    elementType: "labels",
    stylers: [{ visibility: "off" }],
  },
];
/** Room kept around fitted overlays, so an edge pin's bubble is not clipped. */
const FIT_PADDING_PX = 48;
/** Stroke width when an overlay does not say. */
const DEFAULT_STROKE_PX = 3;
/** Opacity of an area's fill under its outline. */
const AREA_FILL_OPACITY = 0.15;

/**
 * The Google Maps renderer. Reads the browser config itself rather than taking
 * it as a prop: `MapRendererProps` is vendor-neutral, and the host only mounts
 * this once readiness says the key is set.
 */
export function GoogleMapRenderer(props: MapRendererProps) {
  const config = useMapsBrowserConfig();
  switch (config.kind) {
    case "loading":
      return (
        <Center className="size-full">
          <Loading variant="spinner" />
        </Center>
      );
    case "error":
    // A failed config read (after the host saw it ready) — the access action
    // renders the failure with Retry.
    case "unset":
      // The key was removed after the host checked readiness — offer the same
      // fix the host would have.
      return (
        <Center className="size-full">
          <MapsMapAccessAction />
        </Center>
      );
    case "set":
      return <GoogleMapCanvas {...props} browserKey={config.browserKey} />;
  }
}

function GoogleMapCanvas({
  browserKey,
  overlays,
  renderPin,
  onActivate,
  activeId,
}: MapRendererProps & { browserKey: string }) {
  // Held in state, not a ref: the tone colours are read off this element, and
  // a ref cannot trigger the render that reads them.
  const [host, setHost] = useState<HTMLDivElement | null>(null);
  const refused = useGoogleAuthRefused();
  const [loadError, setLoadError] = useState<string | null>(null);
  const colors = useToneColors(host, overlays);

  if (refused) return <MapErrorCard reason={{ kind: "refused" }} />;
  if (loadError !== null) {
    return <MapErrorCard reason={{ kind: "load", detail: loadError }} />;
  }

  const initial = cameraFor(overlayPositions(overlays));
  const center =
    initial.kind === "point"
      ? initial.center
      : initial.kind === "bounds"
        ? {
            lat: (initial.bounds.south + initial.bounds.north) / 2,
            lng: (initial.bounds.west + initial.bounds.east) / 2,
          }
        : { lat: 0, lng: 0 };

  return (
    <div ref={setHost} className="size-full">
      <APIProvider
        apiKey={browserKey}
        onError={(err) =>
          setLoadError(err instanceof Error ? err.message : String(err))
        }
      >
        <GoogleMap
          styles={BASEMAP_STYLES}
          colorScheme={GOOGLE_COLOR_SCHEME[GOOGLE_TILES]}
          defaultCenter={center}
          defaultZoom={initial.kind === "point" ? initial.zoom : 2}
          // A map inside a scrolling page: a plain wheel scrolls the page, and
          // zooming takes Ctrl/⌘ + wheel — Google's own hint says so.
          gestureHandling="cooperative"
          clickableIcons={false}
          streetViewControl={false}
          mapTypeControl={false}
        >
          <FitCamera overlays={overlays} />
          {overlays.map((o) => (
            <OverlayNode
              key={o.id}
              overlay={o}
              colors={colors}
              active={o.id === activeId}
              renderPin={renderPin}
              onActivate={onActivate}
            />
          ))}
        </GoogleMap>
      </APIProvider>
    </div>
  );
}

/**
 * Frames every overlay, but only when the SET of positions changes — so the
 * user's own pan and zoom survive edits that move nothing (a renamed place, a
 * re-render, a new unplaced item).
 */
function FitCamera({ overlays }: { overlays: readonly MapOverlay[] }) {
  const map = useMap();
  const positions = overlayPositions(overlays);
  const key = positionsKey(positions);
  const latest = useLatestRef(positions);

  useEffect(() => {
    if (map === null) return;
    const camera = cameraFor(latest.current);
    switch (camera.kind) {
      case "none":
        return;
      case "point":
        map.setCenter(camera.center);
        map.setZoom(camera.zoom);
        return;
      case "bounds":
        map.fitBounds(camera.bounds, FIT_PADDING_PX);
        return;
    }
    // `key` is the trigger; `latest` carries the positions it stands for.
  }, [map, key, latest]);

  return null;
}

interface OverlayNodeProps {
  overlay: MapOverlay;
  colors: ToneColors;
  active: boolean;
  renderPin: MapRendererProps["renderPin"];
  onActivate: MapRendererProps["onActivate"];
}

function OverlayNode({
  overlay,
  colors,
  active,
  renderPin,
  onActivate,
}: OverlayNodeProps) {
  switch (overlay.kind) {
    case "pin":
      return (
        <OverlayPin
          position={overlay.position}
          label={overlay.label}
          // The active pin sits above its neighbours, so a grown bubble is
          // never half-hidden under the next one.
          zIndex={active ? 2 : 1}
          onActivate={() => onActivate(overlay.id)}
        >
          {renderPin(overlay, active)}
        </OverlayPin>
      );
    case "path":
      return <PathNode path={overlay} colors={colors} />;
    case "area":
      return <AreaNode area={overlay} colors={colors} />;
  }
}

/**
 * A dashed stroke: Google has no dash option, so the line is drawn invisible
 * and a short vertical tick is repeated along it.
 */
function dashIcons(width: number): NonNullable<PolylineProps["icons"]> {
  return [
    {
      icon: { path: "M 0,-1 0,1", strokeOpacity: 1, scale: width },
      offset: "0",
      repeat: `${width * 4}px`,
    },
  ];
}

function PathNode({ path, colors }: { path: MapPath; colors: ToneColors }) {
  const color = colors[path.style?.tone ?? DEFAULT_TONE];
  if (color === undefined) return null; // colour not resolved yet — never guess one
  const width = path.style?.width ?? DEFAULT_STROKE_PX;
  const dashed = path.style?.dashed === true;
  return (
    <Polyline
      path={path.points}
      strokeColor={color}
      strokeWeight={width}
      strokeOpacity={dashed ? 0 : 1}
      icons={dashed ? dashIcons(width) : undefined}
      clickable={false}
    />
  );
}

function AreaNode({ area, colors }: { area: MapArea; colors: ToneColors }) {
  const color = colors[area.style?.tone ?? DEFAULT_TONE];
  if (color === undefined) return null;
  const width = area.style?.width ?? DEFAULT_STROKE_PX;
  const dashed = area.style?.dashed === true;
  const first = area.ring[0];
  return (
    <>
      <Polygon
        paths={[area.ring]}
        fillColor={color}
        fillOpacity={AREA_FILL_OPACITY}
        strokeColor={color}
        strokeWeight={width}
        // A polygon's outline cannot dash either: draw it as a closed dashed
        // polyline over an outline-less fill.
        strokeOpacity={dashed ? 0 : 1}
        clickable={false}
      />
      {dashed && first !== undefined ? (
        <Polyline
          path={[...area.ring, first]}
          strokeColor={color}
          strokeWeight={width}
          strokeOpacity={0}
          icons={dashIcons(width)}
          clickable={false}
        />
      ) : null}
    </>
  );
}
