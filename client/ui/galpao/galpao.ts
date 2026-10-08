// The signed-in home as a 3D warehouse (design "Galpão Home"): a cinematic camera over seven stations, each a prop
// that holds one of the home's tabs. The overview shows a menu (quick join and the stations); a station shows its
// tab pinned onto the prop (the scene maps the DOM onto it), with a bar to go back or to the next station.
// It only presents: the tabs, their data and everything they do are still the home's (client/ui/home.ts), which
// asks this module to fly when a tab opens and is asked to open a tab when a station is picked. Without WebGL (or
// on a CPU renderer) start() gives up and the classic tabbed home stays.
// The scene is client/ui/galpao/scene.ts; the Arsenal's pegboard tags and card are client/ui/galpao/arsenalBoard.ts;
// the player's character leaning on the hero table is client/ui/galpao/heroCharacter.ts; the pets (07 · PETS by the
// front door, the overview's pet, its run at the launch) are petStage.ts with the tags and card of petBoard.ts.
import { STICKERS } from '@shared/achievements';
import { PETS, type PetChoice, type PetId } from '@shared/pets';
import type { Appearance } from '@shared/appearance';
import type { Sex } from '@shared/protocol';
import { IS_MOBILE } from '../../core/device';
import type { Progress } from '../../gameplay/progress';
import { t, type StringKey } from '../strings';
import { ArsenalBoard, BOARD, cardWeapon } from './arsenalBoard';
import { hop, keyAction, lightScene, STATION_ORDER, stationOf, stationOrder, tabOf, type CamStation, type HomeTab, type StationId } from './galpaoRules';
import { heroCharacter } from './heroCharacter';
import { createGalpao, type Galpao, type GalpaoLabels } from './scene';
import { PetBoard } from './petBoard';
import { PetStage } from './petStage';

const str = (key: string, params?: Record<string, string | number>) => t(key as StringKey, params);
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

/** Which of the home's panes each station's surface holds (the profile's locker also holds the name and character forms). */
const PANES: Record<Exclude<StationId, 'arsenal' | 'pets'>, string[]> = {
  play: ['tab-play'],
  maps: ['tab-maps'],
  album: ['tab-album'],
  profile: ['tab-profile', 'tab-auth'],
  settings: ['tab-settings'],
  admin: ['tab-management'],
};
/** The fonts the scene paints its signs with (canvas textures don't wait for web fonts by themselves). */
const FONTS = ['800 60px "Barlow Condensed"', '700 60px "Barlow Condensed"', '600 20px "JetBrains Mono"', '600 16px "Barlow"'];
/** The launch overlay stays up at most this long if the scene stops drawing (a hidden tab has no frames). */
const LAUNCH_MAX_MS = 4000;

export interface GalpaoHooks {
  /** A station was picked: the home opens its tab (loading the profile, the maps…) while the camera flies. */
  showTab(tab: HomeTab): void;
  /** ENTRADA RÁPIDA (and Enter on the overview): the Play tab's quick join. */
  quickPlay(): void;
  /** The line under ENTRADA RÁPIDA: match type and the maps it would pick from. */
  quickLine(): string;
}

export interface GalpaoStart {
  staff: boolean;
  playerTag: string;
  progress: Progress | null;
  /** The account's character, for the hero table. */
  look: Appearance;
  sex: Sex;
  hooks: GalpaoHooks;
  /** The account's pet choice and how to save it (the home keeps it: client/ui/home.ts). */
  pets: { choice(): PetChoice; save(next: PetChoice): void };
}

const labels = (): GalpaoLabels => ({
  stations: {
    play: t('gpSign_play'),
    maps: t('gpSign_maps'),
    arsenal: t('gpSign_arsenal'),
    profile: t('gpSign_profile'),
    settings: t('gpSign_settings'),
    pets: t('gpSign_pets'),
    admin: t('gpSign_admin'),
  },
  doghouse: PETS.amora.nome['pt-BR'],
  sections: { primaria: t('gpBoard_primaria'), secundaria: t('gpBoard_secundaria'), faca: t('gpBoard_faca'), granada: t('gpBoard_granada') },
  adminTitle: t('gpAdminScreen'),
  adminSub: t('gpAdminScreenSub'),
  danger: t('gpDanger'),
  highVoltage: t('gpHighVoltage'),
  yard: t('gpYard'),
  album: [t('gpAlbumCover1'), t('gpAlbumCover2'), t('gpAlbumCover3'), t('gpAlbumCover4', { n: STICKERS.length })],
});

