// Home screen (section 5, flow steps 2-4). Signed in: a header with tabs (Play, Arsenal, Album, Profile, Settings) and
// the account, beside the character card; Play picks online (quick join or a session from the list), bots or
// the training range, and the match type (mata-mata or corrida armada) for online and bots. Signed out: a
// landing page with the account form and a quick game against bots. Resolves with the chosen mode.
//
// Online sessions open on demand (PF-6): quick join and the map filters send 'play' (a session of the map with
// room, or a new one); the list shows the sessions open now. Online, the maps offered are the official ones from
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
import { CLOSE, NET, type ServerMsg, type SessionInfo, type Sex } from '@shared/protocol';
import { DEFAULT_MAP, isOfficialMap, OFFICIAL_MAPS, type MapId, type OfficialMapId } from '@shared/maps';
import { DEFAULT_GAME_MODE, GAME_MODE_IDS, isGameModeId, modeAllowsMap, MODE_RULES, type GameModeId } from '@shared/modes';
import { isEquipe } from '@shared/roles';
import { OFFICIAL_INFO } from '../world/mapLoader';
import { cardOf, playableMaps, unknownSessionMaps, type MapCard } from './mapsRules';
import { showMaps } from './maps';
import { showManagement } from './management';
import { Progress } from '../gameplay/progress';
import { api, fetchMe, fetchProfile } from '../net/api';
import { Connection } from '../net/connection';
import { weaponIcon } from './arsenal';
import { ArsenalCanvas } from './arsenalCanvas';
import { progOf, type WeaponId } from '@shared/progression';
import { knifeOf } from '@shared/arsenal';
import { errorText, showAuth, type AuthView } from './auth';
import { renderPortrait, showCustomizer, Stage } from './customize';
import { showProfile } from './profile';
import { showAlbum } from './album';
import { t, type StringKey } from './strings';
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

const MODES: { id: PlayMode; title: StringKey; desc: StringKey; color: string }[] = [
  { id: 'online', title: 'modeOnline', desc: 'modeOnlineDesc', color: '#ff7a1a' },
  { id: 'bots', title: 'modeBots', desc: 'modeBotsDesc', color: '#2f9bff' },
  { id: 'treino', title: 'modeRange', desc: 'modeRangeDesc', color: '#ffd23f' },
];

/** A game mode's name ("Mata-mata", "Corrida armada") and one line about it. */
export const gameModeName = (m: GameModeId) => t(`gameMode_${m}` as StringKey);
const gameModeDesc = (m: GameModeId) => t(`gameModeDesc_${m}` as StringKey);
/** Colors of each game mode's tag in the session list. */
const GAME_TINT: Record<GameModeId, string> = { 'mata-mata': '#ffe2b8', 'corrida-armada': '#e3dbff', zumbi: '#c9f5b0' };
/** A mode played on one map only (zumbi): the map filter and the map choice don't apply. */
const oneMap = (m: GameModeId) => modeMaps(m).length === 1;
/** The map a match of `m` is played on: the chosen one, if the mode is played there. */
const mapFor = (m: GameModeId, wanted: OfficialMapId) => (modeMaps(m).includes(wanted) ? wanted : modeMaps(m)[0]);
const BOT_GAMES = GAME_MODE_IDS.filter((m) => MODE_RULES[m].bots);

/** Why the server closed the game connection, for the player. */
export function closeReason(code: number) {
  return code === CLOSE.revoked ? t('sessionEnded') : code === CLOSE.replaced ? t('connectedElsewhere') : t('disconnected');
}

/** A row of toggle buttons (difficulty, bot count, map); `on` marks the chosen one. */
const segButtons = (items: { label: string; on: boolean; data: string }[]) =>
  items.map((i) => `<button type="button" class="seg-btn" data-v="${esc(i.data)}" aria-pressed="${i.on}">${esc(i.label)}</button>`).join('');

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

