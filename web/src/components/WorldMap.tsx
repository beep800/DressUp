import { geoContains, geoGraticule10, geoNaturalEarth1, geoPath } from 'd3-geo';
import { select } from 'd3-selection';
import 'd3-transition';
import { zoom as d3zoom, zoomIdentity, zoomTransform, type ZoomBehavior, type ZoomTransform } from 'd3-zoom';
import type { Feature, FeatureCollection, Geometry } from 'geojson';
import { memo, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { feature } from 'topojson-client';
import type { GeometryCollection, Topology } from 'topojson-specification';
import worldAtlas from 'world-atlas/countries-110m.json';
import type { RegionSummary } from '../lib/aggregate';
import { LEVEL_META, LEVEL_RANK, type ConcernLevel } from '../lib/concern';
import { RegionPopup } from './RegionPopup';

const world = worldAtlas as unknown as Topology<{ countries: GeometryCollection }>;
const COUNTRIES = (feature(world, world.objects.countries) as unknown as FeatureCollection<Geometry>).features;

const MAX_ZOOM = 16;
const LABEL_ZOOM = 2.5;
const POPUP_WIDTH = 320;
const DOCK_BELOW = 600;

const MARKER_RADIUS: Record<ConcernLevel, number> = { high: 9, elevated: 8, clear: 6, 'no-data': 5 };

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

interface Marker {
  summary: RegionSummary;
  x: number;
  y: number;
}

const CountryLayer = memo(function CountryLayer({
  paths,
  levels,
}: {
  paths: string[];
  levels: Map<number, ConcernLevel>;
}) {
  return (
    <g>
      {paths.map((d, i) => (
        <path key={i} d={d} className={`map-country level-${levels.get(i) ?? 'none'}`} />
      ))}
    </g>
  );
});

export function WorldMap({
  summaries,
  selected,
  onSelect,
  flyTo,
}: {
  summaries: RegionSummary[];
  selected: string | null;
  onSelect: (region: string | null) => void;
  /** Changing `n` pans and zooms to `region`. */
  flyTo: { region: string; n: number } | null;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const zoomRef = useRef<ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [transform, setTransform] = useState<ZoomTransform>(zoomIdentity);
  const [hovered, setHovered] = useState<string | null>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize({ w: Math.round(width), h: Math.round(height) });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const projection = useMemo(
    () =>
      size.w > 0 && size.h > 0
        ? geoNaturalEarth1().fitExtent(
            [
              [12, 12],
              [size.w - 12, size.h - 12],
            ],
            { type: 'Sphere' },
          )
        : null,
    [size.w, size.h],
  );

  const pathGen = useMemo(() => (projection ? geoPath(projection) : null), [projection]);
  const countryPaths = useMemo(() => (pathGen ? COUNTRIES.map((f) => pathGen(f) ?? '') : []), [pathGen]);
  const spherePath = useMemo(() => (pathGen ? (pathGen({ type: 'Sphere' }) ?? '') : ''), [pathGen]);
  const graticulePath = useMemo(() => (pathGen ? (pathGen(geoGraticule10()) ?? '') : ''), [pathGen]);

  // Tint each country by the worst concern level of the regions inside it.
  const countryLevels = useMemo(() => {
    const levels = new Map<number, ConcernLevel>();
    for (const s of summaries) {
      if (!s.geo) continue;
      const point: [number, number] = [s.geo.longitude, s.geo.latitude];
      const idx = COUNTRIES.findIndex((f: Feature<Geometry>) => geoContains(f, point));
      if (idx < 0) continue;
      const current = levels.get(idx);
      if (!current || LEVEL_RANK[s.assessment.level] > LEVEL_RANK[current]) levels.set(idx, s.assessment.level);
    }
    return levels;
  }, [summaries]);

  const markers = useMemo<Marker[]>(() => {
    if (!projection) return [];
    return summaries
      .flatMap((s) => {
        if (!s.geo) return [];
        const p = projection([s.geo.longitude, s.geo.latitude]);
        return p ? [{ summary: s, x: p[0], y: p[1] }] : [];
      })
      .sort((a, b) => LEVEL_RANK[a.summary.assessment.level] - LEVEL_RANK[b.summary.assessment.level]);
  }, [summaries, projection]);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg || size.w === 0) return;
    const behavior = d3zoom<SVGSVGElement, unknown>()
      .scaleExtent([1, MAX_ZOOM])
      .extent([
        [0, 0],
        [size.w, size.h],
      ])
      .translateExtent([
        [0, 0],
        [size.w, size.h],
      ])
      .on('zoom', (event: { transform: ZoomTransform }) => setTransform(event.transform));
    zoomRef.current = behavior;
    select(svg).call(behavior);
    return () => {
      select(svg).on('.zoom', null);
    };
  }, [size.w, size.h]);

  const docked = size.w < DOCK_BELOW;

  const animate = (next: ZoomTransform, duration = 650) => {
    const svg = svgRef.current;
    const behavior = zoomRef.current;
    if (!svg || !behavior) return;
    select(svg)
      .transition()
      .duration(prefersReducedMotion() ? 0 : duration)
      .call(behavior.transform, next);
  };

  /** Puts map point (x, y) at a fraction of the viewport's height, horizontally centred. */
  const centerOn = (x: number, y: number, k: number, atHeight = 0.5) =>
    zoomIdentity.translate(size.w / 2 - k * x, size.h * atHeight - k * y).scale(k);

  useEffect(() => {
    if (!flyTo || !svgRef.current) return;
    const m = markers.find((mk) => mk.summary.region === flyTo.region);
    if (!m) return;
    const k = Math.max(zoomTransform(svgRef.current).k, 4);
    // Sit the marker high so its popup has room to open below it.
    animate(centerOn(m.x, m.y, k, docked ? 0.25 : 0.3));
    // Only a new fly-to request should move the map, not re-renders while zooming.
  }, [flyTo?.n]);

  const zoomBy = (factor: number) => {
    const svg = svgRef.current;
    const behavior = zoomRef.current;
    if (!svg || !behavior) return;
    select(svg)
      .transition()
      .duration(prefersReducedMotion() ? 0 : 250)
      .call(behavior.scaleBy, factor);
  };

  const fitFlagged = () => {
    const flagged = markers.filter((m) => m.summary.assessment.level === 'high' || m.summary.assessment.level === 'elevated');
    const targets = flagged.length > 0 ? flagged : markers;
    if (targets.length === 0) return;
    const xs = targets.map((m) => m.x);
    const ys = targets.map((m) => m.y);
    const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    const pad = 80;
    const k = Math.min(MAX_ZOOM, Math.max(1, Math.min(size.w / (x1 - x0 + pad * 2), size.h / (y1 - y0 + pad * 2))));
    animate(centerOn((x0 + x1) / 2, (y0 + y1) / 2, k));
  };

  const selectedMarker = markers.find((m) => m.summary.region === selected);
  const hoveredMarker = hovered && hovered !== selected ? markers.find((m) => m.summary.region === hovered) : undefined;
  const unplaced = selected && !selectedMarker ? summaries.find((s) => s.region === selected) : undefined;

  let popupStyle: CSSProperties | undefined;
  if (selectedMarker && !docked) {
    const sx = transform.applyX(selectedMarker.x);
    const sy = transform.applyY(selectedMarker.y);
    const left = Math.max(8, Math.min(sx - POPUP_WIDTH / 2, size.w - POPUP_WIDTH - 8));
    const roomAbove = sy - 26;
    const roomBelow = size.h - sy - 26;
    popupStyle =
      roomAbove > roomBelow
        ? { left, bottom: size.h - sy + 18, maxHeight: roomAbove }
        : { left, top: sy + 18, maxHeight: roomBelow };
  }

  return (
    <div className="map" ref={wrapRef}>
      {pathGen && (
        <svg
          ref={svgRef}
          width={size.w}
          height={size.h}
          className="map-svg"
          aria-label="World map of regions, coloured by concern level"
        >
          <g transform={transform.toString()}>
            <path className="map-sphere" d={spherePath} onClick={() => onSelect(null)} />
            <path className="map-graticule" d={graticulePath} />
            <CountryLayer paths={countryPaths} levels={countryLevels} />
          </g>
          <g>
            {markers.map((m) => {
              const { region, assessment } = m.summary;
              const level = assessment.level;
              const r = MARKER_RADIUS[level];
              const isSelected = region === selected;
              const toggle = () => onSelect(isSelected ? null : region);
              return (
                <g
                  key={region}
                  className={`marker marker-${level}${isSelected ? ' is-selected' : ''}`}
                  transform={`translate(${transform.applyX(m.x)},${transform.applyY(m.y)})`}
                  role="button"
                  tabIndex={0}
                  aria-pressed={isSelected}
                  aria-label={`${region}: ${LEVEL_META[level].label}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    toggle();
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      toggle();
                    }
                  }}
                  onPointerEnter={() => setHovered(region)}
                  onPointerLeave={() => setHovered(null)}
                  onFocus={() => setHovered(region)}
                  onBlur={() => setHovered(null)}
                >
                  <circle className="marker-hit" r={16} />
                  <circle className="marker-halo" r={r + 5} />
                  <circle className="marker-dot" r={r} />
                  {(level === 'high' || level === 'elevated') && (
                    <text className="marker-glyph" dy="0.36em">
                      !
                    </text>
                  )}
                  {transform.k >= LABEL_ZOOM && (
                    <text className="marker-label" x={r + 6} dy="0.35em">
                      {region}
                    </text>
                  )}
                </g>
              );
            })}
          </g>
        </svg>
      )}

      <div className="map-controls">
        <button className="map-btn" type="button" onClick={() => zoomBy(1.6)} aria-label="Zoom in">
          +
        </button>
        <button className="map-btn" type="button" onClick={() => zoomBy(1 / 1.6)} aria-label="Zoom out">
          −
        </button>
        <button className="map-btn map-btn-text" type="button" onClick={() => animate(zoomIdentity)}>
          World
        </button>
        <button className="map-btn map-btn-text" type="button" onClick={fitFlagged}>
          Flagged
        </button>
      </div>

      <ul className="map-legend" aria-label="Map legend">
        {(['high', 'elevated', 'clear', 'no-data'] as ConcernLevel[]).map((level) => (
          <li key={level}>
            <svg width="20" height="20" viewBox="-10 -10 20 20" aria-hidden="true">
              <g className={`marker marker-${level}`}>
                <circle className="marker-dot" r={MARKER_RADIUS[level] - 1} />
                {(level === 'high' || level === 'elevated') && (
                  <text className="marker-glyph" dy="0.36em">
                    !
                  </text>
                )}
              </g>
            </svg>
            {LEVEL_META[level].label}
          </li>
        ))}
      </ul>

      {hoveredMarker && (
        <div
          className="map-tip"
          style={{ left: transform.applyX(hoveredMarker.x), top: transform.applyY(hoveredMarker.y) - 12 }}
        >
          <strong>{hoveredMarker.summary.region}</strong> · {LEVEL_META[hoveredMarker.summary.assessment.level].label}
        </div>
      )}

      {(selectedMarker || unplaced) && (
        <RegionPopup
          summary={(selectedMarker?.summary ?? unplaced)!}
          style={popupStyle}
          docked={docked || !selectedMarker}
          onClose={() => onSelect(null)}
        />
      )}
    </div>
  );
}