export class GalpaoHome {
  private scene: Galpao | null = null;
  private readonly root = $('galpao');
  private readonly board: ArsenalBoard;
  private readonly petBoard: PetBoard;
  private petStage: PetStage | null = null;
  private at: CamStation = 'intro';
  private arrived = false;
  private hover: StationId | null = null;
  private launching = false;
  private staff: boolean;
  private disposed = false;
  /** Where every borrowed element came from (given back by dispose: the classic home needs them). */
  private readonly moved: { el: HTMLElement; parent: HTMLElement; next: Node | null }[] = [];
  private readonly reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  private readonly touch = IS_MOBILE;
  private onKey = (e: KeyboardEvent) => this.key(e);
  private onResize = () => this.root.classList.toggle('compact', innerHeight < 560 || innerWidth < 700);

  private constructor(private o: GalpaoStart) {
    this.staff = o.staff;
    this.board = new ArsenalBoard($('gp-tags'), $('gp-card'), (id) => this.pickWeapon(id));
    this.petBoard = new PetBoard($('gp-pettags'), $('gp-petcard'), o.pets, (id) => this.callPet(id));
  }

  /** Builds the warehouse and takes over the signed-in home; null (and the classic home stays) if it could not. */
  static async start(o: GalpaoStart): Promise<GalpaoHome | null> {
    const g = new GalpaoHome(o);
    try {
      await g.boot();
      return g.disposed ? null : g;
    } catch (err) {
      console.warn('Galpão: a tela inicial 3D não abriu; fica a de abas.', err);
      g.dispose();
      return null;
    }
  }

  private async boot() {
    const root = this.root;
    root.hidden = false;
    // The splash is the game's name alone, until the warehouse is built and the camera flies in.
    root.classList.add('loading');
    this.onResize();
    this.buildMenu();
    $('gp-quick').onclick = () => this.o.hooks.quickPlay();
    $('gp-back').onclick = () => this.go('home');
    $('gp-prev').onclick = () => this.step(-1);
    $('gp-next').onclick = () => this.step(1);
    this.refreshQuick();
    // The account chip moves into the warehouse's top bar (it opens the profile, as on the classic home).
    this.borrow($('acct-chip'), $('gp-top'));
    try {
      await Promise.race([Promise.all(FONTS.map((f) => document.fonts.load(f))), new Promise((r) => setTimeout(r, 2500))]);
    } catch {
      /* fonts are optional: the signs fall back to Arial Narrow */
    }
    if (this.disposed) return;
    const scene = await createGalpao({
      canvas: $<HTMLCanvasElement>('gp-canvas'),
      mobile: lightScene(this.touch, innerWidth),
      duration: 1,
      reduceMotion: this.reduceMotion,
      playerTag: this.o.playerTag.replace('#', ' #').toUpperCase(),
      labels: labels(),
      arsenal: BOARD,
      onArrive: (id) => {
        this.at = id;
        this.arrived = true;
        this.render();
      },
      onLeave: (_prev, id) => {
        this.at = id;
        this.arrived = false;
        this.render();
      },
      onWeaponPick: (id) => this.pickWeapon(id),
      onStationPick: (id) => this.go(id),
      onHoverStation: (id) => this.setHover(id),
      onZoom: (full) => this.board.setZoom(full),
    });
    if (this.disposed) return scene.dispose();
    this.scene = scene;
    this.setLook(this.o.look, this.o.sex);
    // The pets: the overview's, the station by the front door, the launch's run.
    const stage = new PetStage({ reduceMotion: this.reduceMotion, mobile: lightScene(this.touch, innerWidth) });
    stage.setChoice(this.o.pets.choice());
    stage.bindTags(this.petBoard.tags as Map<PetId, HTMLElement>);
    scene.setPetStage(stage);
    this.petStage = stage;
    for (const [id, panes] of Object.entries(PANES) as [Exclude<StationId, 'arsenal' | 'pets'>, string[]][]) {
      const surf = root.querySelector<HTMLElement>(`.gp-surf[data-station="${id}"]`)!;
      for (const p of panes) this.borrow($(p), surf);
      scene.bindSurface(id, surf);
    }
    for (const [id, el] of this.board.tags) scene.bindTag(id, el);
    scene.bindCard($('gp-card'));
    this.board.setProgress(this.o.progress);
    // The album's pages turn in 3D (the page tabs swap the content while the sheet hides it).
    root.querySelector('.gp-surf[data-station="album"]')!.addEventListener(
      'click',
      (e) => {
        const b = (e.target as HTMLElement).closest<HTMLElement>('[data-page]');
        if (!b || b.getAttribute('aria-pressed') === 'true') return;
        const tabs = [...b.parentElement!.querySelectorAll<HTMLElement>('[data-page]')];
        const from = tabs.findIndex((x) => x.getAttribute('aria-pressed') === 'true');
        scene.flipPage(tabs.indexOf(b) >= from ? 1 : -1);
      },
      true,
    );
    addEventListener('keydown', this.onKey);
    addEventListener('resize', this.onResize);
    root.classList.remove('loading');
    if (this.reduceMotion) scene.goTo('home', true);
    else scene.intro();
  }

