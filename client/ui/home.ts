// Home screen (section 5, flow steps 2-4). Signed in: a header with tabs (Play, Arsenal, Album, Profile, Settings) and
// the account, beside the character card; Play picks online (quick join or a session from the list), bots or
// the training range, and the match type (mata-mata or corrida armada) for online and bots. Signed out: a
// landing page with the account form and a quick game against bots. Resolves with the chosen mode.
//
// The Play tab (PF-32) is one path: where to play, the match type, one map (online also "Qualquer mapa"), and the
// orange button, which always stays in the same place and says what it will do (rules in client/ui/playRules.ts).
// Online sessions open on demand (PF-6): the orange button sends 'play' for the chosen map (a session of the map
// with room, or a new one); the list shows the sessions of that map open now. Online, the maps offered are the official ones from
// /api/mapas (their name, emoji and color from the current version) plus the maps of the sessions open now (a
// community map someone is playing); offline (bots, the range), the official maps shipped with the client
// (client/world/mapLoader.ts OFFICIAL_INFO). The Mapas tab (client/ui/maps.ts) lists every map, plays it online
// and opens the editor; the Gerenciamento tab (client/ui/management.ts) is the staff's.
//
// Signed in, the tabs are shown inside the Galpão (client/ui/galpao): a 3D warehouse whose stations hold them, with
// its own menu. It only presents them: this module still owns every tab, and the header with tabs and the
// character card (the classic home) stay for a CPU renderer, a browser without WebGL, or `oc.galpao` = 'off'.
import type { MeResponse, ProfileResponse } from '@shared/account';
import { defaultAppearance, type Appearance } from '@shared/appearance';
import type { MapaResumo } from '@shared/mapData';
import { CLOSE, NET, type ServerMsg, type SessionInfo, type Sex, type WsErrorCode } from '@shared/protocol';
import { DEFAULT_MAP, isOfficialMap, OFFICIAL_MAPS, type MapId, type OfficialMapId } from '@shared/maps';
import { DEFAULT_GAME_MODE, GAME_MODE_IDS, isGameModeId, modeAllowsMap, MODE_RULES, type GameModeId } from '@shared/modes';
import { isEquipe } from '@shared/roles';
import { isLang, LANG_LOCALE, LANG_NAMES, LANGS, type Lang } from '@shared/langs';
import { OFFICIAL_INFO } from '../world/mapLoader';
import { cardOf, playableMaps, unknownSessionMaps, type MapCard } from './mapsRules';
import { ctaText, effectiveOnlineMap, migrateOnlineMap, playersOn, quickTarget, say, sessionsFor, type CtaState } from './playRules';
import { showMaps } from './maps';
import { showManagement } from './management';
import { Progress } from '../gameplay/progress';
import { api, fetchMe, fetchProfile } from '../net/api';
import { Connection, Refusal } from '../net/connection';
import { weaponIcon } from './arsenal';
import { ArsenalCanvas } from './arsenalCanvas';
import { progOf, type WeaponId } from '@shared/progression';
import { knifeOf } from '@shared/arsenal';
import { errorText, showAuth, type AuthView } from './auth';
import { closeCustomizer, onCustomizerChange, renderPortrait, showCustomizer, Stage, type CustomizerHandle } from './customize';
import { showProfile } from './profile';
import { showAlbum } from './album';
import { getLang, t, type StringKey } from './strings';
import { GalpaoHome } from './galpao/galpao';
import { galpaoWanted } from './galpao/galpaoRules';

export type BotSkillName = 'facil' | 'normal' | 'dificil';

/**
 * `versao`: offline (bots, the range) on that saved version of the map, downloaded from the server (the Mapas tab,
 * P43); absent, the official map shipped with the client.
 */
export type HomeChoice = { name: string; sex: Sex; account: ProfileResponse | null; map: MapId; versao?: number } & (
  | { mode: 'offline'; variant: 'range' }
  | { mode: 'bots'; count: number; skill: BotSkillName; game: GameModeId }
  | { mode: 'online'; conn: Connection; joined: Extract<ServerMsg, { t: 'joined' }> }
  /**
   * The map editor (client/editor): a saved version of a map, or a new map (null). `rascunho`: a draft kept in
   * IndexedDB to open instead (coming back from testing it).
   */
  | { mode: 'editor'; mapa: { id: string; versao: number } | null; rascunho?: { chave: string; tipo: 'oficial' | 'comunidade' } }
);

type PlayMode = 'online' | 'bots' | 'treino';
type Tab = 'play' | 'maps' | 'arsenal' | 'album' | 'profile' | 'settings' | 'management' | 'auth';
const TABS: Tab[] = ['play', 'maps', 'arsenal', 'album', 'profile', 'settings', 'management', 'auth'];

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const BOTS_KEY = 'oc.bots';
/** 'off' keeps the classic tabbed home even where the 3D warehouse would run. */
const GALPAO_KEY = 'oc.galpao';
/** Keys of the pre-account era: name, body and progression now live in the account (Resposta P5). */
const OLD_KEYS = ['oc.name', 'oc.sex', 'oc.profile'];

const FUNNY_NAMES = ['Recruta Pimpolho', 'Sargento Pastel', 'Cabo Chinelo', 'Mira Torta', 'Soldado Bolacha', 'Tenente Mingau', 'Capitão Pipoca', 'Zé Granada'];
const SKILLS: [BotSkillName, StringKey][] = [['facil', 'skillEasy'], ['normal', 'skillNormal'], ['dificil', 'skillHard']];
const COUNTS = [3, 5, 7, 9];

/**
 * The official maps' lines on the home (when it is there, its size, its gag). How a map looks on the pickers
 * (no screenshots yet: a tint and an emoji) is its card, `cartao`, from its data.
 */
const OFFICIAL_BLURB: Record<OfficialMapId, { size: string; when: StringKey; gag: StringKey }> = {
  rua: { size: '80 × 60 m', when: 'mapRuaWhen', gag: 'mapRuaGag' },
  jardim: { size: '90 × 90 m', when: 'mapJardimWhen', gag: 'mapJardimGag' },
  halloween: { size: '120 × 110 m', when: 'mapHalloweenWhen', gag: 'mapHalloweenGag' },
  cemiterio: { size: '68 × 64 m', when: 'mapCemiterioWhen', gag: 'mapCemiterioGag' },
};
/** The official maps shipped with the client, as cards (offline play, and online until the server's list comes). */
const BUNDLED: MapCard[] = OFFICIAL_MAPS.map((id) => ({ id, tipo: 'oficial', nome: OFFICIAL_INFO[id].nome, cartao: OFFICIAL_INFO[id].cartao, exclusivo: OFFICIAL_INFO[id].exclusivo ?? null, autor: null }));
const mapName = (m: OfficialMapId) => OFFICIAL_INFO[m].nome;
/** The official maps a mode is played on offline (a map made for one mode only in that mode). */
const modeMaps = (m: GameModeId): OfficialMapId[] => OFFICIAL_MAPS.filter((id) => modeAllowsMap(m, OFFICIAL_INFO[id].exclusivo));
/** The official maps made for no single mode. */
const PVP_MAPS: OfficialMapId[] = OFFICIAL_MAPS.filter((id) => !OFFICIAL_INFO[id].exclusivo);
/** A map that may be offered outside its own mode's pickers (the training range, the landing's showcase). */
const openMap = (m: OfficialMapId) => PVP_MAPS.includes(m);
/** A map's thumbnail: its card's color and emoji. */
const thumb = (c: { cartao: { emoji: string; cor: string } }) => `<span class="map-thumb" style="--tint:${esc(c.cartao.cor)}">${esc(c.cartao.emoji)}</span>`;

