// The character editor's cards and height wall, without a screen (PF-33): what each card shows, where its picture is
// kept, and the heights the wall reads. client/tests/customizeCards.test.ts runs them.
//
// Cards show the piece, not the player's character (outside the PCD tab): a catalog item alone in its catalog
// colors, so the picture is the same for everyone and is drawn once per version of the game and kept in the browser
// (client/ui/customize/itemThumbs.ts). The card of the piece being worn follows its chosen colors (kept only while
// the editor is open). Hair, beards and the face's features go on a neutral clay head; nothing worn and bare feet are
// icons. The PCD tab is the one with the player's own character on its cards.
import { DEFAULT_COLORS, EFFECTS, type Appearance, type ArmLoss, type Face, type Height, type LegLoss } from '@shared/appearance';
import { catalogItem } from '@shared/catalog';
import type { Sex } from '@shared/protocol';
import { RIG_HEIGHT } from '../../character/rig';
import { gameVersion, hashText, stableJson } from '../../editor/thumbCache';

/** Bumped when the way cards are drawn changes (light, camera, size, clay): every picture is drawn again. */
export const CARD_FORMAT = 1;

/**
 * The clay of the neutral head and mannequin: the warehouse's clay mannequin (client/ui/galpao/scene.ts), a little
 * lighter so the face's features read under the editor's light.
 */
export const CLAY = '#c2b8a8';

/** A feature of the face shown on the clay head (the eye style included). */
export type FaceFeature = keyof Face | 'olhosEstilo';

/** What a card shows. */
export type Pic =
  /** An icon instead of a picture: nothing worn there ('Nenhum'), bare feet. */
  | { icon: 'nenhum' | 'descalco' }
  /** A catalog item: clothes and gear alone; tattoos and gloves on the clay mannequin; hair and beards on the clay head. */
  | { item: string }
  /** A feature of the face on the clay head. */
  | { face: FaceFeature; value: string }
  /** The player's own character with one PCD choice (the PCD tab). */
  | { pcd: { braco: ArmLoss; perna: LegLoss } };

/** A picture to draw: its key in the cache, whether it's kept in the browser, and the colors it's drawn in. */
export interface Shot {
  key: string;
  /** Kept in IndexedDB across visits (same for every look); otherwise only while the editor is open. */
  persist: boolean;
  pic: Exclude<Pic, { icon: string }>;
  /** The item's colors (one per channel), or the hair color for hair and beards. */
  colors: string[];
}

/** The catalog's colors of an item (one per channel), or the default hair color for hair and beards. */
export function catalogColors(id: string): string[] {
  const it = catalogItem(id);
  if (!it) return [];
  if (it.category === 'cabelo' || it.category === 'barba') return [DEFAULT_COLORS.cabelo[0]];
  return it.channels.map((_, i) => DEFAULT_COLORS[it.category][i]);
}

/** The colors the look wears an item in, or null when it isn't worn (stored in its own slot). */
export function wornColors(id: string, look: Appearance): string[] | null {
  const it = catalogItem(id);
  if (!it) return null;
  if (it.category === 'cabelo') return look.cabelo.id === id ? [look.cabelo.cor] : null;
  if (it.category === 'barba') return look.barba === id ? [look.cabelo.cor] : null;
  const c = look.itens[it.slots[0]];
  return c?.id === id ? [...c.cores] : null;
}

/** A hash of the look without its PCD choice (the PCD cards are drawn again only when it changes). */
export function lookHash(look: Appearance): string {
  const { pcd: _pcd, ...rest } = look;
  return hashText(stableJson(rest));
}

/**
 * What a card's picture is: null for an icon. An item's picture is the same for every look (catalog colors, key
 * item:<id>:<sex>), except the worn one when its colors aren't the catalog's (drawn in them, kept in memory).
 */
export function shotOf(pic: Pic, look: Appearance, sex: Sex): Shot | null {
  if ('icon' in pic) return null;
  if ('face' in pic) return { key: `rosto:${pic.face}.${pic.value}:${sex}`, persist: true, pic, colors: [] };
  if ('pcd' in pic) return { key: `pcd:${lookHash(look)}:${pic.pcd.braco}|${pic.pcd.perna}:${sex}`, persist: false, pic, colors: [] };
  const base = catalogColors(pic.item);
  const worn = wornColors(pic.item, look);
  if (worn && worn.join() !== base.join()) return { key: `vestida:${pic.item}:${sex}:${worn.join(',')}`, persist: false, pic, colors: worn };
  return { key: `item:${pic.item}:${sex}`, persist: true, pic, colors: base };
}

/** A kept picture's signature: the drawing's format and the game's version (never the look). */
export function cardSignature(version = gameVersion(), format = CARD_FORMAT): string {
  return `${format}.${hashText(version)}`;
}

// --- Height wall ------------------------------------------------------------------------------------------------

/** The ruler of the height wall (m): cut, so the 7 cm between the choices show. */
export const WALL_FROM = 1.4;
export const WALL_TO = 2.0;

/** How tall a height choice is drawn: the standard body's height times its visual scale (only a look). */
export const heightMeters = (h: Height): number => RIG_HEIGHT * EFFECTS.heightScale[h];

/** '1,73 m' (pt) or '1.73 m' (en). */
export function metersText(m: number, lang: 'pt' | 'en' = 'pt'): string {
  const s = m.toFixed(2);
  return `${lang === 'en' ? s : s.replace('.', ',')} m`;
}