/** `software`: the browser draws WebGL on the CPU (client/render/quality.ts): the classic home, not the warehouse. */
export function showHome(opts: { software?: boolean } = {}): Promise<HomeChoice> {
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
  const newMapSel = $<HTMLSelectElement>('session-new-map');
  const newModeSel = $<HTMLSelectElement>('session-new-mode');
  translate(home);
  newMapSel.innerHTML = PVP_MAPS.map((id) => `<option value="${id}">${mapName(id)}</option>`).join('');
  newMapSel.title = t('mapLabel');
  newModeSel.innerHTML = GAME_MODE_IDS.map((id) => `<option value="${id}">${esc(gameModeName(id))}</option>`).join('');
  newModeSel.title = t('gameModeTitle');
  createInput.placeholder = t('sessionNamePlaceholder');
  createInput.maxLength = NET.sessionNameMax;

  // The pause menu's settings (its sub-tabs: aim, video, audio, keys or the controller, touch on phones) live in
  // the Settings tab while the home is open (given back on leaving).
  const settingsPanel = $('menu-settings');
  const settingsHome = { parent: settingsPanel.parentElement!, next: settingsPanel.nextSibling };
  $('tab-settings').appendChild(settingsPanel);

  // --- Preferences (oc.bots): mode, match type, map, online map filter, difficulty and bot count -------
  // The online filter keeps the maps taken out of it (`fora`): a map that shows up later (a community map with a
  // session) comes in ticked.
  let prefs: { skill: BotSkillName; count: number; map: OfficialMapId; mode: PlayMode; game: GameModeId; fora: string[] } = {
    skill: 'normal',
    count: 7,
    map: 'rua',
    mode: 'online',
    game: DEFAULT_GAME_MODE,
    fora: [],
  };
  try {
    const saved = JSON.parse(localStorage.getItem(BOTS_KEY) ?? '{}');
    const str = (v: unknown): v is string => typeof v === 'string';
    prefs = {
      skill: SKILLS.some(([s]) => s === saved.skill) ? saved.skill : prefs.skill,
      count: COUNTS.includes(saved.count) ? saved.count : prefs.count,
      // The remembered map is one of the open maps: a mode's own map is never anyone's default.
      map: isOfficialMap(saved.map) && openMap(saved.map) ? saved.map : prefs.map,
      mode: MODES.some((m) => m.id === saved.mode) ? saved.mode : prefs.mode,
      game: isGameModeId(saved.game) ? saved.game : prefs.game,
      // (before PF-6's community maps the filter kept the ticked maps: `filtro`)
      fora: Array.isArray(saved.fora) ? saved.fora.filter(str) : Array.isArray(saved.filtro) ? PVP_MAPS.filter((m) => !saved.filtro.includes(m)) : prefs.fora,
    };
  } catch {
    /* storage unavailable */
  }
  newMapSel.value = prefs.map;
  newModeSel.value = prefs.game;
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
    if (!useGalpao) {
      stage ??= new Stage($<HTMLCanvasElement>('char-canvas'), { wheelZoom: false });
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
    const g = await GalpaoHome.start({
      staff: isEquipe(me),
      playerTag: me.tag,
      progress,
      hooks: { showTab: (next) => showTab(next), quickPlay: () => playHooks.quickPlay(), quickLine: () => playHooks.quickLine() },
    });
    galpaoStarting = false;
    if (!g) {
      // No warehouse here: the classic home, with its character card.
      useGalpao = false;
      shownLook = '';
      return renderAccount();
    }
    if (!me) return g.dispose();
    setGalpao(g);
    // A tab opened while it was building (a link from an e-mail, choosing a name) gets its station.
    if (tab !== 'play') g.follow(tab);
  };
  const stopGalpao = () => {
    galpao?.dispose();
    setGalpao(null);
  };

  for (const b of homeTabs()) b.onclick = () => showTab(b.dataset.tab as Tab);
  $('acct-chip').onclick = () => showTab('profile');
  $('char-customize').onclick = () => {
    if (!profile) return;
    // The editor takes the panel's spare pane (the aside hides while it is open: .home-card.wide).
    showTab('auth');
    const pane = $('tab-auth');
    showCustomizer(pane, {
      look: profile.aparencia,
      sex: profile.sexo,
      setStatus,
      onClose: () => void loadAccount().then(toStart),
    });
  };
  $('land-signin').onclick = () => openAuth('login');
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

    // --- Play tab ---------------------------------------------------------------------------------------
    const renderPlay = () => {
      const online = prefs.mode === 'online';
      const range = prefs.mode === 'treino';
      $('home-modes').innerHTML = MODES.map(
        (m) => `<button type="button" class="mode-card" data-mode="${m.id}" aria-pressed="${prefs.mode === m.id}" style="--c:${m.color}">
          <span class="mode-title"><i></i><b>${t(m.title)}</b></span><span class="mode-desc">${t(m.desc)}</span></button>`,
      ).join('');
      // The match type: online and against bots (only the modes bots can play), not on the range.
      const games = online ? GAME_MODE_IDS : BOT_GAMES;
      if (!games.includes(prefs.game)) prefs.game = games[0];
      $('home-game-box').classList.toggle('hidden', range);
      $('home-game').innerHTML = segButtons(games.map((m) => ({ label: gameModeName(m), on: prefs.game === m, data: m })));
      $('home-game-hint').textContent = gameModeDesc(prefs.game);
      newModeSel.value = prefs.game;
      // New sessions only on the maps the mode is played on (online: the server's maps, community ones included).
      const sessionMaps = onlineMaps(prefs.game);
      const pickedMap = sessionMaps.some((c) => c.id === newMapSel.value) ? newMapSel.value : (sessionMaps.find((c) => c.id === prefs.map) ?? sessionMaps[0])?.id;
      newMapSel.innerHTML = sessionMaps.map((c) => `<option value="${esc(c.id)}">${esc(c.nome)}</option>`).join('');
      if (pickedMap) newMapSel.value = pickedMap;
      // Offline (bots, the range) the maps shipped with the game; online the server's.
      const shown: MapCard[] = range ? BUNDLED.filter((c) => !c.exclusivo) : online ? sessionMaps : BUNDLED.filter((c) => modeMaps(prefs.game).includes(c.id as OfficialMapId));
      // A one-map mode (zumbi with only its cemetery) only shows its map.
      const single = !range && shown.length === 1;
      $('home-map-title').textContent = t(online && !single ? 'mapFilterTitle' : 'mapLabel');
      $('home-map-hint').textContent = single ? t('zMapOnly') : online ? t('mapFilterHint') : range ? t('mapHintRange') : t('mapHintBots');
      $('home-maps').innerHTML = shown
        .map((c) => {
          const on = single || (online ? !prefs.fora.includes(c.id) : !range && prefs.map === c.id);
          const n = sessions.filter((s) => s.map === c.id && s.mode === prefs.game).length;
          const blurb = isOfficialMap(c.id) && c.tipo === 'oficial' ? t(OFFICIAL_BLURB[c.id].when) : c.autor ? t('mapsBy', { autor: c.autor }) : t('mapsCommunitySub');
          const sub = online && listed ? (n === 1 ? t('sessionsOne') : t('sessionsMany', { n })) : blurb;
          return `<button type="button" class="map-btn${online ? ' filter' : ''}" data-map="${esc(c.id)}" aria-pressed="${on}">
          ${thumb(c)}
          <span class="map-text"><b>${esc(c.nome)}</b><small>${esc(sub)}</small></span><span class="map-mark"></span></button>`;
        })
        .join('');
      $('home-bot-opts').classList.toggle('hidden', prefs.mode !== 'bots');
      $('home-skills').innerHTML = segButtons(SKILLS.map(([v, k]) => ({ label: t(k), on: prefs.skill === v, data: v })));
      $('home-counts').innerHTML = segButtons(COUNTS.map((n) => ({ label: String(n), on: prefs.count === n, data: String(n) })));
      // Zumbi offline is the player alone against the horde: no bots to pick.
      const solo = prefs.game === 'zumbi';
      $('home-skills').parentElement!.classList.toggle('hidden', solo);
      $('home-counts').parentElement!.classList.toggle('hidden', solo);
      $('home-bots').textContent = solo ? t('zSolo') : t('versusBots', { n: prefs.count });
      $('home-quick-box').classList.toggle('hidden', !online);
      $('home-lobby').classList.toggle('hidden', !online);
      // The warehouse's table: a line on the mode and the orange button that starts it.
      $('home-play-hint').textContent = t(online ? 'gpPlayHintOnline' : range ? 'gpPlayHintRange' : 'gpPlayHintBots');
      const cta = $('home-play-cta');
      const ctaMap = mapName(range ? (openMap(prefs.map) ? prefs.map : PVP_MAPS[0]) : mapFor(prefs.game, prefs.map));
      cta.querySelector('b')!.textContent = online ? t('playOnline') : range ? t('modeRange').toUpperCase() : solo ? t('zSolo') : t('versusBots', { n: prefs.count });
      cta.querySelector('span')!.textContent = online ? t('quickJoinHint') : t('gpCtaLine', { mode: range ? t('gpRangeTargets') : gameModeName(prefs.game), map: ctaMap });
      galpao?.refreshQuick();
      renderLobby();
      renderGuest();
    };

    /** The list is there as soon as the tab opens (GET /api/sessoes); long lists come a page at a time. */
    const renderLobby = () => {
      // The chosen match type and the ticked maps.
      const single = onlineMaps(prefs.game).length === 1;
      const shown = sessions.filter((s) => (single || !prefs.fora.includes(s.map)) && s.mode === prefs.game);
      $('home-lobby-title').textContent = listed ? t('openSessions', { n: shown.length }) : t('sessions');
      list.classList.toggle('hidden', !listed);
      list.innerHTML = '';
      const more = shown.length - pageSize;
      $('home-more').classList.toggle('hidden', !listed || more <= 0);
      $('home-more').textContent = t('moreSessions', { n: more });
      if (!listed) return;
      if (!shown.length) {
        list.innerHTML = `<li class="empty">${t(sessions.length ? 'noSessionsFiltered' : 'noSessions')}</li>`;
        return;
      }
      for (const s of shown.slice(0, pageSize)) {
        const li = document.createElement('li');
        const full = s.players >= s.max;
        li.innerHTML = `<span class="s-name"><b></b><small></small></span><span class="tag s-mode"></span><span class="s-count">${s.players}/${s.max}</span><button class="small-btn" ${full ? 'disabled' : ''}>${full ? t('full') : t('join')}</button>`;
        li.querySelector('.s-name b')!.textContent = s.name;
        const tag = li.querySelector<HTMLElement>('.s-mode')!;
        tag.textContent = gameModeName(s.mode);
        tag.style.background = GAME_TINT[s.mode] ?? '#fff';
        // Sessions opened by 'play' are named after their map: no need to say it twice.
        li.querySelector('.s-name small')!.textContent = s.name.startsWith(s.mapaNome) ? '' : s.mapaNome;
        li.querySelector('button')!.addEventListener('click', () => void join({ t: 'join', session: s.id }));
        list.appendChild(li);
      }
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
        setStatus(err instanceof Error ? err.message : String(err), true);
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
    $('home-maps').onclick = (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-map]');
      const id = b?.dataset.map;
      if (!id) return;
      if (prefs.mode === 'online') {
        if (onlineMaps(prefs.game).length === 1) return;
        prefs.fora = prefs.fora.includes(id) ? prefs.fora.filter((m) => m !== id) : [...prefs.fora, id];
        pageSize = PAGE;
      } else {
        // Offline: the maps shipped with the game.
        if (!isOfficialMap(id)) return;
        if (prefs.mode === 'treino') return void startOffline(id);
        if (oneMap(prefs.game)) return;
        prefs.map = id;
      }
      savePrefs();
      renderPlay();
    };
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
    const setCount = (v: string) => (prefs.count = Number(v));
    const setGame = (v: string) => isGameModeId(v) && (prefs.game = v);
    segClick('home-game', (v) => {
      setGame(v);
      pageSize = PAGE;
    });
    segClick('land-games', setGame);
    newModeSel.onchange = () => {
      setGame(newModeSel.value);
      pageSize = PAGE;
      savePrefs();
      renderPlay();
    };
    segClick('home-skills', setSkill);
    segClick('home-counts', setCount);
    segClick('land-skills', setSkill);
    segClick('land-counts', setCount);
    // (a one-map mode's only button changes nothing: its map is never kept as the choice)
    segClick('land-map-pick', (v) => isOfficialMap(v) && openMap(v) && (prefs.map = v));
    $('home-bots').onclick = () => void startBots();
    $('home-more').onclick = () => {
      pageSize += PAGE;
      renderLobby();
    };
    // Quick join: plays the map of the fullest session (not full) of the filtered maps, or one of those maps when
    // nobody is playing them (the server opens a session).
    /** The maps the quick join picks from: the ticked ones (a one-map mode's only map). */
    const quickMaps = () => {
      const all = onlineMaps(prefs.game).map((c) => c.id);
      return all.length === 1 ? all : all.filter((m) => !prefs.fora.includes(m));
    };
    const quickJoin = async () => {
      if (busy) return;
      if (!(await connect())) return;
      const maps = quickMaps();
      if (!maps.length) return setStatus(t('pickAMap'), true);
      const best = sessions.filter((s) => maps.includes(s.map) && s.mode === prefs.game && s.players < s.max).sort((a, b) => b.players - a.players)[0];
      void join({ t: 'play', map: best?.map ?? maps[Math.floor(Math.random() * maps.length)], mode: prefs.game });
    };
    $('home-quick').onclick = () => void quickJoin();
    $('home-play-cta').onclick = () => {
      if (prefs.mode === 'online') void quickJoin();
      else if (prefs.mode === 'bots') void startBots();
      else void startOffline(prefs.map);
    };
    playHooks = {
      quickPlay: () => void quickJoin(),
      quickLine: () => {
        const names = quickMaps().map((id) => cardFor(id)?.nome ?? id);
        return t('gpQuickLine', { mode: gameModeName(prefs.game), maps: names.length ? names.join(', ') : t('gpNoMapMarked') });
      },
    };
    const create = () =>
      join({ t: 'create', name: createInput.value, map: cardFor(newMapSel.value) ? newMapSel.value : DEFAULT_MAP, mode: isGameModeId(newModeSel.value) ? newModeSel.value : prefs.game });
    $('session-create-btn').onclick = () => void create();
    createInput.onkeydown = (e) => {
      if (e.key === 'Enter') void create();
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

    // The session counts on the map buttons, without a game connection (the list is public).
    const refreshList = async () => {
      if (conn || prefs.mode !== 'online') return;
      try {
        const list = await api<SessionInfo[]>('GET', '/api/sessoes');
        if (conn) return;
        sessions = list;
        recomputeCards();
        listed = true;
        renderPlay();
      } catch {
        /* server down: the maps keep their weather line */
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
