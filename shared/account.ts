// Account API shapes and rules shared by the client (forms) and the server (validation).
import type { Appearance } from './appearance';
import type { ArsenalChoice, ProgWeapon } from './progression';
import type { Sex } from './protocol';
import type { Papel } from './roles';
import type { PetChoice } from './pets';

export const NAME_RULE = /^[\p{L}\p{N}][\p{L}\p{N} _.-]{1,14}[\p{L}\p{N}]$/u;
export const NAME_MIN = 3;
export const NAME_MAX = 16;
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 128;
export const EMAIL_MAX = 254;
/** Days between name changes (the first change after sign-up is free). */
export const NAME_COOLDOWN_DAYS = 7;
/** Days an account waits in pending deletion before it is anonymized. */
export const DELETION_GRACE_DAYS = 30;

export const cleanName = (raw: unknown) => String(raw ?? '').replace(/\s+/g, ' ').trim();
export const validName = (name: string) => NAME_RULE.test(name);
export const validEmail = (email: string) => email.length <= EMAIL_MAX && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
export const validPassword = (p: string) => p.length >= PASSWORD_MIN && p.length <= PASSWORD_MAX;
export const formatTag = (name: string, discriminator: number) => `${name}#${String(discriminator).padStart(4, '0')}`;

/** GET /api/me */
export interface MeResponse {
  tag: string;
  nivel: number;
  sexo: Sex;
  provedores: ('senha' | 'discord')[];
  /** Set while the account waits for deletion: when it will be anonymized (ISO date). */
  exclusaoEm: string | null;
  /** Staff roles (empty: a player). Only what to show: the server checks them again on every request. */
  papeis: Papel[];
}

export interface WeaponProgress {
  xp: number;
  nivel: number;
}

export interface Participation {
  sessao: string;
  entrada: string;
  saida: string | null;
  abates: number;
  mortes: number;
  pontos: number;
  opressoes: number;
  xp: number;
}

export interface Totals {
  abates: number;
  mortes: number;
  cabeca: number;
  passaro: number;
  facadas: number;
  pelasCostas: number;
  granadas: number;
  opressoes: number;
  segundosJogados: number;
  participacoes: number;
  /** Zumbi mode, counted apart: zombies aren't players, co-op deaths aren't a player's kill. */
  zumbi: ZombieTotals;
}

export interface ZombieTotals {
  partidas: number;
  vitorias: number;
  melhorOnda: number;
  ondas: number;
  abates: number;
  cabeca: number;
  passaro: number;
  facadas: number;
  granadas: number;
  chefes: number;
  coveiro: number;
  noiva: number;
  prefeito: number;
  quedas: number;
  reanimacoes: number;
  mortes: number;
  caixao: number;
}

/** GET /api/perfil */
export interface ProfileResponse {
  tag: string;
  nome: string;
  sexo: Sex;
  aparencia: Appearance;
  nivel: number;
  xp: number;
  /** XP inside the current level and the cost of the next one. */
  xpNoNivel: number;
  xpProximo: number;
  armas: Record<ProgWeapon, WeaponProgress>;
  /** The Arsenal choice (secondary gun, optional upgrades turned on), already checked against the levels. */
  arsenal: ArsenalChoice;
  totais: Totals;
  /** The sticker album's own counters (shared/achievements.ts), by key; the rest of the album reads `totais`. */
  album: Record<string, number>;
  /** The sticker the player shows to the others (id) and the title they wear (a page id); null: none. */
  destaque: string | null;
  titulo: string | null;
  /** The pet taken along (id null: none), the PvP / PvE switches and each pet's look (PATCH /api/perfil {pet}). */
  pet: PetChoice;
  participacoes: Participation[];
  /** When the name can be changed again (ISO date), null = now. */
  nomeLiberaEm: string | null;
  provedores: ('senha' | 'discord')[];
  exclusaoEm: string | null;
}

/** Error codes returned by the API ({ erro }). */
export type ApiErrorCode =
  | 'nao_autorizado'
  | 'credenciais_invalidas'
  | 'muitas_tentativas'
  | 'conta_suspensa'
  | 'conta_em_exclusao'
  | 'email_em_uso'
  | 'email_invalido'
  | 'senha_invalida'
  | 'nome_invalido'
  | 'nome_esgotado'
  | 'cooldown_nome'
  | 'token_invalido'
  | 'unica_forma_de_entrar'
  | 'discord_indisponivel'
  | 'discord_ja_vinculado'
  | 'nivel_bloqueado'
  | 'figurinha_bloqueada'
  | 'origem_invalida'
  | 'nao_encontrado'
  | 'json_invalido'
  | 'corpo_grande_demais'
  | 'sem_permissao'
  | 'mapa_invalido'
  | 'orcamento_excedido'
  | 'versao_desatualizada'
  | 'arquivo_grande_demais'
  | 'glb_invalido'
  | 'mapa_oculto'
  | 'cota_excedida'
  /** One of the four original official maps (OFFICIAL_MAPS): never deleted (P44) nor hidden (P45). */
  | 'mapa_protegido'
  | 'erro_interno';

// --- Management (admin and moderator, PF-6) ----------------------------------------------------------------

/** A sanction as the Management screen sends it: 'banimento' closes the account, 'silencio' only the chat. */
export type TipoSancao = 'banimento' | 'silencio';
export const TIPOS_SANCAO: readonly TipoSancao[] = ['banimento', 'silencio'];

/** One row of GET /api/gestao/contas. */
export interface ContaResumo {
  id: string;
  tag: string;
  nivel: number;
  papeis: Papel[];
  /** Active sanctions. */
  banida: boolean;
  silenciada: boolean;
  status: 'active' | 'suspended' | 'pending_deletion' | 'deleted';
  criadaEm: string;
}

export interface SancaoInfo {
  tipo: TipoSancao | string;
  motivo: string;
  inicio: string;
  fim: string | null;
  revogadaEm: string | null;
  /** Tag of the staff member who gave it (null: the console or the system). */
  por: string | null;
}

/** GET /api/gestao/contas/:id */
export interface ContaGestao extends ContaResumo {
  nome: string;
  sexo: Sex;
  aparencia: Appearance;
  xp: number;
  armas: Record<ProgWeapon, WeaponProgress>;
  sancoes: SancaoInfo[];
  /** What the one asking may do to this account (the server checks it again on every change). */
  permissoes: { editar: boolean; punir: boolean; conceder: Papel[]; remover: Papel[] };
}