/** Where to play, with the short label the compact table (a phone) shows. */
const MODES: { id: PlayMode; title: StringKey; short: StringKey }[] = [
  { id: 'online', title: 'modeOnline', short: 'modeOnlineShort' },
  { id: 'bots', title: 'modeBots', short: 'modeBotsShort' },
  { id: 'treino', title: 'modeRange', short: 'modeRangeShort' },
];

/** A game mode's name ("Mata-mata", "Corrida armada") and one line about it. */
export const gameModeName = (m: GameModeId) => t(`gameMode_${m}` as StringKey);
const gameModeDesc = (m: GameModeId) => t(`gameModeDesc_${m}` as StringKey);
/** A game mode's name on the compact table (only the long ones have a short one). */
const GAME_SHORT: Partial<Record<GameModeId, StringKey>> = { 'corrida-armada': 'gameModeShort_corrida-armada' };
const gameModeShort = (m: GameModeId) => (GAME_SHORT[m] ? t(GAME_SHORT[m]) : gameModeName(m));
/** The "Qualquer mapa" card's look (it is no map: a die). */
const ANY_CARD = { cartao: { emoji: '🎲', cor: '#e6dfcf' } };
/** A mode played on one map only (zumbi): the map choice doesn't apply. */
const oneMap = (m: GameModeId) => modeMaps(m).length === 1;
/** The map a match of `m` is played on: the chosen one, if the mode is played there. */
const mapFor = (m: GameModeId, wanted: OfficialMapId) => (modeMaps(m).includes(wanted) ? wanted : modeMaps(m)[0]);
const BOT_GAMES = GAME_MODE_IDS.filter((m) => MODE_RULES[m].bots);

/** Why the server closed the game connection, for the player. */
export function closeReason(code: number) {
  return code === CLOSE.revoked ? t('sessionEnded') : code === CLOSE.replaced ? t('connectedElsewhere') : t('disconnected');
}

/** Each refusal of an entry (shared/protocol.ts WS_ERRORS) in the player's language (PF-30). */
const REFUSAL_TEXT: Record<WsErrorCode, StringKey> = {
  sem_ola: 'wsErr_sem_ola',
  sessao_lotada: 'wsErr_sessao_lotada',
  sessao_inexistente: 'wsErr_sessao_inexistente',
  mapa_indisponivel: 'wsErr_mapa_indisponivel',
  modo_fora_do_mapa: 'wsErr_modo_fora_do_mapa',
  sem_mapa: 'wsErr_sem_mapa',
  entrada_falhou: 'wsErr_entrada_falhou',
};

/** Why joining failed, for the player: a refusal by its code, anything else as it came. */
const joinErrorText = (err: unknown) => (err instanceof Refusal && err.code ? t(REFUSAL_TEXT[err.code]) : err instanceof Error ? err.message : String(err));

/** A row of toggle buttons (difficulty, bot count, map); `on` marks the chosen one. */
const segButtons = (items: { label: string; on: boolean; data: string }[]) =>
  items.map((i) => `<button type="button" class="seg-btn" data-v="${esc(i.data)}" aria-pressed="${i.on}">${esc(i.label)}</button>`).join('');
/**
 * Fills a row of buttons, untouched when nothing changed (the session list comes again every 10 s) and otherwise
 * keeping its scroll (the compact table's maps scroll sideways) and the focused button (keyboard, controller).
 */
const drawn = new WeakMap<HTMLElement, string>();
const KEYS = ['data-map', 'data-any', 'data-all', 'data-mode', 'data-v'];
const keyOf = (b: Element) => KEYS.map((a) => b.getAttribute(a)).join('|');
function redraw(el: HTMLElement, html: string) {
  if (drawn.get(el) === html) return;
  drawn.set(el, html);
  const { scrollLeft, scrollTop } = el;
  const focused = document.activeElement;
  const key = focused && focused !== el && el.contains(focused) ? keyOf(focused) : null;
  el.innerHTML = html;
  el.scrollLeft = scrollLeft;
  el.scrollTop = scrollTop;
  if (key !== null) [...el.querySelectorAll<HTMLElement>('button')].find((b) => keyOf(b) === key)?.focus({ preventScroll: true });
}
/** Toggle buttons with a long label and a short one (`.l` / `.s`: the compact table shows the short one). */
const segLabeled = (attr: string, items: { label: string; short: string; on: boolean; data: string }[]) =>
  items
    .map((i) => `<button type="button" class="seg-btn" ${attr}="${esc(i.data)}" aria-pressed="${i.on}"><span class="l">${esc(i.label)}</span><span class="s">${esc(i.short)}</span></button>`)
    .join('');

/** Fills every `data-t` element of the home with its string. */
function translate(root: HTMLElement) {
  for (const el of root.querySelectorAll<HTMLElement>('[data-t]')) el.textContent = t(el.dataset.t as StringKey);
}

/** Static parts of the landing page: the pillars, the modes and the map showcase. */
function renderLanding(showMap: (id: OfficialMapId) => void) {
  const pillars: [StringKey, StringKey, StringKey, string, string][] = [
    ['pillarAimKicker', 'pillarAimTitle', 'pillarAimDesc', '#cfe8ff', '🎯'],
    ['pillarTauntKicker', 'pillarTauntTitle', 'pillarTauntDesc', '#ffd23f', '💃'],
    ['pillarArsenalKicker', 'pillarArsenalTitle', 'pillarArsenalDesc', '#ffe2b8', '🐔'],
  ];
  $('land-pillars').innerHTML = pillars
    .map(
      ([kicker, title, desc, tint, emoji]) => `<div class="land-tile">
        <div class="ph" style="--tint:${tint}">${emoji}</div>
        <div class="land-tile-body"><span class="tag" style="background:${tint}">${t(kicker)}</span><b>${t(title)}</b><span>${t(desc)}</span></div>
      </div>`,
    )
    .join('');
  const modes: [StringKey, StringKey, StringKey, StringKey, string, string][] = [
    ['modeOnline', 'tagAccount', 'landOnlineDesc', 'landOnlineFacts', '#ffe2b8', '🌐'],
    ['modeBots', 'tagNoAccount', 'landBotsDesc', 'landBotsFacts', '#cfe8ff', '🤖'],
    ['modeRange', 'tagNoAccount', 'landRangeDesc', 'landRangeFacts', '#cfe8ff', '🎯'],
  ];
  $('land-modes-grid').innerHTML = modes
    .map(
      ([title, tag, desc, facts, tint, emoji]) => `<div class="land-mode">
        <div class="ph" style="--tint:${tint}">${emoji}</div>
        <div class="land-mode-head"><b>${t(title)}</b><span class="tag" style="background:${tint}">${t(tag)}</span></div>
        <span>${t(desc)}</span>
        <div class="facts">${t(facts)
          .split('|')
          .map((f) => `<span>${esc(f)}</span>`)
          .join('')}</div>
      </div>`,
    )
    .join('');
  $('land-map-list').onclick = (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-map]');
    if (b && isOfficialMap(b.dataset.map)) showMap(b.dataset.map);
  };
}

