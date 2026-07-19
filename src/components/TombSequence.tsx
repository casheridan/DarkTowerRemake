import { useEffect, useState, type ReactNode } from "react";
import { CLEAN_CUE_SECONDS, sfx } from "../audio/sfx";
import { playTombRevealSfx } from "../audio/useSfx";
import type { EventResult } from "../engine";
import type { TowerPresentation } from "../ui/presentation";

export function TombSequence({
  event,
  presentation,
  children,
}: {
  event: EventResult;
  presentation: TowerPresentation;
  children: ReactNode;
}) {
  const [revealed, setRevealed] = useState(false);
  const message = event.messages.join(" ").toLowerCase();
  const empty = message.includes("empty") || message.includes("nothing");
  const brigands = event.moveEvent === "brigands";
  const suspenseSeconds = empty
    ? CLEAN_CUE_SECONDS.tombNothing
    : CLEAN_CUE_SECONDS.tombDoor;

  useEffect(() => {
    setRevealed(false);
    const timer = window.setTimeout(() => {
      // The physical unit reveals the result only after its door cue. A guarded
      // tomb then starts the regular battle fanfare; treasure gets its reward cue.
      if (brigands) sfx.brigands();
      else if (!empty) playTombRevealSfx(event);
      setRevealed(true);
    }, suspenseSeconds * 1000);
    return () => window.clearTimeout(timer);
  }, [event, brigands, empty, suspenseSeconds]);

  if (revealed) return <>{children}</>;

  return (
    <section className={`tomb-suspense tomb-suspense--${presentation}`} aria-live="polite">
      <div className="tomb-suspense__window">
        <span>TOMB / RUIN</span>
        <strong>THE DOOR OPENS…</strong>
        <i aria-hidden="true" />
      </div>
      <p>The result remains hidden until the Tower finishes its door sequence.</p>
    </section>
  );
}
