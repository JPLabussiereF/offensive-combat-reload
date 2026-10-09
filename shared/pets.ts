// Pets (PF-29): companions that follow their owner. Six, all free for now (the catalog's `libera` already says
// which will need the support pack later, PF-28): Amora (the black Chow Chow of Rua dos Vizinhos, a fixed
// character: name and coat locked), the Bruxinha (a chibi of the Vila Assombrada's witch), a cat, a weasel, an
// otter and an iguana. In the zumbi mode each has an automatic ability with a cooldown that helps without killing
// and without money (shared/zombieMatch.ts, numbers in data/pets.json); in PvP they're only a look and can be
// turned off. One pet per account: the profile's `pet` field (player_profile.pet, checked by sanitizePet like the
// appearance) keeps the one taken along, the PvP / PvE switches and each pet's name (only its owner sees it), coat
// and collar color.
import data from './data/pets.json';
import type { ModeRules } from './modes';

export type PetId = 'amora' | 'bruxinha' | 'gato' | 'fuinha' | 'lontra' | 'iguana';
export const PET_IDS: readonly PetId[] = ['amora', 'bruxinha', 'gato', 'fuinha', 'lontra', 'iguana'];
export const isPetId = (v: unknown): v is PetId => PET_IDS.includes(v as PetId);

/** A text in each language the game ships (the same keys as client/ui/strings.ts). */
export interface PetText {
  'pt-BR': string;
  en: string;
}

/** One of a pet's coats (the Bruxinha's: her robe). The first is the default. */
export interface PetCoat {
  id: string;
  nome: PetText;
}

export interface PetDef {
  id: PetId;
  /** The pet's name until its owner gives it one (the Amora's for good). */
  nome: PetText;
  /** What it is (the card's kicker). */
  especie: PetText;
  /** Coats to pick from; empty: fixed (the Amora). */
  pelagens: readonly PetCoat[];
  /** Name and coat locked (a character of the game): only the collar changes. */
  fixo?: boolean;
  /** Flies (the Bruxinha on her broom) instead of walking on four legs. */
  voa?: boolean;
  /** How big it is: a dog stands behind the hero table on the overview, the small ones sit on it. */
  porte: 'cachorro' | 'pequeno';
  /** Who can take it: everyone ('livre') or only with the support pack ('apoio', PF-28: none for now). */
  libera: 'livre' | 'apoio';
}

export const PETS: Record<PetId, PetDef> = {
  amora: {
    id: 'amora',
    nome: { 'pt-BR': 'Amora', en: 'Amora' },
    especie: { 'pt-BR': 'Chow Chow da Rua dos Vizinhos', en: 'Chow Chow from Neighbors Street' },
    pelagens: [],
    fixo: true,
    porte: 'cachorro',
    libera: 'livre',
  },
  bruxinha: {
    id: 'bruxinha',
    nome: { 'pt-BR': 'Bruxinha', en: 'Little Witch' },
    especie: { 'pt-BR': 'Bruxa da Vila Assombrada, versão mini', en: "The Haunted Village's witch, mini" },
    pelagens: [
      { id: 'roxo', nome: { 'pt-BR': 'Robe roxo', en: 'Purple robe' } },
      { id: 'musgo', nome: { 'pt-BR': 'Robe verde-musgo', en: 'Moss-green robe' } },
      { id: 'vinho', nome: { 'pt-BR': 'Robe vinho', en: 'Wine robe' } },
    ],
    voa: true,
    porte: 'pequeno',
    libera: 'livre',
  },
  gato: {
    id: 'gato',
    nome: { 'pt-BR': 'Gata', en: 'Cat' },
    especie: { 'pt-BR': 'Gata', en: 'Cat' },
    pelagens: [
      { id: 'rajada', nome: { 'pt-BR': 'Cinza rajada', en: 'Grey tabby' } },
      { id: 'laranja', nome: { 'pt-BR': 'Laranja', en: 'Orange' } },
      { id: 'preta', nome: { 'pt-BR': 'Preta', en: 'Black' } },
    ],
    porte: 'pequeno',
    libera: 'livre',
  },
  fuinha: {
    id: 'fuinha',
    nome: { 'pt-BR': 'Fuinha', en: 'Weasel' },
    especie: { 'pt-BR': 'Fuinha', en: 'Weasel' },
    pelagens: [
      { id: 'marrom', nome: { 'pt-BR': 'Marrom', en: 'Brown' } },
      { id: 'canela', nome: { 'pt-BR': 'Canela', en: 'Cinnamon' } },
      { id: 'branca', nome: { 'pt-BR': 'Branca', en: 'White' } },
    ],
    porte: 'pequeno',
    libera: 'livre',
  },
  lontra: {
    id: 'lontra',
    nome: { 'pt-BR': 'Lontra', en: 'Otter' },
    especie: { 'pt-BR': 'Lontra', en: 'Otter' },
    pelagens: [
      { id: 'marrom', nome: { 'pt-BR': 'Marrom', en: 'Brown' } },
      { id: 'chocolate', nome: { 'pt-BR': 'Chocolate', en: 'Chocolate' } },
      { id: 'caramelo', nome: { 'pt-BR': 'Caramelo', en: 'Caramel' } },
    ],
    porte: 'pequeno',
    libera: 'livre',
  },
  iguana: {
    id: 'iguana',
    nome: { 'pt-BR': 'Iguana', en: 'Iguana' },
    especie: { 'pt-BR': 'Iguana', en: 'Iguana' },
    pelagens: [
      { id: 'verde', nome: { 'pt-BR': 'Verde', en: 'Green' } },
      { id: 'laranja', nome: { 'pt-BR': 'Laranja', en: 'Orange' } },
      { id: 'turquesa', nome: { 'pt-BR': 'Turquesa', en: 'Turquoise' } },
    ],
    porte: 'pequeno',
    libera: 'livre',
  },
};