  /** Moves a home element into the warehouse, remembering where it was. */
  private borrow(el: HTMLElement, into: HTMLElement) {
    this.moved.push({ el, parent: el.parentElement!, next: el.nextSibling });
    into.appendChild(el);
  }

  /** The character at the hero table (again after the player changes the look); the clay mannequin if it can't be built. */
  setLook(look: Appearance, sex: Sex) {
    if (!this.scene) return;
    try {
      this.scene.setHero(heroCharacter(look, sex));
    } catch (err) {
      console.warn('Galpão: o personagem não foi montado; fica o boneco.', err);
      this.scene.setHero(null);
    }
  }

  // ---- stations

  private order() {
    return stationOrder(this.staff);
  }

  /** Flies to a station and opens its tab (or back to the overview). */
  go(id: StationId | 'home') {
    if (!this.scene || this.launching) return;
    if (id === 'admin' && !this.staff) return;
    if (id !== 'home') this.o.hooks.showTab(tabOf(id));
    this.fly(id);
  }

  /** The home opened a tab by itself (a form's Back, a link from an e-mail): the camera goes to its station. */
  follow(tab: HomeTab) {
    const id = stationOf(tab);
    if (this.scene && this.scene.station !== id && !this.launching) this.fly(id);
  }

  private fly(id: StationId | 'home') {
    const scene = this.scene!;
    this.setHover(null);
    if (id !== 'arsenal') this.pickWeapon(null);
    // At the door, the card of the pet that will be sitting on the mat: the one taken along (or the first).
    if (id === 'pets') this.petBoard.show(this.petStage?.visiting ?? this.o.pets.choice().id ?? 'amora');
    scene.goTo(id);
  }

  /** A hook's tag: that pet comes in to the mat and its card opens (it isn't taken along: "Levar este" does that). */
  private callPet(id: PetId) {
    this.petStage?.call(id);
    this.petBoard.show(id);
    this.render();
  }

  /** The account's pet choice changed (a card, the classic tab): the overview's pet, the rack and the card follow. */
  setPetChoice(c: PetChoice) {
    this.petStage?.setChoice(c);
    this.petBoard.render();
  }

  private step(d: -1 | 1) {
    const next = hop(this.order(), this.at, d);
    if (next) this.go(next);
  }

  /** Back to the overview (the forms' Back buttons). */
  goHome() {
    this.go('home');
  }

  private pickWeapon(id: string | null) {
    const same = id !== null && this.board.selected === cardWeapon(id);
    const sel = same ? null : id;
    this.board.select(sel);
    this.scene?.selectWeapon(sel === 'mina' ? 'granada' : sel);
    this.render();
  }

  private setHover(id: StationId | null) {
    if (id === 'admin' && !this.staff) id = null;
    if (id === this.hover) return;
    this.hover = id;
    this.scene?.peek(id);
    for (const b of this.root.querySelectorAll<HTMLElement>('.gp-item')) b.classList.toggle('hot', b.dataset.station === id);
  }

  setStaff(staff: boolean) {
    if (staff === this.staff) return;
    this.staff = staff;
    this.buildMenu();
    if (!staff && this.at === 'admin') this.go('home');
    this.render();
  }

  setArsenalProgress(p: Progress | null) {
    this.board.setProgress(p);
  }

  refreshQuick() {
    $('gp-quick-sub').textContent = this.o.hooks.quickLine();
  }

  // ---- keyboard

