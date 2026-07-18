/**
 * Pan/zoom for an SVG board — the same getScreenCTM-based math the Map Editor
 * uses (exact under CSS letterboxing). Wheel/two-finger scroll pans, pinch or
 * Ctrl/Cmd+wheel zooms toward the cursor, right-drag pans.
 */
import { useEffect, useRef, useState, type RefObject } from "react";

interface View {
  x: number;
  y: number;
  w: number;
}

export function usePanZoom(svgRef: RefObject<SVGSVGElement>, size: number) {
  const [view, setView] = useState<View>({ x: 0, y: 0, w: size });
  const pan = useRef<{ sx: number; sy: number; vx: number; vy: number; k: number } | null>(null);

  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const ctm = el.getScreenCTM();
      if (!ctm) return;
      if (e.ctrlKey || e.metaKey) {
        const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse());
        setView((v) => {
          const w = Math.min(size * 1.25, Math.max(size * 0.12, v.w * Math.exp(e.deltaY * 0.01)));
          const k = w / v.w;
          return { x: p.x - (p.x - v.x) * k, y: p.y - (p.y - v.y) * k, w };
        });
      } else {
        const s = 1 / ctm.a;
        setView((v) => ({ ...v, x: v.x + e.deltaX * s, y: v.y + e.deltaY * s }));
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [svgRef, size]);

  const onPanStart = (e: React.MouseEvent) => {
    if (e.button !== 2 && e.button !== 1) return; // right/middle drag only
    const ctm = svgRef.current?.getScreenCTM();
    pan.current = {
      sx: e.clientX,
      sy: e.clientY,
      vx: view.x,
      vy: view.y,
      k: ctm ? 1 / ctm.a : view.w / (svgRef.current?.getBoundingClientRect().width ?? size),
    };
  };
  const onPanMove = (e: React.MouseEvent) => {
    const p = pan.current;
    if (!p) return;
    setView((v) => ({ ...v, x: p.vx - (e.clientX - p.sx) * p.k, y: p.vy - (e.clientY - p.sy) * p.k }));
  };
  const onPanEnd = () => {
    pan.current = null;
  };

  const zoomBy = (factor: number) =>
    setView((v) => {
      const w = Math.min(size * 1.25, Math.max(size * 0.12, v.w * factor));
      const cx = v.x + v.w / 2;
      const cy = v.y + v.w / 2;
      return { x: cx - w / 2, y: cy - w / 2, w };
    });
  const reset = () => setView({ x: 0, y: 0, w: size });

  return {
    view,
    viewBox: `${view.x} ${view.y} ${view.w} ${view.w}`,
    pct: Math.round((size / view.w) * 100),
    onPanStart,
    onPanMove,
    onPanEnd,
    zoomBy,
    reset,
  };
}