function renderLandingMap(id: OfficialMapId) {
  const card = OFFICIAL_INFO[id].cartao;
  $('land-map-show').innerHTML = `<div class="ph" style="--tint:${card.cor}">${card.emoji}</div>
    <div class="land-map-caption"><span class="land-map-name">${mapName(id)}</span><span class="land-map-gag">${t(OFFICIAL_BLURB[id].gag)}</span></div>`;
  $('land-map-list').innerHTML = PVP_MAPS.map(
    (m) => `<button type="button" class="land-map-btn" data-map="${m}" aria-pressed="${m === id}"><b>${mapName(m)}</b><span>${t(OFFICIAL_BLURB[m].when)} · ${OFFICIAL_BLURB[m].size}</span></button>`,
  ).join('');
}

/**
 * `software`: the browser draws WebGL on the CPU (client/render/quality.ts): the classic home, not the warehouse.
 * `onLanguage`: a language picked on the landing (PF-30), saved and applied like the settings' row (menu.ts).
 */
export function showHome(opts: { software?: boolean; onLanguage?: (l: Lang) => void } = {}): Promise<HomeChoice> {
  let galpaoPref: string | null = null;
  try {
    for (const k of OLD_KEYS) localStorage.removeItem(k);
    galpaoPref = localStorage.getItem(GALPAO_KEY);
  } catch {
    /* storage unavailable */
  }
  const home = $('home');
  const status = $('home-status');
  const list = $('session-list');
  const createInput = $<HTMLInputElement>('session-new-name');
  const skillSel = $<HTMLSelectElement>('home-skill-sel');
  const countSel = $<HTMLSelectElement>('home-count-sel');
  translate(home);
  createInput.placeholder = t('sessionNamePlaceholder');
  createInput.maxLength = NET.sessionNameMax;
  // The compact table's bot options (a phone): the system's own picker.
  skillSel.innerHTML = SKILLS.map(([v, k]) => `<option value="${v}">${esc(t(k))}</option>`).join('');
  skillSel.title = t('botSkill');
  countSel.innerHTML = COUNTS.map((n) => `<option value="${n}">${esc(t('playBotsN', { n }))}</option>`).join('');
  countSel.title = t('botCount');

  // The pause menu's settings (its sub-tabs: aim, video, audio, keys or the controller, touch on phones) live in
  // the Settings tab while the home is open (given back on leaving).
  const settingsPanel = $('menu-settings');
  const settingsHome = { parent: settingsPanel.parentElement!, next: settingsPanel.nextSibling };
  $('tab-settings').appendChild(settingsPanel);

  // --- Preferences (oc.bots): where, match type, map, the online map, difficulty and bot count ----------
  // `map` is the last concrete open map (bots and the range; online too when one is picked); `onlineMap` is the
  // online choice, null for "Qualquer mapa". The old online filter (`fora`, before it `filtro`) becomes the one map
  // left ticked, or "Qualquer mapa" (migrateOnlineMap), and is no longer saved.
  let prefs: { skill: BotSkillName; count: number; map: OfficialMapId; mode: PlayMode; game: GameModeId; onlineMap: string | null } = {
    skill: 'normal',
    count: 7,
    map: 'rua',
    mode: 'online',
    game: DEFAULT_GAME_MODE,
    onlineMap: null,
  };
  try {
    const saved = JSON.parse(localStorage.getItem(BOTS_KEY) ?? '{}');
    prefs = {
      skill: SKILLS.some(([s]) => s === saved.skill) ? saved.skill : prefs.skill,
      count: COUNTS.includes(saved.count) ? saved.count : prefs.count,
      // The remembered map is one of the open maps: a mode's own map is never anyone's default.
      map: isOfficialMap(saved.map) && openMap(saved.map) ? saved.map : prefs.map,
      mode: MODES.some((m) => m.id === saved.mode) ? saved.mode : prefs.mode,
      game: isGameModeId(saved.game) ? saved.game : prefs.game,
      onlineMap: saved && typeof saved === 'object' ? migrateOnlineMap(saved, PVP_MAPS) : null,
    };
  } catch {
    /* storage unavailable */
  }
  const savePrefs = () => {
    try {
      localStorage.setItem(BOTS_KEY, JSON.stringify(prefs));
    } catch {
      /* storage unavailable */
    }
  };

  home.classList.remove('hidden');
  home.scrollTop = 0;
  const setStatus = (msg: string, error = false) => {
    status.textContent = msg;
    status.classList.toggle('error', error);
  };
  setStatus('');

  // --- Account ------------------------------------------------------------------------------------------
  let me: MeResponse | null = null;
  let profile: ProfileResponse | null = null;
  let progress: Progress | null = null;
  /** The Arsenal tab's canvas: one for the whole page, so its camera stays where the player left it. */
  let canvas: ArsenalCanvas | null = null;
  let discord = false;
  /** The character's body comes from the profile; without an account it is the default one. */
  let sex: Sex = 'm';
  const guestName = FUNNY_NAMES[(Math.random() * FUNNY_NAMES.length) | 0];
  let tab: Tab = 'play';
  /**
   * The header's tabs only: the panes hold tab bars of their own (the borrowed settings' sub-tabs, the
   * customizer's), and a click on one of those must not be taken for a home tab (it hid every pane).
   */
  const homeTabs = () => home.querySelectorAll<HTMLElement>('.home-tabs [role="tab"]');

  /** The Mapas and Gerenciamento tabs, wired once the online part below exists (they play and open the editor). */
  let openMaps = () => {};
  let openManagement = () => {};
  /** The 3D warehouse holding the tabs, once it is up (null: the classic home, or still building). */
  let galpao: GalpaoHome | null = null;
  /** Whether this browser gets the warehouse; false for good once it failed to start. */
  let useGalpao = galpaoWanted(!!opts.software, galpaoPref);
  let galpaoStarting = false;
  /** Where a form's Back and Cancel lead: the warehouse's overview, or the Play tab on the classic home. */
  const toStart = () => (galpao ? galpao.goHome() : showTab('play'));
  const showTab = (next: Tab) => {
    // Gerenciamento is the staff's (the server checks every request again).
    if (next === 'management' && !(me && isEquipe(me))) next = 'play';
    // Another tab: the character editor open in this one goes (its stage and cards are freed; PF-33).
    if (next !== tab) closeCustomizer();
    tab = next;
    for (const id of TABS) $(`tab-${id}`).classList.toggle('hidden', id !== next);
    for (const b of homeTabs()) b.setAttribute('aria-selected', String(b.dataset.tab === next));
    // The lists want the room the character card takes.
    home.querySelector('.home-panel')!.classList.toggle('wide', next === 'maps' || next === 'management');
    // The Arsenal takes the screen's height (the canvas pans and zooms instead of the page scrolling).
    $('home-in').classList.toggle('arsenal-open', next === 'arsenal');
    if (next === 'arsenal') canvas?.shown();
    if (next === 'profile') openProfile();
    else if (next === 'maps') openMaps();
    else if (next === 'management') openManagement();
    else if (next === 'album') void showAlbum($('tab-album'), { setStatus, onBack: toStart });
    galpao?.follow(next);
  };

  const renderEquipped = () => {
    if (!progress) return;
    // What goes into a match: the chosen rifle, secondary and knife, and the grenade (as its upgrades make it).
    const lo = progress.loadout;
    const carried: (WeaponId | null)[] = [lo.primaria, lo.secundaria, knifeOf(lo), 'granada'];
    const icons = carried.flatMap((w) => (w ? [weaponIcon(w, lo.ativas[progOf(w)])] : [])).join(' ');
    $('char-equipped').textContent = t('equippedLine', { icons });
  };

  /**
   * The real character: on the card's stage (created on first use; the warehouse has no card, and no WebGL context
   * is spent on it there) and as the header chip's portrait.
   */
  let stage: Stage | null = null;
  let shownLook = '';
  const showCharacter = (look: Appearance, s: Sex) => {
    const key = `${s}|${JSON.stringify(look)}`;
    if (key === shownLook) return;
    shownLook = key;
    galpao?.setLook(look, s);
    if (!useGalpao) {
      stage ??= new Stage($<HTMLCanvasElement>('char-canvas'), { wheelZoom: false, spin: true });
      stage.show(look, s);
    }
    void renderPortrait(look, s).then((url) => {
      if (shownLook === key) $<HTMLImageElement>('acct-avatar').src = url;
    });
  };

  /** The signed-in header chip and the character card. */
  const renderAccount = () => {
    $('home-in').classList.toggle('hidden', !me);
    $('home-out').classList.toggle('hidden', !!me);
    sex = me?.sexo ?? 'm';
    // The Gerenciamento tab only for admins and moderators.
    const staff = !!me && isEquipe(me);
    home.querySelector<HTMLElement>('.home-tabs [data-tab="management"]')!.classList.toggle('hidden', !staff);
    if (!staff && tab === 'management') showTab('play');
    galpao?.setStaff(staff);
    if (!me) return void stopGalpao();
    if (useGalpao) void startGalpao();
    $('acct-tag').textContent = $('char-tag').textContent = me.tag;
    $('acct-level').textContent = t('levelShort', { level: me.nivel });
    showCharacter(profile?.aparencia ?? defaultAppearance(sex), sex);
    const into = profile?.xpNoNivel ?? 0;
    const next = profile?.xpProximo ?? 1;
    $('acct-xp').style.width = `${Math.round((into / next) * 100)}%`;
    $('acct-xp-text').textContent = profile ? `${into} / ${next} XP` : '';
    $('char-stats').textContent = profile ? t('profileLine', { kills: profile.totais.abates, matches: profile.totais.participacoes }) : '';
  };

  const loadAccount = async () => {
    const r = await fetchMe();
    me = r.me;
    profile = me ? await fetchProfile().catch(() => null) : null;
    // The Arsenal tab edits the account's Arsenal choice (a new Progress for every load of the account).
    progress = profile ? new Progress(profile) : null;
    canvas ??= new ArsenalCanvas($('home-arsenal'));
    canvas.attach(progress);
    galpao?.setArsenalProgress(progress);
    if (progress) {
      // A change the server didn't save is already undone on screen; say so.
      progress.onSaveError(() => setStatus(t('arsenalSaveFailed'), true));
      progress.onChange(renderEquipped);
      renderEquipped();
    }
    renderAccount();
    return r;
  };

  const authOpts = {
    get discord() {
      return discord;
    },
    get sex() {
      return sex;
    },
    setStatus,
    onSignedIn: async () => {
      await loadAccount();
      setStatus('');
      if (me) {
        home.scrollTop = 0;
        toStart();
      } else showLandingAuth('register');
    },
    onCancel: () => {
      setStatus('');
      if (me) toStart();
      else showLandingAuth('register');
    },
  };
  /** Signed out, the forms live in the landing's account card; signed in (choosing a name), in a tab of their own. */
  const showLandingAuth = (view: AuthView, extra: { resetToken?: string; currentName?: string; autofocus?: boolean } = {}) => {
    showAuth($('home-auth'), view, { autofocus: false, ...authOpts, ...extra });
  };
  const openAuth = (view: AuthView, extra: { resetToken?: string; currentName?: string } = {}) => {
    if (me) {
      showTab('auth');
      // The pane may hold the character editor: freed before the form takes it.
      closeCustomizer();
      showAuth($('tab-auth'), view, { ...authOpts, ...extra });
      return;
    }
    showLandingAuth(view, { ...extra, autofocus: true });
    $('land-account').scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  const accountChanged = async () => {
    await loadAccount();
    if (!me) {
      closeConn();
      home.scrollTop = 0;
      showLandingAuth('register');
    } else if (tab === 'profile') openProfile();
  };
  const openProfile = () => {
    void showProfile($('tab-profile'), {
      discord,
      setStatus,
      onAccountChanged: () => void accountChanged(),
      onBack: toStart,
    });
  };

  // --- Galpão ---------------------------------------------------------------------------------------------
  /** What the warehouse's quick join does and says; set once the Play tab exists (below). */
  let playHooks = { quickPlay: () => {}, quickLine: () => '' };
  const setGalpao = (g: GalpaoHome | null) => {
    galpao = g;
    home.classList.toggle('galpao-mode', !!g);
    $('home-in').classList.toggle('galpao-on', !!g);
  };
  const startGalpao = async () => {
    if (galpao || galpaoStarting || !me) return;
    galpaoStarting = true;
    // The classic home stays out of sight under the splash.
    $('home-in').classList.add('galpao-on');
    home.classList.add('galpao-mode');
    const g = await GalpaoHome.start({
      staff: isEquipe(me),
      playerTag: me.tag,
      progress,
      look: profile?.aparencia ?? defaultAppearance(sex),
      sex,
      // Leaving the locker closes the character editor (and so lets the warehouse run again).
      hooks: { showTab: (next) => showTab(next), quickPlay: () => playHooks.quickPlay(), quickLine: () => playHooks.quickLine(), leaving: () => closeCustomizer() },
    });
    galpaoStarting = false;
    if (!g) {
      // No warehouse here: the classic home, with its character card.
      setGalpao(null);
      useGalpao = false;
      shownLook = '';
      return renderAccount();
    }
    if (!me) {
      g.dispose();
      return setGalpao(null);
    }
    setGalpao(g);
    // A tab opened while it was building (a link from an e-mail, choosing a name) gets its station.
    if (tab !== 'play') g.follow(tab);
  };
  const stopGalpao = () => {
    galpao?.dispose();
    setGalpao(null);
  };
  // The character editor holds the warehouse on its last frame while it's open (the camera is at the locker).
  onCustomizerChange((open) => galpao?.pause(open));

  for (const b of homeTabs()) b.onclick = () => showTab(b.dataset.tab as Tab);
  $('acct-chip').onclick = () => showTab('profile');
  /** The character card's editor (in the spare pane), freed before the pane gets anything else. */
  let cardEditor: CustomizerHandle | null = null;
  $('char-customize').onclick = () => {
    if (!profile) return;
    // The editor takes the panel's spare pane (the aside hides while it is open: .home-card.wide).
    showTab('auth');
    const pane = $('tab-auth');
    cardEditor?.dispose();
    cardEditor = showCustomizer(pane, {
      look: profile.aparencia,
      sex: profile.sexo,
      setStatus,
      onClose: () => void loadAccount().then(toStart),
    });
  };
  $('land-signin').onclick = () => openAuth('login');
  // The landing's language button (PF-30), next to ENTRAR: before any account, the four languages named in
  // themselves; picking another one saves it on this device and reloads the page in it.
  const langBtn = $('land-lang');
  const langMenu = $('land-lang-menu');
  $('land-lang-code').textContent = getLang().slice(0, 2).toUpperCase();
  langBtn.title = `${t('language')}: ${LANG_NAMES[getLang()]}`;
  langBtn.setAttribute('aria-label', langBtn.title);
  langMenu.innerHTML = LANGS.map(
    (l) => `<button type="button" role="menuitemradio" data-lang="${l}" lang="${LANG_LOCALE[l]}" aria-checked="${l === getLang()}">${esc(LANG_NAMES[l])}</button>`,
  ).join('');
  const openLangMenu = (open: boolean) => {
    langMenu.classList.toggle('hidden', !open);
    langBtn.setAttribute('aria-expanded', String(open));
  };
  langBtn.onclick = (e) => {
    e.stopPropagation();
    openLangMenu(langMenu.classList.contains('hidden'));
  };
  langMenu.onclick = (e) => {
    const l = (e.target as HTMLElement).closest<HTMLElement>('[data-lang]')?.dataset.lang;
    openLangMenu(false);
    if (isLang(l) && l !== getLang()) opts.onLanguage?.(l);
  };
  document.addEventListener('click', (e) => {
    if (!langMenu.classList.contains('hidden') && !(e.target as HTMLElement).closest('.land-lang')) openLangMenu(false);
  });
  // Landing anchors scroll the home (no #fragment left in the address: those are reserved for the redirects).
  for (const a of home.querySelectorAll<HTMLAnchorElement>('a[href^="#land-"]')) {
    a.onclick = (e) => {
      e.preventDefault();
      if (a.getAttribute('href') === '#land-account') showLandingAuth('register');
      document.getElementById(a.getAttribute('href')!.slice(1))?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };
  }
  let landMap: OfficialMapId = prefs.map;
  const showLandMap = (id: OfficialMapId) => {
    landMap = id;
    renderLandingMap(landMap);
  };
  renderLanding(showLandMap);
  showLandMap(landMap);
  showLandingAuth('register');
  showTab('play');

  // Links coming back from the e-mail or from Discord land here with a #fragment.
  const hash = location.hash.slice(1);
  if (hash) history.replaceState(null, '', location.pathname + location.search);
  void Promise.all([loadAccount(), api<{ discord: boolean }>('GET', '/api/auth/provedores').then((r) => (discord = r.discord)).catch(() => {})]).then(([r]) => {
    // The Discord button only exists once the server says so.
    if (!me) showLandingAuth('register');
    if (hash.startsWith('redefinir=')) openAuth('reset', { resetToken: decodeURIComponent(hash.slice('redefinir='.length)) });
    else if (hash === 'escolher-nome' && me) openAuth('name', { currentName: me.tag.replace(/#\d+$/, '') });
    else if (hash === 'perfil' && me) showTab('profile');
    else if (hash.startsWith('erro=')) setStatus(errorText(decodeURIComponent(hash.slice(5))), true);
    else if (r.offline) setStatus(t('errOffline'));
  });

  const playerName = () => me?.tag ?? guestName;
  const account = async () => (me ? await fetchProfile().catch(() => null) : null);

  // --- Online connection (opened on demand: a second tab would kick this account out of a running match) --
  let conn: Connection | null = null;
  /** The open sessions: live from the connection, else from GET /api/sessoes (refreshed while Online is shown). */
  let sessions: SessionInfo[] = [];
  let listed = false;
  /** GET /api/sessoes failed before any list came (the server is down): the list says so. */
  let listFailed = false;
  /** The maps offered online: the official ones (the server's current versions once they come) and the sessions' maps. */
  let cards: MapCard[] = BUNDLED;
  let officialList: MapaResumo[] | null = null;
  /** Session maps asked for their card (GET /api/mapas/:id), and the answers. */
  const askedCards = new Set<string>();
  const knownCards = new Map<string, MapCard>();
  const recomputeCards = () => {
    cards = playableMaps(BUNDLED, officialList, sessions, knownCards);
    for (const id of unknownSessionMaps(cards, sessions, askedCards)) {
      askedCards.add(id);
      void api<MapaResumo>('GET', `/api/mapas/${encodeURIComponent(id)}`)
        .then((m) => {
          knownCards.set(id, cardOf(m));
          cards = playableMaps(BUNDLED, officialList, sessions, knownCards);
          renderMapsChanged();
        })
        .catch(() => {});
    }
  };
  /** Set once the Play tab exists: the map lists changed. */
  let renderMapsChanged = () => {};
  const loadOfficial = () =>
    api<{ mapas: MapaResumo[] }>('GET', '/api/mapas?tipo=oficial&ordem=recentes')
      .then((r) => {
        officialList = r.mapas;
        recomputeCards();
        renderMapsChanged();
      })
      .catch(() => {
        /* server down: the shipped copies stand in */
      });
  /** The maps a mode is played on online. */
  const onlineMaps = (g: GameModeId) => cards.filter((c) => modeAllowsMap(g, c.exclusivo));
  const cardFor = (id: string) => cards.find((c) => c.id === id) ?? BUNDLED.find((c) => c.id === id);
  const nameOf = (id: string) => cardFor(id)?.nome ?? id;
  /** The map the online choice stands for now (null: "Qualquer mapa"). A map that left the list isn't forgotten. */
  const onlineMap = () => effectiveOnlineMap(prefs.onlineMap, cards, prefs.game);
  /** The training range's map: the last open map chosen. */
  const rangeMap = (): OfficialMapId => (openMap(prefs.map) ? prefs.map : PVP_MAPS[0]);
  const closeConn = () => {
    if (conn) conn.onClose = () => {};
    conn?.close();
    conn = null;
  };

  return new Promise((resolve) => {
    let busy = false;
    /** How many sessions the list shows (one more page per "show more"). */
    const PAGE = 6;
    let pageSize = PAGE;
    /** The compact table (a phone): the sessions shown in place of the maps. */
    let sessionsOpen = false;
    /** "+ Criar sessão com nome" opened (only the name: the map and the type are the ones chosen). */
    let createOpen = false;
    const leave = (choice: HomeChoice) => {
      clearInterval(poll);
      const go = () => {
        settingsHome.parent.insertBefore(settingsPanel, settingsHome.next);
        stage?.dispose();
        stopGalpao();
        home.classList.add('hidden');
        resolve(choice);
      };
      // In the warehouse a match starts with the roll-up door opening (not the editor: it isn't a match).
      if (galpao && choice.mode !== 'editor') void galpao.launch(...launchText(choice)).then(go);
      else go();
    };
    /** The launch's title and line: the session, or the match type (the range) and the map. */
    const launchText = (c: HomeChoice): [string, string] => {
      const map = cardFor(c.map)?.nome ?? (isOfficialMap(c.map) ? mapName(c.map) : c.map);
      if (c.mode === 'online') {
        const s = c.joined.session;
        return [s.name, t('gpLaunchOnline', { map: s.mapaNome, mode: gameModeName(s.mode), n: s.players, max: s.max })];
      }
      if (c.mode === 'bots') return [gameModeName(c.game), c.game === 'zumbi' ? t('gpLaunchHorde', { map }) : t('gpLaunchBots', { n: c.count, map })];
      return [t('modeRange'), t('gpLaunchRange', { map })];
    };

    // --- Play tab (PF-32: where → match type → one map → the orange button) ------------------------------
    /** A map's line on its card before the session list (or offline): its weather, or who made it. */
    const blurbOf = (c: MapCard) =>
      isOfficialMap(c.id) && c.tipo === 'oficial' ? t(OFFICIAL_BLURB[c.id].when) : c.autor ? t('mapsBy', { autor: c.autor }) : t('mapsCommunitySub');
    /** How many play online on a map (null: every map of the type), as the card's line. */
    const playersLine = (map: string | null) => {
      const n = playersOn(sessions, prefs.game, map);
      return n ? t('playPlayers', { n }) : t('playNobody');
    };
    /** A map card: one choice (aria-pressed), never a start. */
    const tile = (attr: string, card: { cartao: { emoji: string; cor: string } }, name: string, sub: string, on: boolean) =>
      `<button type="button" class="map-btn map-tile" ${attr} aria-pressed="${on}">${thumb(card)}<span class="map-text"><b>${esc(name)}</b><small>${esc(sub)}</small></span><span class="map-mark" aria-hidden="true"></span></button>`;
    /** The online choice's name: the map's, or "qualquer mapa" inside a sentence. */
    const onlineLabel = (map: string | null) => (map ? nameOf(map) : t('playAnyMap').toLocaleLowerCase());

    const renderPlay = () => {
      const online = prefs.mode === 'online';
      const range = prefs.mode === 'treino';
      const bots = prefs.mode === 'bots';
      const tabPlay = $('tab-play');
      // Where: a short toggle on the sheet's head, with one line on it beside.
      redraw(
        $('home-modes'),
        segLabeled(
          'data-mode',
          MODES.map((m) => ({ label: t(m.title), short: t(m.short), on: prefs.mode === m.id, data: m.id })),
        ),
      );
      $('home-play-hint').textContent = t(online ? 'gpPlayHintOnline' : range ? 'gpPlayHintRange' : 'gpPlayHintBots');
      // The match type: online and against bots (only the modes bots can play). On the range the row keeps its
      // height and says there is none, so the maps stay where they are.
      const games = online ? GAME_MODE_IDS : BOT_GAMES;
      if (!games.includes(prefs.game)) prefs.game = games[0];
      redraw($('home-game'), range ? '' : segLabeled('data-v', games.map((m) => ({ label: gameModeName(m), short: gameModeShort(m), on: prefs.game === m, data: m }))));
      $('home-game-hint').textContent = range ? t('playRangeType') : gameModeDesc(prefs.game);

      // The maps: one chosen. Offline (bots, the range) the maps shipped with the game; online the server's.
      const shown: MapCard[] = range ? BUNDLED.filter((c) => !c.exclusivo) : online ? onlineMaps(prefs.game) : BUNDLED.filter((c) => modeMaps(prefs.game).includes(c.id as OfficialMapId));
      // A one-map mode (zumbi with only its cemetery) only shows its map, chosen.
      const single = !range && shown.length === 1;
      const oMap = onlineMap();
      const chosen: string | null = online ? oMap : bots ? mapFor(prefs.game, prefs.map) : rangeMap();
      $('home-map-title').textContent = t('mapLabel');
      $('home-map-hint').textContent = single ? t('zMapOnly') : '';
      const tiles = shown.map((c) => tile(`data-map="${esc(c.id)}"`, c, c.nome, online && listed ? playersLine(c.id) : blurbOf(c), c.id === chosen));
      // Online, "Qualquer mapa" first (where most people are: the fullest session of the type).
      if (online && !single) tiles.unshift(tile('data-any="1"', ANY_CARD, t('playAnyMap'), listed ? playersLine(null) : t('playAnyMapSub'), oMap === null));
      // The compact table's last card opens the Mapas station (elsewhere the link on the maps' head does).
      tiles.push(`<button type="button" class="map-all" data-all="1">${esc(t('playAllMaps'))}</button>`);
      redraw($('home-maps'), tiles.join(''));

      // The side panel: sessions online, the options against bots (the horde alone in zumbi), the range's line.
      const solo = bots && prefs.game === 'zumbi';
      $('home-lobby').classList.toggle('hidden', !online);
      $('home-bot-opts').classList.toggle('hidden', !bots);
      $('home-range-info').classList.toggle('hidden', !range);
      $('home-bot-title').textContent = t(solo ? 'playHordeTitle' : 'playBotsTitle');
      redraw($('home-skills'), segButtons(SKILLS.map(([v, k]) => ({ label: t(k), on: prefs.skill === v, data: v }))));
      redraw($('home-counts'), segButtons(COUNTS.map((n) => ({ label: String(n), on: prefs.count === n, data: String(n) }))));
      // Zumbi offline is the player alone against the horde: no bots to pick.
      $('home-skills').parentElement!.classList.toggle('hidden', solo);
      $('home-counts').parentElement!.classList.toggle('hidden', solo);
      $('home-horde-info').textContent = t('playHordeInfo');
      $('home-horde-info').classList.toggle('hidden', !solo);
      $('home-range-info').innerHTML ||= `<h4>${esc(t('playRangeTitle'))}</h4><p class="hint">${esc(t('playRangeInfo'))}</p>`;

      // The compact table's foot: SESSÕES (N) online, the bot options as selects, the horde's line.
      const toggle = $('home-sessions-toggle');
      toggle.classList.toggle('hidden', !online);
      toggle.textContent = t('playSessionsBtn', { n: listed ? sessionsFor(sessions, prefs.game, oMap).length : '…' });
      toggle.setAttribute('aria-pressed', String(online && sessionsOpen));
      skillSel.classList.toggle('hidden', !bots || solo);
      countSel.classList.toggle('hidden', !bots || solo);
      skillSel.value = prefs.skill;
      countSel.value = String(prefs.count);
      $('home-horde-short').textContent = t('playHordeShort');
      $('home-horde-short').classList.toggle('hidden', !solo);
      if (!online) sessionsOpen = false;
      tabPlay.classList.toggle('sessions-open', sessionsOpen);

      // The orange button: always there, saying what it is about to do.
      const state: CtaState = online
        ? { where: 'online', mode: gameModeName(prefs.game), map: onlineLabel(oMap), players: listed ? playersOn(sessions, prefs.game, oMap) : null }
        : bots
          ? { where: 'bots', mode: gameModeName(prefs.game), map: nameOf(chosen!), solo, count: prefs.count, skill: t(SKILLS.find(([s]) => s === prefs.skill)![1]) }
          : { where: 'treino', map: nameOf(chosen!) };
      const cta = ctaText(state);
      const ctaEl = $('home-play-cta');
      ctaEl.querySelector('b')!.textContent = say(cta.title);
      ctaEl.querySelector('span')!.textContent = say(cta.detail);
      // The classic home's quick join beside the character (the other tabs): online, with the same line.
      $('home-quick-box').classList.toggle('hidden', !online);
      $('home-quick-sub').textContent = online ? say(cta.detail) : '';
      galpao?.refreshQuick();
      renderLobby();
      renderGuest();
    };

    /**
     * The sessions of the chosen map and type ("Qualquer mapa": every map of the type), in the server's order and a
     * page at a time; there as soon as the tab opens (GET /api/sessoes). Below, the named session, folded.
     */
    const renderLobby = () => {
      const map = onlineMap();
      const label = onlineLabel(map);
      const shown = sessionsFor(sessions, prefs.game, map);
      $('home-lobby-title').textContent = t('playSessionsOn', { map: label, n: listed ? shown.length : '…' });
      list.innerHTML = '';
      const more = listed ? shown.length - pageSize : 0;
      $('home-more').classList.toggle('hidden', more <= 0);
      $('home-more').textContent = t('moreSessions', { n: more });
      // The empty list says what to do next (the orange button opens a session by itself).
      const empty = (text: string) => (list.innerHTML = `<li class="empty">${esc(text)}</li>`);
      if (!listed) empty(t(listFailed ? 'playSessionsOffline' : 'playSessionsLoading'));
      else if (!shown.length) empty(map ? t('noSessionsMap', { map: label }) : t('noSessions'));
      for (const s of listed ? shown.slice(0, pageSize) : []) {
        const li = document.createElement('li');
        const full = s.players >= s.max;
        li.innerHTML = `<span class="s-name"><b></b><small></small></span><span class="s-count">${s.players}/${s.max}</span><button class="small-btn" ${full ? 'disabled' : ''}>${full ? t('full') : t('join')}</button>`;
        li.querySelector('.s-name b')!.textContent = s.name;
        // The map only with "Qualquer mapa", and not when the name says it (sessions opened by 'play' are named after it).
        li.querySelector('.s-name small')!.textContent = map === null && !s.name.startsWith(s.mapaNome) ? s.mapaNome : '';
        li.querySelector('button')!.addEventListener('click', () => void join({ t: 'join', session: s.id }));
        list.appendChild(li);
      }
      // A named session: on the chosen map and type; with "Qualquer mapa" there is no map to create it on.
      const canCreate = map !== null;
      if (!canCreate && createOpen) {
        createOpen = false;
        createInput.value = '';
      }
      const toggle = $<HTMLButtonElement>('home-create-toggle');
      toggle.disabled = !canCreate;
      toggle.title = canCreate ? '' : t('playCreatePickMap');
      toggle.setAttribute('aria-expanded', String(createOpen));
      toggle.innerHTML ||= `<span class="l">${esc(t('playCreateToggle'))}</span><span class="s">${esc(t('playCreateShort'))}</span><i class="x">×</i>`;
      $('home-create-pick').textContent = t('playCreatePickMap');
      $('home-create-pick').classList.toggle('hidden', canCreate);
      $('session-create').classList.toggle('hidden', !createOpen);
      $('home-lobby').classList.toggle('create-open', createOpen);
      $('home-create-where').textContent = t('playCreateWhere', { map: label, mode: gameModeName(prefs.game) });
    };

    /** Opens the game connection and starts listening to the session list. False if it could not. */
    const connect = async (): Promise<boolean> => {
      if (conn) return true;
      if (!me) await loadAccount();
      if (!me) {
        openAuth('login');
        setStatus(t('needAccount'));
        return false;
      }
      if (me.exclusaoEm) {
        setStatus(t('errPendingDeletion'), true);
        return false;
      }
      setStatus(t('connecting'));
      try {
        const c = await Connection.open();
        const welcomeP = c.next('welcome');
        c.send({ t: 'hello' });
        const welcome = await welcomeP;
        conn = c;
        sessions = welcome.sessions;
        recomputeCards();
        listed = true;
        c.on('sessions', (m) => {
          sessions = m.list;
          recomputeCards();
          renderPlay();
        });
        c.onClose = (code) => {
          conn = null;
          renderPlay();
          setStatus(closeReason(code), true);
        };
        setStatus(t('connectedAs', { name: welcome.name }));
        renderPlay();
        return true;
      } catch (err) {
        setStatus(err instanceof Error && err.message === 'não foi possível conectar ao servidor' ? t('errOffline') : errorText(err), true);
        return false;
      }
    };

    /** Joins (or creates) a session, opening the game connection first if needed. */
    const join = async (msg: { t: 'join'; session: string } | { t: 'play'; map: MapId; mode: GameModeId } | { t: 'create'; name: string; map: MapId; mode: GameModeId }) => {
      if (busy) return;
      busy = true;
      try {
        if (!(await connect())) return;
        const c = conn!;
        setStatus(t('joining'));
        // A refusal ('error': the map isn't there, the session filled up) rejects it.
        const joinedP = c.next('joined');
        // The Arsenal is chosen here, before the match: the server takes it now (it's locked once inside).
        if (progress) c.send({ t: 'loadout', lo: progress.choice });
        c.send(msg);
        const joined = await joinedP;
        // The game releases these once its handlers exist (after the map is built).
        c.hold();
        const acct = await account();
        leave({ mode: 'online', name: playerName(), sex, account: acct, map: joined.session.map, conn: c, joined });
      } catch (err) {
        setStatus(joinErrorText(err), true);
      } finally {
        busy = false;
      }
    };

    const startOffline = async (wanted: OfficialMapId) => {
      if (busy) return;
      busy = true;
      // The training range is never on a map made for one mode.
      const map = openMap(wanted) ? wanted : PVP_MAPS[0];
      closeConn();
      prefs.map = map;
      savePrefs();
      const acct = await account();
      leave({ mode: 'offline', name: playerName(), sex, account: acct, map, variant: 'range' });
    };
    const startBots = async () => {
      if (busy) return;
      busy = true;
      closeConn();
      savePrefs();
      const acct = await account();
      const game = BOT_GAMES.includes(prefs.game) ? prefs.game : DEFAULT_GAME_MODE;
      leave({ mode: 'bots', name: playerName(), sex, account: acct, map: mapFor(game, prefs.map), count: prefs.count, skill: prefs.skill, game });
    };

    $('home-modes').onclick = (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-mode]');
      if (!b) return;
      prefs.mode = b.dataset.mode as PlayMode;
      pageSize = PAGE;
      // Only the online mode keeps the connection.
      if (prefs.mode !== 'online') closeConn();
      else void refreshList();
      savePrefs();
      setStatus('');
      renderPlay();
    };
    // A map card only chooses (in every tab; the orange button starts). An open official map is also the map of
    // bots and the range; online the choice is kept apart ("Qualquer mapa" only exists online).
    $('home-maps').onclick = (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-map], [data-any], [data-all]');
      if (!b) return;
      if (b.dataset.all) return showTab('maps');
      const id = b.dataset.any ? null : (b.dataset.map ?? null);
      if (prefs.mode === 'online') {
        if (onlineMaps(prefs.game).length === 1) return;
        prefs.onlineMap = id;
        if (id !== null && isOfficialMap(id) && openMap(id)) prefs.map = id;
      } else {
        // Offline: the open maps shipped with the game (a one-map mode's only map is never kept as the choice).
        if (id === null || !isOfficialMap(id) || !openMap(id)) return;
        if (prefs.mode === 'bots' && oneMap(prefs.game)) return;
        prefs.map = id;
      }
      pageSize = PAGE;
      sessionsOpen = false;
      savePrefs();
      renderPlay();
    };
    $('home-all-maps').onclick = () => showTab('maps');
    const segClick = (id: string, apply: (v: string) => void) => {
      $(id).onclick = (e) => {
        const b = (e.target as HTMLElement).closest<HTMLElement>('[data-v]');
        if (!b) return;
        apply(b.dataset.v!);
        savePrefs();
        renderPlay();
      };
    };
    const setSkill = (v: string) => (prefs.skill = v as BotSkillName);
    const setCount = (v: string) => COUNTS.includes(Number(v)) && (prefs.count = Number(v));
    const setGame = (v: string) => isGameModeId(v) && (prefs.game = v);
    segClick('home-game', (v) => {
      setGame(v);
      pageSize = PAGE;
    });
    segClick('land-games', setGame);
    segClick('home-skills', setSkill);
    segClick('home-counts', setCount);
    segClick('land-skills', setSkill);
    segClick('land-counts', setCount);
    // (a one-map mode's only button changes nothing: its map is never kept as the choice)
    segClick('land-map-pick', (v) => isOfficialMap(v) && openMap(v) && (prefs.map = v));
    // The compact table's selects write the same preferences as the toggles.
    skillSel.onchange = () => {
      if (SKILLS.some(([s]) => s === skillSel.value)) setSkill(skillSel.value);
      savePrefs();
      renderPlay();
    };
    countSel.onchange = () => {
      setCount(countSel.value);
      savePrefs();
      renderPlay();
    };
    // The compact table: SESSÕES (N) shows the list in place of the maps; ‹ MAPAS goes back.
    $('home-sessions-toggle').onclick = () => {
      sessionsOpen = !sessionsOpen;
      renderPlay();
    };
    $('home-maps-back').onclick = () => {
      sessionsOpen = false;
      renderPlay();
    };
    $('home-more').onclick = () => {
      pageSize += PAGE;
      renderLobby();
    };
    // The online button (and the warehouse's ENTRADA RÁPIDA): 'play' on the chosen map; with "Qualquer mapa", the
    // map of the fullest session of the type with room, or an official map of the type when nobody plays (the
    // server picks the room on the map, or opens one).
    const quickJoin = async () => {
      if (busy) return;
      if (!(await connect())) return;
      const officials = onlineMaps(prefs.game)
        .filter((c) => c.tipo === 'oficial')
        .map((c) => c.id);
      void join({ t: 'play', map: quickTarget(sessions, prefs.game, onlineMap(), officials) ?? DEFAULT_MAP, mode: prefs.game });
    };
    $('home-quick').onclick = () => void quickJoin();
    $('home-play-cta').onclick = () => {
      if (prefs.mode === 'online') void quickJoin();
      else if (prefs.mode === 'bots') void startBots();
      else void startOffline(rangeMap());
    };
    playHooks = {
      quickPlay: () => void quickJoin(),
      quickLine: () => {
        const map = onlineMap();
        return t('gpQuickLine', { mode: gameModeName(prefs.game), map: map ? nameOf(map) : t('playAnyMap') });
      },
    };
    // A named session: only the name; the map and the type are the ones chosen (never "Qualquer mapa").
    const create = () => {
      const map = onlineMap();
      if (map !== null) void join({ t: 'create', name: createInput.value, map, mode: prefs.game });
    };
    $('home-create-toggle').onclick = () => {
      createOpen = !createOpen;
      if (!createOpen) createInput.value = '';
      renderLobby();
      if (createOpen) createInput.focus();
    };
    $('session-create-btn').onclick = () => create();
    createInput.onkeydown = (e) => {
      if (e.key === 'Enter') create();
    };

    // --- Landing: a game against bots without an account ------------------------------------------------
    const renderGuest = () => {
      $('land-guest').innerHTML = t('startGuest', { name: `<b>${esc(guestName)}</b>` });
      const game = BOT_GAMES.includes(prefs.game) ? prefs.game : DEFAULT_GAME_MODE;
      const solo = game === 'zumbi';
      $('land-map-pick').innerHTML = segButtons(modeMaps(game).map((id) => ({ label: mapName(id), on: mapFor(game, prefs.map) === id, data: id })));
      $('land-games').innerHTML = segButtons(BOT_GAMES.map((m) => ({ label: gameModeName(m), on: game === m, data: m })));
      $('land-skills').innerHTML = segButtons(SKILLS.map(([v, k]) => ({ label: t(k), on: prefs.skill === v, data: v })));
      $('land-counts').innerHTML = segButtons(COUNTS.map((n) => ({ label: String(n), on: prefs.count === n, data: String(n) })));
      $('land-skills').closest('.land-row')!.classList.toggle('hidden', solo);
      $('land-bots').textContent = solo ? t('zSolo') : t('versusBots', { n: prefs.count });
    };
    $('land-bots').onclick = () => void startBots();
    $('land-range').onclick = () => void startOffline(prefs.map);

    // The session list and the players on the map cards, without a game connection (the list is public).
    const refreshList = async () => {
      if (conn || prefs.mode !== 'online') return;
      try {
        const list = await api<SessionInfo[]>('GET', '/api/sessoes');
        if (conn) return;
        sessions = list;
        recomputeCards();
        listed = true;
        listFailed = false;
        renderPlay();
      } catch {
        // Server down: the maps keep their weather line, and the list says so if none ever came.
        if (!listed && !listFailed) {
          listFailed = true;
          renderPlay();
        }
      }
    };
    const poll = window.setInterval(() => void refreshList(), 10_000);

    // --- Mapas and Gerenciamento -------------------------------------------------------------------------
    renderMapsChanged = () => {
      if (tab === 'play') renderPlay();
    };
    openMaps = () => {
      if (!me) return showTab('play');
      showMaps($('tab-maps'), {
        me,
        setStatus,
        game: prefs.game,
        setGame: (g) => {
          prefs.game = g;
          savePrefs();
        },
        // Jogar: online, the 'play' message in the mode chosen (a session of that version of the map with room, or a new one).
        play: (map, mode) => void join({ t: 'play', map, mode }),
        // Contra bots and Campo de tiro (P43): offline on the map's current version, with the Play tab's bot settings.
        bots: (mapa, game) => {
          if (busy) return;
          busy = true;
          closeConn();
          void account().then((acct) =>
            leave({ mode: 'bots', name: playerName(), sex, account: acct, map: mapa.id, versao: mapa.versao, count: prefs.count, skill: prefs.skill, game }),
          );
        },
        range: (mapa) => {
          if (busy) return;
          busy = true;
          closeConn();
          void account().then((acct) => leave({ mode: 'offline', name: playerName(), sex, account: acct, map: mapa.id, versao: mapa.versao, variant: 'range' }));
        },
        // Editar and Novo mapa: the editor takes over the page (client/editor).
        edit: (mapa) => {
          if (busy) return;
          closeConn();
          leave({ mode: 'editor', mapa, name: playerName(), sex, account: null, map: mapa?.id ?? DEFAULT_MAP });
        },
      });
    };
    openManagement = () => {
      if (!me || !isEquipe(me)) return showTab('play');
      showManagement($('tab-management'), { setStatus });
    };
    if (tab === 'maps') openMaps();
    else if (tab === 'management') openManagement();

    void refreshList();
    void loadOfficial();
    renderPlay();
  });
}
