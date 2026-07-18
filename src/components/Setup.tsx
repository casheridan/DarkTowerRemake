/** Pre-game setup: choose 1–4 players, names, and difficulty. */
import { useState } from "react";
import { motion } from "framer-motion";
import type { Difficulty } from "../engine";
import { KINGDOM_META } from "../ui/labels";
import { DIFFICULTY_TOWER_BRIGANDS, KINGDOM_ORDER } from "../engine";
import { useGame } from "../store/useGame";
import "./Setup.css";

const DIFF_LABELS: Record<Difficulty, { name: string; blurb: string }> = {
  1: { name: "Level 1 — Squire", blurb: "17–32 brigands guard the Tower." },
  2: { name: "Level 2 — Knight", blurb: "33–64 brigands guard the Tower." },
  3: { name: "Level 3 — Champion", blurb: "17–64 brigands — the wildest gamble." },
  4: { name: "Level 4 — Test Mode", blurb: "Start with everything: 99/99/99, all gear & keys." },
};

export function Setup() {
  const newGame = useGame((s) => s.newGame);
  const setEditing = useGame((s) => s.setEditing);
  const [count, setCount] = useState(1);
  const [names, setNames] = useState<string[]>(["", "", "", ""]);
  const [difficulty, setDifficulty] = useState<Difficulty>(1);

  const start = () => {
    const players = Array.from({ length: count }, (_, i) => ({
      name: names[i].trim() || `Ruler of ${KINGDOM_META[KINGDOM_ORDER[i]].name}`,
    }));
    newGame({ players, difficulty });
  };

  return (
    <div className="setup">
      <motion.div
        className="setup__card"
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <h1 className="setup__title">DARK TOWER</h1>
        <p className="setup__sub">1981 · Faithful Remake</p>

        <section className="setup__section">
          <h3>Players</h3>
          <div className="setup__count">
            {[1, 2, 3, 4].map((n) => (
              <button
                key={n}
                className={`pill ${count === n ? "pill--on" : ""}`}
                onClick={() => setCount(n)}
              >
                {n}
              </button>
            ))}
          </div>
          <div className="setup__names">
            {Array.from({ length: count }).map((_, i) => (
              <div key={i} className="setup__name-row">
                <span
                  className="setup__crest"
                  style={{ background: `var(${KINGDOM_META[KINGDOM_ORDER[i]].colorVar})` }}
                />
                <input
                  className="setup__input"
                  placeholder={`Ruler of ${KINGDOM_META[KINGDOM_ORDER[i]].name}`}
                  value={names[i]}
                  maxLength={16}
                  onChange={(e) => {
                    const next = [...names];
                    next[i] = e.target.value;
                    setNames(next);
                  }}
                />
              </div>
            ))}
          </div>
        </section>

        <section className="setup__section">
          <h3>Difficulty</h3>
          <div className="setup__diff">
            {([1, 2, 3, 4] as Difficulty[]).map((d) => (
              <button
                key={d}
                className={`diff ${difficulty === d ? "diff--on" : ""}`}
                onClick={() => setDifficulty(d)}
              >
                <strong>{DIFF_LABELS[d].name}</strong>
                <span>{DIFF_LABELS[d].blurb}</span>
                <em>
                  {DIFFICULTY_TOWER_BRIGANDS[d].min}–{DIFFICULTY_TOWER_BRIGANDS[d].max} defenders
                </em>
              </button>
            ))}
          </div>
        </section>

        <button className="setup__start" onClick={start}>
          Begin the Quest
        </button>
        <button className="setup__editor" onClick={() => setEditing(true)}>
          🗺️ Map Editor
        </button>
        <p className="setup__hint">
          Collect the brass, silver &amp; gold keys — then storm the Dark Tower.
        </p>
      </motion.div>
    </div>
  );
}