  private key(e: KeyboardEvent) {
    if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || this.launching) return;
    const el = e.target as HTMLElement | null;
    if (el && (/^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName) || el.isContentEditable)) return;
    // Enter on a focused button presses that button, not the quick join.
    if (e.key === 'Enter' && el?.closest('button, a')) return;
    const a = keyAction(e.key, this.at, this.arrived, this.order(), !!this.board.selected);
    if (!a) return;
    e.preventDefault();
    if ('closeCard' in a) this.pickWeapon(null);
    else if ('go' in a) this.go(a.go);
    else if ('hop' in a) this.step(a.hop);
    else this.o.hooks.quickPlay();
  }

  // ---- HUD

  private buildMenu() {
    $('gp-items').innerHTML = this.order()
      .map(
        (id) => `<button type="button" class="gp-item" data-station="${id}">
          <span class="gp-n">${String(STATION_ORDER.indexOf(id) + 1).padStart(2, '0')}</span>
          <span class="gp-item-text"><b>${str(`gpSt_${id}`)}</b><small>${str(`gpStSub_${id}`)}</small></span>
        </button>`,
      )
      .join('');
    for (const b of this.root.querySelectorAll<HTMLElement>('.gp-item')) {
      const id = b.dataset.station as StationId;
      b.onclick = () => this.go(id);
      const on = () => this.at === 'home' && this.setHover(id);
      const off = () => this.setHover(null);
      b.onpointerenter = on;
      b.onfocus = on;
      b.onpointerleave = off;
      b.onblur = off;
    }
  }

  private render() {
    const home = this.at === 'home';
    const inStation = !home && this.at !== 'intro';
    const r = this.root;
    r.classList.toggle('menu-on', home && this.arrived && !this.launching);
    r.classList.toggle('in-station', inStation && !this.launching);
    // The pets' card: on the right, while at the door.
    r.classList.toggle('at-pets', this.at === 'pets' && this.arrived && !this.launching);
    r.classList.toggle('arrived', this.arrived);
    $('gp-crumb').textContent = inStation ? `/ ${str(`gpSt_${this.at}`).toUpperCase()}` : '';
    const o = this.order();
    const i = o.indexOf(this.at as StationId);
    const prev = hop(o, this.at, -1);
    const next = hop(o, this.at, 1);
    $('gp-prev-label').textContent = prev ? `‹ ${str(`gpSt_${prev}`)}` : '‹';
    $('gp-next-label').textContent = next ? `${str(`gpSt_${next}`)} ›` : '›';
    $('gp-index').textContent = i >= 0 ? `${String(i + 1).padStart(2, '0')}/${String(o.length).padStart(2, '0')}` : '';
    let hint = inStation && this.arrived ? str(`gpHint_${this.at}`) : '';
    if (this.at === 'arsenal') hint = this.board.selected ? '' : t(this.touch ? 'gpHint_arsenalTouch' : 'gpHint_arsenal');
    if (this.at === 'pets' && this.arrived) hint = t(this.touch ? 'gpHint_petsTouch' : 'gpHint_pets');
    $('gp-hint').textContent = hint;
  }

  /**
   * The match is starting: the roll-up door opens, the light floods in and "ENTRANDO NA PARTIDA" comes up. `petRuns`:
   * the pet taken along comes along in this match's mode (its PvP or PvE switch): it runs out ahead through the door.
   */
  launch(title: string, sub: string, petRuns = false): Promise<void> {
    const scene = this.scene;
    if (!scene || this.disposed) return Promise.resolve();
    this.launching = true;
    this.pickWeapon(null);
    this.petStage?.launch(petRuns);
    this.render();
    $('gp-launch-title').textContent = title;
    $('gp-launch-sub').textContent = sub;
    return new Promise((done) => {
      const show = () => {
        $('gp-launch').hidden = false;
        done();
      };
      if (this.reduceMotion) return show();
      scene.launch(show);
      setTimeout(show, LAUNCH_MAX_MS);
    });
  }

  /** Gives everything back to the classic home and frees the scene. */
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    removeEventListener('keydown', this.onKey);
    removeEventListener('resize', this.onResize);
    this.scene?.dispose();
    this.scene = null;
    for (const m of this.moved.reverse()) m.parent.insertBefore(m.el, m.next);
    this.root.hidden = true;
    $('gp-launch').hidden = true;
    this.petStage = null;
    this.root.classList.remove('menu-on', 'in-station', 'arrived', 'loading', 'at-pets');
  }
}
