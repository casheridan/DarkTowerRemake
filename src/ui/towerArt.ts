/**
 * Original Dark Tower carousel artwork, scanned from the 1981 game manual.
 *
 * The physical tower addressed seven carousel positions and one of three lamps
 * at each position. Keeping that two-part address here makes it difficult for
 * the UI to accidentally show the right words with the wrong picture.
 */
import type {
  BazaarWare,
  DrumPosition,
  EventResult,
  ItemType,
} from "../engine";
import { DRUM_LAMPS, MOVE_EVENT_LAMP } from "./labels";

const ASSET_ROOT = `${import.meta.env.BASE_URL}assets/tower-display`;

const DRUM_ART_FILES: Record<DrumPosition, readonly [string, string, string]> = {
  "warrior-food-beast": ["warrior.jpg", "food.jpg", "beast.jpg"],
  "scout-healer-gold": ["scout.jpg", "healer.jpg", "gold.jpg"],
  "goldkey-silverkey-brasskey": ["goldkey.jpg", "silverkey.jpg", "brasskey.jpg"],
  "dragon-sword-pegasus": ["dragon.jpg", "sword.jpg", "pegasus.jpg"],
  "wizard-bazaarclosed-keymissing": ["wizard.jpg", "bazaar.jpg", "keymissing.jpg"],
  "victory-warriors-brigands": ["victory.jpg", "warriors.jpg", "brigands.jpg"],
  "cursed-lost-plague": ["cursed.jpg", "lost.jpg", "plague.jpg"],
};

export const TOWER_ART_SOURCES = Object.values(DRUM_ART_FILES)
  .flatMap((files) => files)
  .map((file) => `${ASSET_ROOT}/${file}`);

let artworkPreload: Promise<void> | null = null;
// Keep the decoded image elements strongly reachable for the whole session.
// Without this, browsers are free to discard the off-DOM preload objects and
// decode a carousel frame again after another screen has replaced it.
const retainedArtwork = new Map<string, HTMLImageElement>();

/** Download and decode the complete 21-frame carousel before it is displayed. */
export function preloadTowerArtwork(): Promise<void> {
  if (artworkPreload) return artworkPreload;
  if (typeof Image === "undefined") return Promise.resolve();

  artworkPreload = Promise.all(
    TOWER_ART_SOURCES.map((src) => new Promise<void>((resolve) => {
      const image = new Image();
      retainedArtwork.set(src, image);
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        resolve();
      };
      image.onerror = finish;
      if (typeof image.decode === "function") {
        image.src = src;
        void image.decode().then(finish, finish);
      } else {
        image.onload = finish;
        image.src = src;
      }
    }))
  ).then(() => undefined);
  return artworkPreload;
}

export interface TowerArtFrame {
  drum: DrumPosition;
  lamp: 0 | 1 | 2;
  label: string;
  src: string;
}

export const TOWER_ART_SOURCE = "https://well-of-souls.com/tower/";

export function towerArtFrame(drum: DrumPosition, lamp: 0 | 1 | 2): TowerArtFrame {
  return {
    drum,
    lamp,
    label: DRUM_LAMPS[drum][lamp],
    src: `${ASSET_ROOT}/${DRUM_ART_FILES[drum][lamp]}`,
  };
}

const ITEM_FRAME: Partial<Record<ItemType, readonly [DrumPosition, 0 | 1 | 2]>> = {
  beast: ["warrior-food-beast", 2],
  scout: ["scout-healer-gold", 0],
  healer: ["scout-healer-gold", 1],
  goldKey: ["goldkey-silverkey-brasskey", 0],
  silverKey: ["goldkey-silverkey-brasskey", 1],
  brassKey: ["goldkey-silverkey-brasskey", 2],
  sword: ["dragon-sword-pegasus", 1],
  pegasus: ["dragon-sword-pegasus", 2],
};

const WARE_FRAME: Record<BazaarWare, readonly [DrumPosition, 0 | 1 | 2]> = {
  warrior: ["warrior-food-beast", 0],
  food: ["warrior-food-beast", 1],
  beast: ["warrior-food-beast", 2],
  scout: ["scout-healer-gold", 0],
  healer: ["scout-healer-gold", 1],
};

export function itemArtFrame(item: ItemType): TowerArtFrame | null {
  const address = ITEM_FRAME[item];
  return address ? towerArtFrame(...address) : null;
}

export function wareArtFrame(ware: BazaarWare): TowerArtFrame {
  return towerArtFrame(...WARE_FRAME[ware]);
}

function addUnique(frames: TowerArtFrame[], frame: TowerArtFrame | null): void {
  if (frame && !frames.some((candidate) => candidate.src === frame.src)) frames.push(frame);
}

/**
 * Build the sequence the virtual carousel should show for a resolved event.
 * Multi-part rewards rotate through each awarded resource just as the appliance
 * stepped through multiple illuminated pictures.
 */
export function eventArtFrames(event: EventResult | null): TowerArtFrame[] {
  if (!event) return [];

  if (event.moveEvent) {
    const lamp = MOVE_EVENT_LAMP[event.moveEvent];
    return event.drum && lamp >= 0
      ? [towerArtFrame(event.drum, lamp as 0 | 1 | 2)]
      : [];
  }

  const frames: TowerArtFrame[] = [];
  const deltas = event.deltas;

  if (event.purchase) addUnique(frames, wareArtFrame(event.purchase.ware));

  // Sanctuary aid and treasure can award more than one thing in one action.
  if ((deltas?.warriors ?? 0) > 0) {
    addUnique(frames, towerArtFrame("warrior-food-beast", 0));
  }
  if ((deltas?.food ?? 0) > 0) {
    addUnique(frames, towerArtFrame("warrior-food-beast", 1));
  }
  if ((deltas?.gold ?? 0) > 0) {
    addUnique(frames, towerArtFrame("scout-healer-gold", 2));
  }
  for (const item of event.itemsGained ?? []) addUnique(frames, itemArtFrame(item));

  if (event.kind === "bazaar" && !event.purchase) {
    addUnique(frames, towerArtFrame("wizard-bazaarclosed-keymissing", 1));
  } else if (
    event.kind === "darkTower" ||
    event.messages.some((message) => message.toUpperCase().includes("KEY MISSING"))
  ) {
    addUnique(frames, towerArtFrame("wizard-bazaarclosed-keymissing", 2));
  } else if (
    event.drum === "wizard-bazaarclosed-keymissing" &&
    (event.kind === "tomb" || event.kind === "combat")
  ) {
    addUnique(frames, towerArtFrame("wizard-bazaarclosed-keymissing", 0));
    if (event.messages.some((message) => message.toLowerCase().includes("curses"))) {
      addUnique(frames, towerArtFrame("cursed-lost-plague", 0));
    }
  }

  // Empty tombs, safe moves, frontiers, and starvation had sound/digits but no
  // illuminated picture. Do not invent artwork for those states.
  return frames;
}
