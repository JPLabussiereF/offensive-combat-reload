// What the Gerenciamento tab decides without a screen (client/tests/mapsScreen.test.ts): which parts of an
// account's panel the staff member gets, from the permissions GET /api/gestao/contas/:id returns for them
// (shared/roles.ts on the server), and checking what they typed before it's sent. The server checks every
// change again: this only hides and turns off what it would refuse.
import type { ContaGestao, TipoSancao } from '@shared/account';
import { PROG_WEAPONS, type ProgWeapon } from '@shared/progression';
import type { Papel } from '@shared/roles';

/** The durations offered for a sanction, as POST /api/gestao/contas/:id/sancoes takes them. */
export const DURACOES = ['1h', '12h', '1d', '7d', '30d', 'permanente'] as const;
export type Duracao = (typeof DURACOES)[number];

/** Highest XP the staff may set (the server's limit). */
export const MAX_XP = 1_000_000_000;

/** The parts of an account's panel the staff member gets. */
export interface AccountControls {
  /** Name, look, body and progress. */
  editar: boolean;
  /** Ban and mute (never oneself; a moderator never an admin). */
  punir: boolean;
  /** Lift the active ban, the active mute. */
  retirarBanimento: boolean;
  retirarSilencio: boolean;
  /** Roles that may be given, and taken away. */
  promover: Papel[];
  rebaixar: Papel[];
}

export function accountControls(c: Pick<ContaGestao, 'permissoes' | 'banida' | 'silenciada'>): AccountControls {
  const p = c.permissoes;
  return {
    editar: p.editar,
    punir: p.punir,
    retirarBanimento: p.punir && c.banida,
    retirarSilencio: p.punir && c.silenciada,
    promover: [...p.conceder],
    rebaixar: [...p.remover],
  };
}

/** A sanction to send, or why not (the reason is required; the duration one of DURACOES). */
export function sanctionBody(tipo: TipoSancao, motivo: string, duracao: string): { ok: true; body: { tipo: TipoSancao; motivo: string; duracao: Duracao } } | { ok: false; erro: 'motivo' | 'duracao' } {
  const m = motivo.trim().slice(0, 200);
  if (!m) return { ok: false, erro: 'motivo' };
  if (!DURACOES.includes(duracao as Duracao)) return { ok: false, erro: 'duracao' };
  return { ok: true, body: { tipo, motivo: m, duracao: duracao as Duracao } };
}

const whole = (s: string): number | null => {
  const t = s.trim();
  if (!/^\d+$/.test(t)) return null;
  const n = Number(t);
  return n <= MAX_XP ? n : null;
};

/**
 * The PATCH for the progress fields: only what changed (account XP, each weapon's XP), or null when a field
 * isn't a whole number from 0 to MAX_XP.
 */
export function progressPatch(c: Pick<ContaGestao, 'xp' | 'armas'>, xp: string, armas: Partial<Record<ProgWeapon, string>>): { xp?: number; armas?: Partial<Record<ProgWeapon, number>> } | null {
  const out: { xp?: number; armas?: Partial<Record<ProgWeapon, number>> } = {};
  const x = whole(xp);
  if (x === null) return null;
  if (x !== c.xp) out.xp = x;
  for (const w of PROG_WEAPONS) {
    const raw = armas[w];
    if (raw === undefined) continue;
    const v = whole(raw);
    if (v === null) return null;
    if (v !== (c.armas[w]?.xp ?? 0)) (out.armas ??= {})[w] = v;
  }
  return out;
}