/** The collar colors (any pet, the Amora too). The first is the default. */
export const COLLARS = [
  { id: 'vermelha', cor: 0xd8352a, nome: { 'pt-BR': 'Vermelha', en: 'Red' } },
  { id: 'azul', cor: 0x2f7fe0, nome: { 'pt-BR': 'Azul', en: 'Blue' } },
  { id: 'verde', cor: 0x2fa84f, nome: { 'pt-BR': 'Verde', en: 'Green' } },
  { id: 'amarela', cor: 0xf2c230, nome: { 'pt-BR': 'Amarela', en: 'Yellow' } },
  { id: 'rosa', cor: 0xec6fb0, nome: { 'pt-BR': 'Rosa', en: 'Pink' } },
  { id: 'roxa', cor: 0x8a4fd8, nome: { 'pt-BR': 'Roxa', en: 'Purple' } },
  { id: 'laranja', cor: 0xf07a1e, nome: { 'pt-BR': 'Laranja', en: 'Orange' } },
  { id: 'branca', cor: 0xf2efe6, nome: { 'pt-BR': 'Branca', en: 'White' } },
] as const;
export type CollarId = (typeof COLLARS)[number]['id'];
export const collarOf = (id: string | undefined) => COLLARS.find((c) => c.id === id) ?? COLLARS[0];

/** Longest name a pet can be given (code points). */
export const PET_NAME_MAX = 12;

/** What the owner chose for one pet (absent fields: the defaults). */
export interface PetLook {
  /** Its name, seen by its owner only (absent: the catalog's). */
  nome?: string;
  /** A coat of its catalog entry (absent: the first). */
  cor?: string;
  /** A collar color (absent: the first). */
  coleira?: CollarId;
}

/** The profile's pet: which one goes along (null: none, it stays in the yard), the switches and each pet's look. */
export interface PetChoice {
  id: PetId | null;
  /** Shown in PvP (deathmatch, gun game, bots, the range: a look only). */
  pvp: boolean;
  /** Along in the zumbi mode (its ability). */
  pve: boolean;
  /** Each pet's name, coat and collar, kept when another one goes along. */
  cfg: Partial<Record<PetId, PetLook>>;
}

/** A new account: no pet (taking one along is a choice), both switches on for when it takes one. */
export const emptyPetChoice = (): PetChoice => ({ id: null, pvp: true, pve: true, cfg: {} });

/**
 * A pet as the others see it (PlayerInfo.pet): which one, its coat, its collar and the switches. Never the name:
 * only the owner sees it (no moderation needed).
 */
export interface PlayerPet {
  id: PetId;
  cor: string;
  coleira: CollarId;
  pvp: boolean;
  pve: boolean;
}

