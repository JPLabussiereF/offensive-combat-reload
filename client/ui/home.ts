// Home screen (section 5, flow steps 2-4). Signed in: a header with tabs (Play, Arsenal, Album, Profile, Settings) and
// the account, beside the character card; Play picks online (quick join or a session from the list), bots or
// the training range, and the match type (mata-mata or corrida armada) for online and bots. Signed out: a
// landing page with the account form and a quick game against bots. Resolves with the chosen mode.
import type { MeResponse, ProfileResponse } from '@shared/account';
import { defaultAppearance, type Appearance } from '@shared/appearance';
import { CLOSE, NET, type ServerMsg, type SessionInfo, type Sex } from '@shared/protocol';
import { DEFAULT_MAP, isMapId, MAPS, PVP_MAPS, type MapId } from '@shared/maps';
import { DEFAULT_GAME_MODE, GAME_MODE_IDS, isGameModeId, modeMaps, MODE_RULES, type GameModeId } from '@shared/modes';
import { Progress } from '../gameplay/progress';
import { api, fetchMe, fetchProfile } from '../net/api';
import { Connection } from '../net/connection';
import { Arsenal, weaponIcon } from './arsenal';
import { progOf, type WeaponId } from '@shared/progression';
import { knifeOf } from '@shared/arsenal';
import { errorText, showAuth, type AuthView } from './auth';
import { renderPortrait, showCustomizer, Stage } from './customize';
import { showProfile } from './profile';
import { showAlbum } from './album';
import { t, type StringKey } from './strings';

export type BotSkillName = 'facil' | 'normal' | 'dificil';

export type HomeChoice = { name: string; sex: Sex; account: ProfileResponse | null; map: MapId } & (
  | { mode: 'offline'; variant: 'range' }
  | { mode: 'bots'; count: number; skill: BotSkillName; game: GameModeId }
  | { mode: 'online'; conn: Connection; joined: Extract<ServerMsg, { t: 'joined' }> }
);

type PlayMode = 'online' | 'bots' | 'treino';
type Tab = 'play' | 'arsenal' | 'album' | 'profile' | 'settings' | 'auth';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const BOTS_KEY = 'oc.bots';
/** Keys of the pre-account era: name, body and progression now live in the account (Resposta P5). */
const OLD_KEYS = ['oc.name', 'oc.sex', 'oc.profile'];

const FUNNY_NAMES = ['Recruta Pimpolho', 'Sargento Pastel', 'Cabo Chinelo', 'Mira Torta', 'Soldado Bolacha', 'Tenente Mingau', 'Capitão Pipoca', 'Zé Granada'];
const SKILLS: [BotSkillName, StringKey][] = [['facil', 'skillEasy'], ['normal', 'skillNormal'], ['dificil', 'skillHard']];
const COUNTS = [3, 5, 7, 9];

/** How each map is shown on the home (no screenshots yet: a tint and an emoji stand in for them). */
const MAP_LOOK: Record<MapId, { tint: string; emoji: string; size: string; when: StringKey; gag: StringKey }> = {
  rua: { tint: '#cfe8ff', emoji: '🏡', size: '80 × 60 m', when: 'mapRuaWhen', gag: 'mapRuaGag' },
  jardim: { tint: '#ffe2b8', emoji: '🏮', size: '90 × 90 m', when: 'mapJardimWhen', gag: 'mapJardimGag' },
  halloween: { tint: '#e3dbff', emoji: '🎃', size: '120 × 110 m', when: 'mapHalloweenWhen', gag: 'mapHalloweenGag' },
  cemiterio: { tint: '#c9f5b0', emoji: '⚰️', size: '68 × 64 m', when: 'mapCemiterioWhen', gag: 'mapCemiterioGag' },
};
/** A map that may be offered outside its own mode's pickers (the training range, the landing's showcase). */
const openMap = (m: MapId) => PVP_MAPS.includes(m);

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
const mapFor = (m: GameModeId, wanted: MapId) => (modeMaps(m).includes(wanted) ? wanted : modeMaps(m)[0]);
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
function renderLanding(showMap: (id: MapId) => void) {
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
    if (b && isMapId(b.dataset.map)) showMap(b.dataset.map);
  };
}

