# Dark Tower (1981) — Faithful React Remake

A playable React/TypeScript remake of Milton Bradley's 1981 electronic board game
**Dark Tower**, calibrated against the reverse-engineered ROM disassembly
([ratsputin/Dark-Tower](https://github.com/ratsputin/Dark-Tower), vendored in `reference/`).
Every probability, price, and combat formula is taken from the actual TMS1400 code —
not from memory or the manual — so the game plays the way the original silicon does.

Supports **1–4 players locally (hotseat)**, with a clickable board map, an animated
pseudo-tower control panel, original carousel imagery and tower audio captures, and an
optional odds-reveal mode.

The top-bar presentation selector defaults to **Clean** (the lightweight digital display
and synthesized appliance cues) or can switch to **Original** (manual scans and original-unit
WAV captures). The choice is remembered locally; Original audio is cached after first use.

## Running it

```bash
npm install
npm run dev      # play at http://localhost:5173
npm test         # run the engine test suite (Vitest)
npm run build    # production build
```

## Faithfulness — what came straight from the disassembly

| Mechanic | Behaviour | ROM source |
|---|---|---|
| Move events | Lost 18.75% · Dragon 12.5% · Plague 18.75% · Brigands 18.75% · Safe 31.25% (uniform 0–15 roll) | `DOMOVE` ~2107–2548 |
| Brigand combat | Enemy count = `warriors ± random(0–2)` with ROM weighting 6:5:5; each round strength = `warriors × random(1–4)` over `random(1–4)` sub-rounds; win → brigands halve, lose → −1 warrior; multiplayer preserves one survivor | `L800`/`L840`/`L880` ~2937–3235 |
| Dragon | Takes ¼ gold + ¼ warriors (no Sword); with a Sword, win its hoard and the Sword is spent; after either outcome, the attacker relocates its board-blocking marker to an empty normal territory | `L6C0` ~2450 + board-game rules |
| Wizard | After Tomb/Ruin treasure, cycle through eligible rivals and choose one to lose the ROM-weighted ¼ of gold and warriors; Clear declines the curse | `L6C0` weighting + board-game rules |
| Plague | −2 warriors (negated by Healer) | ~2317 |
| Food | `ceil(warriors / 15)` per turn; starvation = food→0 and −1 warrior | ~1648–1745 |
| Sanctuary / Citadel | Warriors ≤4 → +5–8; own Citadel (first visit) doubles 5–24 warriors; gold ≤7 → +9–16; food ≤5 → +9–16 | `DOSANCT` ~2651–2808 |
| Bazaar | Prices: warrior 5–8, food 1, beast/scout/healer 17–26; haggle drops 1 gold on a roll <12 (first) / <8 (after), else the bazaar closes | `LA98` ~3826–4160 |
| Tomb / Ruin | Empty 12.5% · brigands 62.5% · direct treasure 25%; direct treasure and Brigand victories grant +13–20 gold, then key/Pegasus/Sword/Wizard | `L8D9` ~3254–3445 |
| Frontier / keys | Per-region key gate; collect brass→silver→gold across the foreign kingdoms | `S53D` ~1835–1874 |
| Pegasus | One-use token: land in the current or next kingdom; landing ends the turn, so its building waits until the next | `L97A` reward path + original instructions |
| Tower defenders | L1 17–32 · L2 33–64 · L3 17–64 | ~400 / setup |
| Key riddle | Secret per-game key order, deduced via positional feedback | Dark Tower entry |
| Final score | `clamp(176 + defenders + L6C0(defenders) − 8 × (completed turns + warriors committed), 0, 99)` | `LFFF` ~5490 |

## Architecture

A **pure, framework-free game engine** (`src/engine/`) holds all the ROM-faithful logic and
is covered by 143 unit/statistical tests. A thin Zustand store (`src/store/`) wraps the engine
reducer; React components (`src/components/`) render the board, tower, HUD, bazaar, combat, and
endgame. The audio layer (`src/audio/`) selects lightweight Web Audio recreation or cached
original local tower captures, retaining synthesis as a fallback if a clip cannot be loaded.

```
src/engine/      constants · rng · encounters · economy · combat · bazaar ·
                 sanctuary · tomb · frontier · keys · reducer  (+ __tests__)
src/store/       Zustand store over the engine
src/components/  Setup · Board · Tower · Hud · Bazaar · Combat · DarkTower · GameOver
src/audio/       Web Audio sfx + the useSfx hook
public/assets/   original carousel scans + tower audio captures (with source notes)
reference/       the vendored disassembly (calibration source of truth)
```

## Archival artwork and audio

The carousel scans and appliance recordings come from
[Arioch's Well of Souls — The Dark Tower Page](https://well-of-souls.com/tower/). The archive
credits Bob Pepper for the original game artwork and Death Lock for recording the sounds.
It also states that the manual scans were posted without permission and provides no reuse
license. The assets are kept locally (never hotlinked), the in-game tower links back to the
archive, and detailed provenance travels beside each asset set in its `SOURCE.md`. All Dark
Tower artwork, audio, names, and trademarks remain with their respective rights holders.

## How to play

1. Choose 1–4 players and a difficulty.
2. On your turn, **click a highlighted adjacent territory** to travel one space (a random
   encounter resolves on arrival). Stepping into another kingdom is a **frontier crossing**
   (gated by the key rules). Or use the action for the building you're standing on —
   **Bazaar** (shop/haggle), **Sanctuary/Citadel** (replenish), **Tomb/Ruin** (treasure) —
   or **Rest** to hold your ground.
3. Collect the **brass, silver and gold keys** (one per foreign kingdom, in order), found in
   the Tombs/Ruins of each kingdom you cross into.
4. Travel to an **inner territory bordering the Dark Tower**, then with all three keys open the
   **Dark Tower**, solve the Riddle of the Keys, and win the final battle to claim victory.

Toggle **🎲 Odds** any time to reveal the exact disassembly-derived probabilities.
