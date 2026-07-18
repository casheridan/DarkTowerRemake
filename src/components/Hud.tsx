/** Per-player status: resources, inventory, keys. */
import { motion } from "framer-motion";
import { KINGDOM_ORDER, type GameState, type ItemType } from "../engine";
import { ITEM_META, KEY_TINT, KINGDOM_META } from "../ui/labels";
import "./Hud.css";

const KEY_ITEMS: ItemType[] = ["brassKey", "silverKey", "goldKey"];
const GEAR_ITEMS: ItemType[] = ["sword", "scout", "healer", "beast", "pegasus"];

export function Hud({ game }: { game: GameState }) {
  return (
    <div className="hud">
      {game.players.map((p, idx) => {
        const active = idx === game.currentPlayerIndex;
        return (
          <motion.div
            key={p.id}
            className={`hud__card ${active ? "hud__card--active" : ""} ${!p.alive ? "hud__card--dead" : ""}`}
            animate={{ scale: active ? 1 : 0.97 }}
          >
            <div className="hud__head">
              <span
                className="hud__crest"
                style={{ background: `var(${KINGDOM_META[KINGDOM_ORDER[p.id]].colorVar})` }}
              />
              <span className="hud__name">{p.name}</span>
              {p.won && <span className="hud__won">👑</span>}
            </div>

            <div className="hud__stats">
              <Stat icon="🗡️" label="Warriors" value={p.warriors} />
              <Stat icon="🪙" label="Gold" value={p.gold} />
              <Stat icon="🍖" label="Food" value={p.food} />
            </div>

            <div className="hud__items">
              {KEY_ITEMS.map((k) => (
                <span
                  key={k}
                  className={`hud__key ${p.inventory.has(k) ? "hud__key--have" : ""}`}
                  style={p.inventory.has(k) ? { color: KEY_TINT[k as keyof typeof KEY_TINT] } : undefined}
                  title={ITEM_META[k].label}
                >
                  🗝
                </span>
              ))}
              <span className="hud__sep" />
              {GEAR_ITEMS.filter((g) => p.inventory.has(g)).map((g) => (
                <span key={g} className="hud__gear" title={ITEM_META[g].label}>
                  {ITEM_META[g].icon}
                </span>
              ))}
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}

function Stat({ icon, label, value }: { icon: string; label: string; value: number }) {
  return (
    <div className="hud__stat" title={label}>
      <span className="hud__stat-icon">{icon}</span>
      <motion.span
        key={value}
        className="hud__stat-val"
        initial={{ scale: 1.4, color: "var(--dt-amber)" }}
        animate={{ scale: 1, color: "var(--dt-text)" }}
      >
        {value}
      </motion.span>
    </div>
  );
}