function renderLandingMap(id: MapId) {
  const look = MAP_LOOK[id];
  $('land-map-show').innerHTML = `<div class="ph" style="--tint:${look.tint}">${look.emoji}</div>
    <div class="land-map-caption"><span class="land-map-name">${MAPS[id].nome}</span><span class="land-map-gag">${t(look.gag)}</span></div>`;
  $('land-map-list').innerHTML = PVP_MAPS.map(
    (m) => `<button type="button" class="land-map-btn" data-map="${m}" aria-pressed="${m === id}"><b>${MAPS[m].nome}</b><span>${t(MAP_LOOK[m].when)} · ${MAP_LOOK[m].size}</span></button>`,
  ).join('');
}

export function showHome(): Promise<HomeChoice> {
  try {
    for (const k of OLD_KEYS) localStorage.removeItem(k);
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
  newMapSel.innerHTML = PVP_MAPS.map((id) => `<option value="${id}">${MAPS[id].nome}</option>`).join('');
  newMapSel.title = t('mapLabel');
  newModeSel.innerHTML = GAME_MODE_IDS.map((id) => `<option value="${id}">${esc(gameModeName(id))}</option>`).join('');
  newModeSel.title = t('gameModeTitle');
  createInput.placeholder = t('sessionNamePlaceholder');
  createInput.maxLength = NET.sessionNameMax;

  // The menu's controls and settings live in the Settings tab while the home is open (given back on leaving).
  const settingsPanel = $('menu-settings');
  const settingsHome = { parent: settingsPanel.parentElement!, next: settingsPanel.nextSibling };
  $('tab-settings').appendChild(settingsPanel);

  // --- Preferences (oc.bots): mode, match type, map, online map filter, difficulty and bot count -------
  let prefs: { skill: BotSkillName; count: number; map: MapId; mode: PlayMode; game: GameModeId; filtro: MapId[] } = {
    skill: 'normal',
    count: 7,
    map: DEFAULT_MAP,
    mode: 'online',
    game: DEFAULT_GAME_MODE,
    filtro: [...PVP_MAPS],
  };
  try {
    const saved = JSON.parse(localStorage.getItem(BOTS_KEY) ?? '{}');
    prefs = {
      skill: SKILLS.some(([s]) => s === saved.skill) ? saved.skill : prefs.skill,
      count: COUNTS.includes(saved.count) ? saved.count : prefs.count,
      // The remembered map is one of the open maps: a mode's own map is never anyone's default.
      map: isMapId(saved.map) && openMap(saved.map) ? saved.map : prefs.map,
      mode: MODES.some((m) => m.id === saved.mode) ? saved.mode : prefs.mode,
      game: isGameModeId(saved.game) ? saved.game : prefs.game,
      filtro: Array.isArray(saved.filtro) ? saved.filtro.filter(isMapId) : prefs.filtro,
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
  let discord = false;
  /** The character's body comes from the profile; without an account it is the default one. */
  let sex: Sex = 'm';
  const guestName = FUNNY_NAMES[(Math.random() * FUNNY_NAMES.length) | 0];
  let tab: Tab = 'play';

  const showTab = (next: Tab) => {
    tab = next;
    for (const id of ['play', 'arsenal', 'album', 'profile', 'settings', 'auth'] as const) $(`tab-${id}`).classList.toggle('hidden', id !== next);
    for (const b of home.querySelectorAll<HTMLElement>('[role="tab"]')) b.setAttribute('aria-selected', String(b.dataset.tab === next));
    if (next === 'profile') openProfile();
    if (next === 'album') void showAlbum($('tab-album'), { setStatus, onBack: () => showTab('play') });
  };

  const renderEquipped = () => {
    if (!progress) return;
    // What goes into a match: the chosen rifle, secondary and knife, and the grenade (as its upgrades make it).
    const lo = progress.loadout;
    const carried: (WeaponId | null)[] = [lo.primaria, lo.secundaria, knifeOf(lo), 'granada'];
    const icons = carried.flatMap((w) => (w ? [weaponIcon(w, lo.ativas[progOf(w)])] : [])).join(' ');
    $('char-equipped').textContent = t('equippedLine', { icons });
  };

  /** The real character: on the card's stage (created on first use) and as the header chip's portrait. */
  let stage: Stage | null = null;
  let shownLook = '';
  const showCharacter = (look: Appearance, s: Sex) => {
    const key = `${s}|${JSON.stringify(look)}`;
    if (key === shownLook) return;
    shownLook = key;
    stage ??= new Stage($<HTMLCanvasElement>('char-canvas'), { wheelZoom: false });
    stage.show(look, s);
    void renderPortrait(look, s).then((url) => {
      if (shownLook === key) $<HTMLImageElement>('acct-avatar').src = url;
    });
  };

  /** The signed-in header chip and the character card. */
  const renderAccount = () => {
    $('home-in').classList.toggle('hidden', !me);
    $('home-out').classList.toggle('hidden', !!me);
    sex = me?.sexo ?? 'm';
    if (!me) return;
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
    // The Arsenal tab edits the account's Arsenal choice; a fresh grid drops the old listeners.
    progress = profile ? new Progress(profile) : null;
    const grid = $('home-arsenal');
    const fresh = grid.cloneNode(false) as HTMLElement;
    grid.replaceWith(fresh);
    if (progress) {
      new Arsenal(progress, () => {}, fresh);
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
        showTab('play');
      } else showLandingAuth('register');
    },
    onCancel: () => {
      setStatus('');
      if (me) showTab('play');
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
      onBack: () => showTab('play'),
    });
  };

  for (const b of home.querySelectorAll<HTMLElement>('[role="tab"]')) b.onclick = () => showTab(b.dataset.tab as Tab);
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
      onClose: () => void loadAccount().then(() => showTab('play')),
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
  let landMap: MapId = prefs.map;
  const showLandMap = (id: MapId) => {
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
      settingsHome.parent.insertBefore(settingsPanel, settingsHome.next);
      stage?.dispose();
      home.classList.add('hidden');
      resolve(choice);
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
      // New sessions only on the maps the mode is played on.
      const pickedMap = mapFor(prefs.game, isMapId(newMapSel.value) ? newMapSel.value : prefs.map);
      newMapSel.innerHTML = modeMaps(prefs.game).map((id) => `<option value="${id}">${MAPS[id].nome}</option>`).join('');
      newMapSel.value = pickedMap;
      // A one-map mode (zumbi) only shows its map.
      const single = !range && oneMap(prefs.game);
      $('home-map-title').textContent = t(online && !single ? 'mapFilterTitle' : 'mapLabel');
      $('home-map-hint').textContent = single ? t('zMapOnly') : online ? t('mapFilterHint') : range ? t('mapHintRange') : t('mapHintBots');
      $('home-maps').innerHTML = (range ? PVP_MAPS : modeMaps(prefs.game)).map((id) => {
        const look = MAP_LOOK[id];
        const on = single || (online ? prefs.filtro.includes(id) : !range && prefs.map === id);
        const n = sessions.filter((s) => s.map === id && s.mode === prefs.game).length;
        const sub = online && listed ? (n === 1 ? t('sessionsOne') : t('sessionsMany', { n })) : t(look.when);
        return `<button type="button" class="map-btn${online ? ' filter' : ''}" data-map="${id}" aria-pressed="${on}">
          <span class="map-thumb" style="--tint:${look.tint}">${look.emoji}</span>
          <span class="map-text"><b>${MAPS[id].nome}</b><small>${esc(sub)}</small></span><span class="map-mark"></span></button>`;
      }).join('');
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
      renderLobby();
      renderGuest();
    };

    /** The list is there as soon as the tab opens (GET /api/sessoes); long lists come a page at a time. */
    const renderLobby = () => {
      // The chosen match type and the ticked maps.
      const shown = sessions.filter((s) => (oneMap(prefs.game) || prefs.filtro.includes(s.map)) && s.mode === prefs.game);
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
        // Fixed sessions are named after their map: no need to say it twice.
        li.querySelector('.s-name small')!.textContent = s.name === MAPS[s.map]?.nome ? '' : (MAPS[s.map]?.nome ?? '');
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
        listed = true;
        c.on('sessions', (m) => {
          sessions = m.list;
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
    const join = async (msg: { t: 'join'; session: string } | { t: 'create'; name: string; map: MapId; mode: GameModeId }) => {
      if (busy) return;
      busy = true;
      try {
        if (!(await connect())) return;
        const c = conn!;
        setStatus(t('joining'));
        const joinedP = c.next('joined');
        // The Arsenal is chosen here, before the match: the server takes it now (it's locked once inside).
        if (progress) c.send({ t: 'loadout', lo: progress.choice });
        c.send(msg);
        const joined = await joinedP;
        // The game releases these once its handlers exist (after the map is built).
        c.hold();
        const acct = await account();
        const map = isMapId(joined.session.map) ? joined.session.map : DEFAULT_MAP;
        leave({ mode: 'online', name: playerName(), sex, account: acct, map, conn: c, joined });
      } catch (err) {
        setStatus(err instanceof Error ? err.message : String(err), true);
      } finally {
        busy = false;
      }
    };

    const startOffline = async (wanted: MapId) => {
      if (busy) return;
      busy = true;
      // The training range is never on a map made for one mode.
      const map = openMap(wanted) ? wanted : DEFAULT_MAP;
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
      if (!b || !isMapId(b.dataset.map)) return;
      const id = b.dataset.map;
      if (prefs.mode === 'treino') return void startOffline(id);
      if (oneMap(prefs.game)) return;
      if (prefs.mode === 'online') {
        prefs.filtro = prefs.filtro.includes(id) ? prefs.filtro.filter((m) => m !== id) : [...prefs.filtro, id];
        pageSize = PAGE;
      } else prefs.map = id;
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
    segClick('land-map-pick', (v) => isMapId(v) && openMap(v) && (prefs.map = v));
    $('home-bots').onclick = () => void startBots();
    $('home-more').onclick = () => {
      pageSize += PAGE;
      renderLobby();
    };
    // Quick join: the fullest session (not full) of the filtered maps.
    $('home-quick').onclick = async () => {
      if (busy) return;
      if (!prefs.filtro.length && !oneMap(prefs.game)) return setStatus(t('pickAMap'), true);
      if (!(await connect())) return;
      const best = sessions.filter((s) => (oneMap(prefs.game) || prefs.filtro.includes(s.map)) && s.mode === prefs.game && s.players < s.max).sort((a, b) => b.players - a.players)[0];
      if (!best) return setStatus(t('noSessionsFiltered'), true);
      void join({ t: 'join', session: best.id });
    };
    const create = () =>
      join({ t: 'create', name: createInput.value, map: isMapId(newMapSel.value) ? newMapSel.value : DEFAULT_MAP, mode: isGameModeId(newModeSel.value) ? newModeSel.value : prefs.game });
    $('session-create-btn').onclick = () => void create();
    createInput.onkeydown = (e) => {
      if (e.key === 'Enter') void create();
    };

    // --- Landing: a game against bots without an account ------------------------------------------------
    const renderGuest = () => {
      $('land-guest').innerHTML = t('startGuest', { name: `<b>${esc(guestName)}</b>` });
      const game = BOT_GAMES.includes(prefs.game) ? prefs.game : DEFAULT_GAME_MODE;
      const solo = game === 'zumbi';
      $('land-map-pick').innerHTML = segButtons(modeMaps(game).map((id) => ({ label: MAPS[id].nome, on: mapFor(game, prefs.map) === id, data: id })));
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
        listed = true;
        renderPlay();
      } catch {
        /* server down: the maps keep their weather line */
      }
    };
    const poll = window.setInterval(() => void refreshList(), 10_000);
    void refreshList();
    renderPlay();
  });
}