const NAME_CHARS = /[^\p{L}\p{N} _.'-]/gu;

/** A pet's name as kept: printable letters, numbers, spaces and _ . ' -, single spaces, PET_NAME_MAX at most; '' = none. */
export function sanitizePetName(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  const s = raw.replace(NAME_CHARS, '').replace(/\s+/g, ' ').trim();
  return Array.from(s).slice(0, PET_NAME_MAX).join('').trim();
}

/** Whether an account can take this pet (the support pack, PF-28, will unlock the 'apoio' ones). */
export const petAllowed = (id: PetId, apoio = false) => PETS[id].libera === 'livre' || apoio;

const obj = (v: unknown): Record<string, unknown> => (typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

/** One pet's look, kept only where it's valid (the Amora keeps only her collar). */
export function sanitizePetLook(id: PetId, raw: unknown): PetLook {
  const o = obj(raw);
  const def = PETS[id];
  const out: PetLook = {};
  const nome = def.fixo ? '' : sanitizePetName(o.nome);
  if (nome) out.nome = nome;
  if (!def.fixo && typeof o.cor === 'string' && def.pelagens.some((c) => c.id === o.cor)) out.cor = o.cor;
  if (typeof o.coleira === 'string' && COLLARS.some((c) => c.id === o.coleira)) out.coleira = o.coleira as CollarId;
  return out;
}

/**
 * The profile's pet as the server keeps it (anything invalid falls back to a valid choice, like the appearance):
 * a known pet the account may take (or none), the switches (on unless said off) and each known pet's look.
 */
export function sanitizePet(raw: unknown, apoio = false): PetChoice {
  const o = obj(raw);
  const out = emptyPetChoice();
  if (isPetId(o.id) && petAllowed(o.id, apoio)) out.id = o.id;
  if (o.pvp === false) out.pvp = false;
  if (o.pve === false) out.pve = false;
  const cfg = obj(o.cfg);
  for (const id of PET_IDS) {
    if (cfg[id] === undefined) continue;
    const look = sanitizePetLook(id, cfg[id]);
    if (Object.keys(look).length) out.cfg[id] = look;
  }
  return out;
}

/** A pet's look with every default filled in. */
export function petLook(c: PetChoice | null | undefined, id: PetId): Required<Omit<PetLook, 'nome'>> & { nome: string | null } {
  const l = c?.cfg[id] ?? {};
  const def = PETS[id];
  return { nome: l.nome ?? null, cor: l.cor ?? def.pelagens[0]?.id ?? '', coleira: l.coleira ?? COLLARS[0].id };
}

/** The pet going along, as the others see it; null without one. */
export function playerPet(c: PetChoice | null | undefined): PlayerPet | null {
  if (!c?.id) return null;
  const l = petLook(c, c.id);
  return { id: c.id, cor: l.cor, coleira: l.coleira, pvp: c.pvp, pve: c.pve };
}

/**
 * Whether the pet comes along in a match of these rules: as a look in PvP (`pets: 'cosmetic'`, its PvP switch),
 * with its ability in the zumbi mode (`'ability'`, its PvE switch). No rules (the shooting range) is PvP.
 */
export function petAlong(p: PlayerPet | PetChoice | null | undefined, rules: Pick<ModeRules, 'pets'> | null): boolean {
  if (!p?.id) return false;
  return (rules?.pets ?? 'cosmetic') === 'ability' ? p.pve : p.pvp;
}

/** The name a pet is called by, in a language: its owner's name for it, or the catalog's. */
export const petName = (id: PetId, lang: keyof PetText, c?: PetChoice | null) => (PETS[id].fixo ? null : c?.cfg[id]?.nome) ?? PETS[id].nome[lang];

// --- The zumbi abilities' numbers --------------------------------------------------------------------------

/** What each pet does in the zumbi mode (data/pets.json; the tests shorten them). */
export const PET_ABILITIES = structuredClone(data.habilidades) as {
  amora: { alcance: number; segura: number; tranco: number; recarga: number };
  /** `peso`: how much each zombie type is worth to the float (divided by its distance: the dangerous ones first). */
  bruxinha: { alcance: number; duracao: number; recarga: number; peso: Record<string, number> };
  gato: { cargas: number; espera: number; segundos: number; vida: number };
  fuinha: { alcance: number; tabuaSegundos: number; tabuas: number; recarga: number };
  /** `murcha`: a Tio do Churrasco hit while swelling can't swell again for that long. */
  lontra: { alcance: number; tonto: number; murcha: number; recarga: number };
  iguana: { vida: number; raio: number; duracao: number; recarga: number };
};

/** How long a pet waits after acting (s): the cat has charges instead. */
export const petCooldown = (id: PetId): number => (id === 'gato' ? 0 : PET_ABILITIES[id].recarga);

/** What's wrong with the catalog (the tests check it is empty): coats, defaults, numbers. */
export function petProblems(): string[] {
  const out: string[] = [];
  for (const id of PET_IDS) {
    const d = PETS[id];
    if (d.id !== id) out.push(`${id}: id diferente da chave`);
    if (d.fixo ? d.pelagens.length !== 0 : d.pelagens.length < 2 || d.pelagens.length > 3) out.push(`${id}: 2 ou 3 pelagens (nenhuma se fixo)`);
    if (new Set(d.pelagens.map((c) => c.id)).size !== d.pelagens.length) out.push(`${id}: pelagem repetida`);
    if (!d.nome['pt-BR'] || !d.nome.en) out.push(`${id}: sem nome`);
    const nums = Object.values(PET_ABILITIES[id] ?? {}).flatMap((n) => (typeof n === 'object' && n !== null ? Object.values(n) : [n]));
    if (!nums.length || !nums.every((n) => typeof n === 'number' && n > 0)) out.push(`${id}: números da habilidade`);
  }
  if (new Set(COLLARS.map((c) => c.id)).size !== COLLARS.length) out.push('coleira repetida');
  return out;
}
