"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

import { haptic } from "@/lib/scanner/capabilities";
import type { Point, Quad } from "@/lib/scanner/types";
import { cn } from "@/lib/utils";

const MAGNIFIER_SIZE = 132;
const MAGNIFIER_ZOOM = 2.6;
const HANDLE_LABELS = ["Top-left", "Top-right", "Bottom-right", "Bottom-left"];

interface CropEditorProps {
  source: HTMLCanvasElement;
  quad: Quad;
  onQuadChange: (quad: Quad) => void;
}

/**
 * Interactive 4-corner crop editor. Handles use pointer events with large
 * (44px) invisible hit zones, `touch-action: none` to stop the page scrolling,
 * and a pixel-aligned circular magnifier so the corner under the finger stays
 * visible and precise.
 */
export function CropEditor({ source, quad, onQuadChange }: CropEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const imageBoxRef = useRef<HTMLDivElement>(null);
  const imageCanvasRef = useRef<HTMLCanvasElement>(null);
  const magnifierRef = useRef<HTMLCanvasElement>(null);
  const [scale, setScale] = useState(1);
  const [displaySize, setDisplaySize] = useState({ w: 0, h: 0 });
  const [activeCorner, setActiveCorner] = useState<number | null>(null);
  const quadRef = useRef(quad);
  useEffect(() => {
    quadRef.current = quad;
  }, [quad]);

  const aspect = source.width / source.height;

  const measure = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    // Reserve room so the 44px corner handles never clip at the edges.
    const margin = 26;
    const availW = el.clientWidth - margin * 2;
    const availH = el.clientHeight - margin * 2;
    if (availW <= 0 || availH <= 0) return;
    // Contain-fit: size the image to fit BOTH the available width and height,
    // so the whole document — and all four corners — stays visible at once.
    // (Width-only sizing made tall scans overflow, hiding the bottom corners.)
    let w = availW;
    let h = w / aspect;
    if (h > availH) {
      h = availH;
      w = h * aspect;
    }
    setScale(w / source.width);
    setDisplaySize({ w, h });
  }, [aspect, source.width]);

  useLayoutEffect(() => {
    measure();
    const el = containerRef.current;
    // Re-fit whenever the available area changes (rotation, layout settling,
    // on-screen keyboard) — not just on window resize.
    let observer: ResizeObserver | null = null;
    if (el && typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(() => measure());
      observer.observe(el);
    }
    window.addEventListener("resize", measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [measure]);

  // Paint the frozen frame into the display canvas whenever the size changes.
  useEffect(() => {
    const canvas = imageCanvasRef.current;
    if (!canvas || displaySize.w === 0) return;
    canvas.width = displaySize.w;
    canvas.height = displaySize.h;
    const ctx = canvas.getContext("2d");
    if (ctx) ctx.drawImage(source, 0, 0, displaySize.w, displaySize.h);
  }, [source, displaySize]);

  const renderMagnifier = useCallback(
    (corner: Point) => {
      const canvas = magnifierRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const r = MAGNIFIER_SIZE / (2 * MAGNIFIER_ZOOM);
      ctx.clearRect(0, 0, MAGNIFIER_SIZE, MAGNIFIER_SIZE);
      ctx.save();
      ctx.beginPath();
      ctx.arc(MAGNIFIER_SIZE / 2, MAGNIFIER_SIZE / 2, MAGNIFIER_SIZE / 2, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(
        source,
        corner.x - r,
        corner.y - r,
        r * 2,
        r * 2,
        0,
        0,
        MAGNIFIER_SIZE,
        MAGNIFIER_SIZE,
      );
      // Crosshair at the exact corner point.
      ctx.strokeStyle = "rgba(110, 231, 183, 0.95)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(MAGNIFIER_SIZE / 2, MAGNIFIER_SIZE / 2 - 12);
      ctx.lineTo(MAGNIFIER_SIZE / 2, MAGNIFIER_SIZE / 2 + 12);
      ctx.moveTo(MAGNIFIER_SIZE / 2 - 12, MAGNIFIER_SIZE / 2);
      ctx.lineTo(MAGNIFIER_SIZE / 2 + 12, MAGNIFIER_SIZE / 2);
      ctx.stroke();
      ctx.restore();
    },
    [source],
  );

  const updateCorner = useCallback(
    (index: number, clientX: number, clientY: number) => {
      const el = imageBoxRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      let sx = (clientX - rect.left) / scale;
      let sy = (clientY - rect.top) / scale;
      sx = Math.min(source.width, Math.max(0, sx));
      sy = Math.min(source.height, Math.max(0, sy));
      const next = [...quadRef.current] as Quad;
      next[index] = { x: sx, y: sy };
      onQuadChange(next);
      renderMagnifier({ x: sx, y: sy });
    },
    [onQuadChange, renderMagnifier, scale, source.width, source.height],
  );

  const handlePointerDown = useCallback(
    (index: number) => (e: React.PointerEvent) => {
      e.preventDefault();
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      setActiveCorner(index);
      haptic(20);
      renderMagnifier(quadRef.current[index]);
    },
    [renderMagnifier],
  );

  const handlePointerMove = useCallback(
    (index: number) => (e: React.PointerEvent) => {
      if (activeCorner !== index) return;
      e.preventDefault();
      updateCorner(index, e.clientX, e.clientY);
    },
    [activeCorner, updateCorner],
  );

  const endDrag = useCallback(() => setActiveCorner(null), []);

  const display = quad.map((p) => ({ x: p.x * scale, y: p.y * scale }));
  const polygon = display.map((p) => `${p.x},${p.y}`).join(" ");
  const activePoint = activeCorner != null ? display[activeCorner] : null;
  const magnifierAbove = activePoint ? activePoint.y > MAGNIFIER_SIZE + 24 : true;

  return (
    <div
      ref={containerRef}
      className="relative flex h-full w-full items-center justify-center touch-none select-none"
    >
      <div
        ref={imageBoxRef}
        className="relative"
        style={{
          width: displaySize.w || undefined,
          height: displaySize.h || undefined,
        }}
      >
      <canvas ref={imageCanvasRef} className="block w-full rounded-xl" />

      {displaySize.w > 0 && (
        <svg
          className="pointer-events-none absolute inset-0"
          width={displaySize.w}
          height={displaySize.h}
          aria-hidden="true"
        >
          <polygon
            points={polygon}
            fill="rgba(45, 212, 191, 0.10)"
            stroke="rgba(94, 234, 212, 0.95)"
            strokeWidth={2}
          />
        </svg>
      )}

      {display.map((p, index) => (
        <div
          key={index}
          role="button"
          tabIndex={0}
          aria-label={`${HANDLE_LABELS[index]} corner at x ${Math.round(
            quad[index].x,
          )}, y ${Math.round(quad[index].y)}. Use arrow keys to adjust.`}
          onPointerDown={handlePointerDown(index)}
          onPointerMove={handlePointerMove(index)}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onKeyDown={(e) => {
            const step = e.shiftKey ? 10 : 2;
            const moves: Record<string, [number, number]> = {
              ArrowLeft: [-step, 0],
              ArrowRight: [step, 0],
              ArrowUp: [0, -step],
              ArrowDown: [0, step],
            };
            const delta = moves[e.key];
            if (!delta) return;
            e.preventDefault();
            const next = [...quadRef.current] as Quad;
            next[index] = {
              x: Math.min(source.width, Math.max(0, next[index].x + delta[0])),
              y: Math.min(source.height, Math.max(0, next[index].y + delta[1])),
            };
            onQuadChange(next);
          }}
          className="absolute flex items-center justify-center"
          style={{
            left: p.x,
            top: p.y,
            width: 44,
            height: 44,
            transform: "translate(-50%, -50%)",
            cursor: "grab",
          }}
        >
          <span
            className={cn(
              "block rounded-full border-2 border-white bg-teal-300/90 shadow-[0_0_0_4px_rgba(45,212,191,0.25)] transition-transform",
              activeCorner === index ? "size-6 scale-110" : "size-5",
            )}
          />
        </div>
      ))}

      {activePoint && (
        <canvas
          ref={magnifierRef}
          width={MAGNIFIER_SIZE}
          height={MAGNIFIER_SIZE}
          className="pointer-events-none absolute z-30 rounded-full border-2 border-white/80 bg-slate-950 shadow-floating"
          style={{
            width: MAGNIFIER_SIZE,
            height: MAGNIFIER_SIZE,
            left: Math.min(
              Math.max(activePoint.x - MAGNIFIER_SIZE / 2, 8),
              displaySize.w - MAGNIFIER_SIZE - 8,
            ),
            top: magnifierAbove
              ? activePoint.y - MAGNIFIER_SIZE - 20
              : activePoint.y + 20,
          }}
        />
      )}
      </div>
    </div>
  );
}
