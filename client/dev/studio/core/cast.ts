// Sticker studio: the recurring cast. HERO is the look every new player starts with plus a red cap (he stands
// for "you", and the cap is his 30 px signature); RIVAL is the woman in the wine hoodie and the turquoise
// bandana; neighbor(n) is a seeded random look for crowds and third parties, plain unless told otherwise.
// dress, strip, mood and tweak return copies; the cast itself is frozen, so a subject can never change it for the
// next one. Each look remembers the sex it was made for (sexOf, in a WeakMap: Appearance has no field for it):
// the helpers' copies keep it, dress and strip refill the required slots with that sex's defaults, and k.avatar
// builds that body. A copy made by hand ({ ...look }, structuredClone) is a new object and loses it: the helpers
// and k.avatar refuse such a look rather than guess a man's body.
import { suggestedColors, choice, defaultAppearance, randomAppearance, wear, type Appearance, type BrowStyle, type EyeStyle, type Face, type ItemChoice } from '@shared/appearance';
import { CATALOG, catalogItem, REQUIRED_SLOTS, type Slot } from '@shared/catalog';
import type { Sex } from '@shared/protocol';
import { seeded } from './seed';

/** An item with its colors set straight into the look: no palette snap, so off-palette colors work too. */
export interface Worn {
  id: string;
  /** One per channel of the item (primary, secondary, detail); the missing ones take the item's defaults. */
  cores?: string[];
}

function freeze<T>(o: T): T {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const v of Object.values(o)) freeze(v);
  }
  return o;
}

const sexes = new WeakMap<Appearance, Sex>();

/**
 * The sex a look was made for: HERO 'm', RIVAL 'f', a neighbor's, withSex's, and every copy the helpers made
 * of them. undefined for a look the cast didn't make, a copy made by hand ({ ...RIVAL }, structuredClone) included.
 */
export const sexOf = (look: Appearance): Sex | undefined => sexes.get(look);

/** A copy of `look` marked as `sex`'s (for looks made outside the cast, e.g. defaultAppearance('f')). */
export function withSex(look: Appearance, sex: Sex): Appearance {
  const a = structuredClone(look);
  sexes.set(a, sex);
  return a;
}

/** The sex a helper needs (to refill required slots, to keep it on the copy): a look without it is refused. */
function sexFor(look: Appearance, helper: string): Sex {
  const sex = sexes.get(look);
  if (!sex)
    throw new Error(
      `${helper}: este visual não diz o sexo. Uma cópia feita à mão ({ ...RIVAL }, structuredClone) perde a marca: mude campos com tweak(RIVAL, { pele: '#8d5a3b' }); um visual de fora do elenco, marque com withSex(visual, 'f')`,
    );
  return sex;
}

/**
 * A copy of `look` wearing these items (catalog ids, or { id, cores }): whatever used their slots comes off,
 * as in the editor. A catalog id takes the item's own default colors (never the colors of what it replaces);
 * { id, cores } sets them directly. Hair and beards are catalog items too, but with no slot: they go to cabelo
 * (keeping the look's hair color unless cores[0] gives one) and barba.
 */
export function dress(look: Appearance, ...items: (string | Worn)[]): Appearance {
  const sex = sexFor(look, 'dress');
  const a = withSex(look, sex);
  for (const it of items) {
    const id = typeof it === 'string' ? it : it.id;
    const item = catalogItem(id);
    if (!item) throw new Error(`dress: a peça "${id}" não existe no catálogo (shared/catalog.ts)`);
    if (item.category === 'cabelo') {
      a.cabelo = { id, cor: (typeof it !== 'string' && it.cores?.[0]) || a.cabelo.cor };
      continue;
    }
    if (item.category === 'barba') {
      a.barba = id;
      continue;
    }
    // wear() keeps the replaced item's colors (the editor's behavior): set the colors here.
    wear(a, item.slots[0], id, sex);
    const base = choice(item).cores;
    a.itens[item.slots[0]] = typeof it === 'string' || !it.cores ? choice(item) : { id, cores: item.channels.map((_, i) => it.cores![i] ?? base[i]) };
  }
  return a;
}

/** A copy of `look` without what it wears in these slots (required slots get the look's sex's default back). */
export function strip(look: Appearance, ...slots: Slot[]): Appearance {
  const sex = sexFor(look, 'strip');
  const a = withSex(look, sex);
  for (const s of slots) wear(a, s, '', sex);
  return a;
}

