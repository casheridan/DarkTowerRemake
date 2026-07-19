import type { TowerArtFrame } from "../ui/towerArt";
import "./TowerArtwork.css";

export function TowerArtwork({
  frame,
  compact = false,
  dimmed = false,
}: {
  frame: TowerArtFrame;
  compact?: boolean;
  dimmed?: boolean;
}) {
  return (
    <div
      className={`tower-art ${compact ? "tower-art--compact" : ""} ${
        dimmed ? "tower-art--dimmed" : ""
      }`}
    >
      <img
        src={frame.src}
        alt={`${frame.label} — original Dark Tower display artwork`}
        draggable={false}
        decoding="sync"
        loading="eager"
      />
    </div>
  );
}
