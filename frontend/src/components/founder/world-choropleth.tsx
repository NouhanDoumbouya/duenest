"use client";

// A dependency-free, privacy-safe world choropleth.
//
// Country geometry comes from the world-atlas 110m TopoJSON, decoded once with
// the React-agnostic topojson-client (no map/charting framework is added). We
// project with a simple equirectangular projection cropped to the populated
// latitude band and shade each country by its aggregate activity. Only safe,
// country-level data is ever rendered — never coordinates, cities, or IPs.

import { useMemo, useRef, useState } from "react";
import { feature } from "topojson-client";
import type { Feature, Geometry } from "geojson";
import worldData from "world-atlas/countries-110m.json";

import { cn } from "@/lib/utils";

// ---- One-time geometry decode + projection ---------------------------------

const WIDTH = 960;
// Crop to lat [84, -56] so the map fills the frame without empty polar bands.
const LAT_MAX = 84;
const LAT_MIN = -56;
const HEIGHT = Math.round((WIDTH * (LAT_MAX - LAT_MIN)) / 360);

function projectX(lon: number): number {
  return ((lon + 180) / 360) * WIDTH;
}
function projectY(lat: number): number {
  return ((LAT_MAX - lat) / (LAT_MAX - LAT_MIN)) * HEIGHT;
}

function ringToPath(ring: number[][]): string {
  return (
    ring
      .map(([lon, lat], i) => {
        const x = projectX(lon).toFixed(1);
        const y = projectY(lat).toFixed(1);
        return `${i === 0 ? "M" : "L"}${x} ${y}`;
      })
      .join(" ") + "Z"
  );
}

function geometryToPath(geometry: Geometry): string {
  if (geometry.type === "Polygon") {
    return geometry.coordinates.map(ringToPath).join(" ");
  }
  if (geometry.type === "MultiPolygon") {
    return geometry.coordinates
      .map((polygon) => polygon.map(ringToPath).join(" "))
      .join(" ");
  }
  return "";
}

interface CountryShape {
  name: string;
  d: string;
}

// Decoded once at module load (client-side). Antarctica is dropped — it never
// carries product activity and only adds visual noise.
const COUNTRY_SHAPES: CountryShape[] = (() => {
  try {
    const fc = feature(
      worldData as never,
      (worldData as never as { objects: { countries: unknown } }).objects
        .countries as never,
    ) as unknown as { features: Feature[] };
    return fc.features
      .map((f) => ({
        name: String((f.properties as { name?: string })?.name ?? ""),
        d: geometryToPath(f.geometry),
      }))
      .filter((shape) => shape.name && shape.name !== "Antarctica" && shape.d);
  } catch {
    return [];
  }
})();

// ---- Component -------------------------------------------------------------

export interface ChoroplethDatum {
  value: number;
  label: string;
  detail: { label: string; value: string }[];
}

export function WorldChoropleth({
  data,
  selected,
  onSelect,
  className,
}: {
  /** Keyed by canonical country name (see country-iso.ts). */
  data: Map<string, ChoroplethDatum>;
  selected: string | null;
  onSelect: (name: string | null) => void;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [tip, setTip] = useState<{ x: number; y: number; w: number } | null>(
    null,
  );

  const maxValue = useMemo(() => {
    let max = 0;
    data.forEach((d) => {
      if (d.value > max) max = d.value;
    });
    return max;
  }, [data]);

  function intensity(name: string): number {
    const datum = data.get(name);
    if (!datum || datum.value <= 0 || maxValue <= 0) return 0;
    // Log-ish bucket so a single dominant country doesn't flatten the rest.
    const ratio = datum.value / maxValue;
    return Math.min(1, 0.18 + Math.sqrt(ratio) * 0.82);
  }

  function fillFor(name: string): string {
    const t = intensity(name);
    if (t === 0) return "var(--muted)";
    const pct = Math.round(t * 100);
    return `color-mix(in srgb, var(--brand-teal) ${pct}%, var(--card))`;
  }

  const active = hovered ?? selected;
  const activeDatum = active ? data.get(active) : null;

  function handleMove(event: React.MouseEvent) {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setTip({
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
      w: rect.width,
    });
  }

  return (
    <div
      ref={containerRef}
      className={cn("relative w-full overflow-hidden", className)}
      onMouseMove={handleMove}
      onMouseLeave={() => {
        setHovered(null);
        setTip(null);
      }}
    >
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="h-auto w-full"
        role="img"
        aria-label="World map shaded by country-level activity"
        preserveAspectRatio="xMidYMid meet"
      >
        <rect
          x={0}
          y={0}
          width={WIDTH}
          height={HEIGHT}
          fill="var(--background)"
        />
        {COUNTRY_SHAPES.map((shape) => {
          const hasData = (data.get(shape.name)?.value ?? 0) > 0;
          const isActive = active === shape.name;
          return (
            <path
              key={shape.name}
              d={shape.d}
              fill={fillFor(shape.name)}
              stroke={isActive ? "var(--primary)" : "var(--border)"}
              strokeWidth={isActive ? 1.4 : 0.4}
              className={cn(
                "transition-[fill,stroke] duration-150",
                hasData && "cursor-pointer",
              )}
              tabIndex={hasData ? 0 : -1}
              role={hasData ? "button" : undefined}
              aria-label={
                hasData ? `${shape.name} activity details` : undefined
              }
              onMouseEnter={() => hasData && setHovered(shape.name)}
              onFocus={() => hasData && setHovered(shape.name)}
              onBlur={() => setHovered(null)}
              onClick={() =>
                hasData && onSelect(selected === shape.name ? null : shape.name)
              }
              onKeyDown={(e) => {
                if (hasData && (e.key === "Enter" || e.key === " ")) {
                  e.preventDefault();
                  onSelect(selected === shape.name ? null : shape.name);
                }
              }}
            />
          );
        })}
      </svg>

      {activeDatum && tip && (
        <div
          className="pointer-events-none absolute z-10 max-w-[220px] rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-floating"
          style={{
            left: Math.min(tip.x + 12, tip.w - 220),
            top: tip.y + 12,
          }}
        >
          <p className="font-semibold text-foreground">{activeDatum.label}</p>
          <dl className="mt-1 space-y-0.5">
            {activeDatum.detail.map((row) => (
              <div key={row.label} className="flex justify-between gap-3">
                <dt className="text-muted-foreground">{row.label}</dt>
                <dd className="font-medium tabular-nums">{row.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </div>
  );
}

/** Whether the bundled geometry decoded successfully (used to choose fallbacks). */
export const WORLD_MAP_AVAILABLE = COUNTRY_SHAPES.length > 0;