/**
 * A copy of `look` with these fields changed, keeping its sex: tweak(RIVAL, { pele: '#8d5a3b', biotipo: 'gordo' }).
 * `rosto` and `cabelo` merge into the look's own (tweak(HERO, { cabelo: { cor: '#d8d2c4' } })); clothes go
 * through dress and strip. Use it instead of { ...look }, which loses the sex.
 */
export function tweak(
  look: Appearance,
  changes: Partial<Omit<Appearance, 'v' | 'itens' | 'rosto' | 'cabelo'>> & { rosto?: Partial<Face>; cabelo?: Partial<Appearance['cabelo']> },
): Appearance {
  const a = withSex(look, sexFor(look, 'tweak'));
  const { rosto, cabelo, ...rest } = structuredClone(changes);
  Object.assign(a, rest);
  if (rosto) a.rosto = { ...a.rosto, ...rosto };
  if (cabelo) a.cabelo = { ...a.cabelo, ...cabelo };
  return a;
}

/**
 * A copy of `look` with this face: angry 'marcante' + 'grossa', sad 'caido' + 'fina', surprised 'grande' +
 * 'arqueada'. Eyes are 1-2 px in a full-body card: put the mood in the pose too (k.pp, k.poses). Keeps the
 * look's sex (or its lack of one: k.avatar then asks for it).
 */
export function mood(look: Appearance, eyes: EyeStyle, brows: BrowStyle): Appearance {
  const sex = sexes.get(look);
  const a = sex ? withSex(look, sex) : structuredClone(look);
  a.olhosEstilo = eyes;
  a.rosto = { ...a.rosto, sobrancelhas: brows };
  return a;
}

/** "You": the default starting look (moss tee, khaki cargo pants, black sneakers, short brown hair) and a red cap. */
export const HERO: Readonly<Appearance> = freeze(dress(withSex(defaultAppearance('m'), 'm'), { id: 'bone', cores: ['#c0392f'] }));

/** The usual victim or oppressor: a woman in a wine hoodie, denim skinny jeans, sneakers and a turquoise bandana. */
export const RIVAL: Readonly<Appearance> = freeze(
  (() => {
    const a = dress(withSex(defaultAppearance('f'), 'f'), { id: 'moletomCanguru', cores: ['#5e1f2a'] }, 'jeansSkinny', 'tenis', { id: 'bandanaCabeca', cores: ['#2fb0a8'] });
    a.pele = '#c48a5e';
    a.cabelo = { id: 'rabo', cor: '#151211' };
    return a;
  })(),
);

/**
 * A seeded random look (the bots'), the same for the same `n` and sex: curate the seeds in review mode. Plain by
 * default: only the required clothes (top, bottoms, shoes) stay, and only pieces that take nothing else (a
 * hood-up hoodie also takes the head, a balaclava hoodie the head and the face: those are swapped for a plain
 * top drawn from the same seed). Every optional slot (hats 'cabeca', jackets 'sobreposicao', glasses and masks
 * 'rosto', wristbands, gear, backpacks, tattoos 'pele'...) and the PCD body ('pcd') are cleared unless `keep`
 * lists them; a piece stays only when every slot it takes is required or kept. Beards and hair stay.
 */
export function neighbor(n: number, o: { sex?: Sex; keep?: (Slot | 'pcd')[] } = {}): Appearance {
  const sex = o.sex ?? 'm';
  const rnd = seeded(n);
  const a = withSex(randomAppearance(sex, rnd), sex);
  const keep = new Set(o.keep ?? []);
  const allowed = (s: Slot) => REQUIRED_SLOTS.includes(s) || keep.has(s);
  for (const [slot, it] of Object.entries(a.itens) as [Slot, ItemChoice][]) if (!catalogItem(it.id)?.slots.every(allowed)) delete a.itens[slot];
  // A required slot left bare gets a piece of its own (one slot only), drawn from the same seed: a bot's colors.
  for (const slot of REQUIRED_SLOTS) {
    const taken = new Set(Object.values(a.itens).flatMap((c) => catalogItem(c!.id)?.slots ?? []));
    if (taken.has(slot)) continue;
    const options = CATALOG.filter((i) => i.ready && i.slots.length === 1 && i.slots[0] === slot);
    const it = options[Math.floor(rnd() * options.length)];
    if (!it) {
      wear(a, slot, '', sex);
      continue;
    }
    a.itens[slot] = choice(
      it,
      it.channels.map((_, i) => {
        const colors = suggestedColors(slot, i);
        return colors[Math.floor(rnd() * colors.length)];
      }),
    );
  }
  if (!keep.has('pcd')) a.pcd = { braco: '', perna: '' };
  return a;
}
