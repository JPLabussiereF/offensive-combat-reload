// Bootstrap: loads the world, shows the home screen, then runs either offline training (dummies, local
// rules), a match against bots or an online session (remote players; the server owns health, kills and
// score). Combat code is shared: shots, knife, grenades and humiliations work on the `Target` / `Humiliable`
// interfaces, and only the "apply the result" step differs between them. The game mode (shared/modes.ts:
// mata-mata, corrida armada) decides where the weapons come from, whether they're locked, and the rounds.
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { pickSafeSpawn } from './gameplay/spawnPicker';
import { BISCUIT, CHERRY, GROUP, groups, HEALTH, HUMILIATION, KOI, MOVE, POTION, RAT, SCORE, type PotionKind } from '@shared/constants';
import { clampExplosionDamage, computeDamage, critRegion, explosionDamage, idealTtk, LETHAL_DAMAGE, type HitRegion, type KnifePassive } from '@shared/weapons';
import { eyeHeight, type MoveInput } from '@shared/movement';
import { CLOSE, FLAG, NET, type AwardLabel, type KillKind, type Vec3 } from '@shared/protocol';
import { startLoop } from './core/loop';
import { applyKeybinds, Input } from './core/input';
import { CAN_KEEP_ESCAPE, enterFullscreen, escapeIsKept, IS_MOBILE, isFullscreen, keepEscape } from './core/device';
import { TouchControls } from './ui/touch';
import { gamepad } from './core/gamepad';
import { PadNav } from './ui/padNav';
import { AimAssist } from './gameplay/aimAssist';
import { loadSettings, saveSettings, spatialMode } from './core/settings';
import { applyAtmosphere, createRenderContext } from './render/renderer';
import { Effects } from './render/effects';
import { Viewmodel, VM_FEEL } from './render/viewmodel';
import { holdOf } from './render/weaponModels';
import { ANIM } from './character/animator';
import { TuningPanel } from './ui/tuning';
import { QualityManager } from './render/quality';
import { createPhysics, type SurfaceMaterial } from './world/physics';
import type { CritterHit, SpawnPoint } from './world/gameMap';
import { buildMapFromData, loadOfficialMap } from './world/mapLoader';
import { fetchMapVersion } from './net/maps';
import { api } from './net/api';
import { loadTextureOverrides } from './world/surfaces';
import { buildGltfMap } from './world/gltfMap';
import { MapBuilder } from './world/mapBuilder';
import { DummyManager, type Dummy, type HitResult } from './entities/dummy';
import { LocalPlayer } from './entities/localPlayer';
import { Avatar } from './entities/avatar';
import { bodyStats, defaultAppearance } from '@shared/appearance';
import { Weapon, type WeaponHooks } from './weapons/weapon';
import { Melee, findMeleeTarget, meleeTargets } from './weapons/melee';
import { GrenadeProjectiles, GrenadeThrower } from './weapons/grenades';
import { applySpread, offsetDir, traceShot } from './weapons/hitscan';
import { remoteImpact, type ImpactCast } from './weapons/remoteImpact';
import { Taunt } from './gameplay/taunt';
import { nearestHumiliable, type HitboxRegistry, type Humiliable, type Target } from './gameplay/targets';
import { RemoteWorld, type RemotePlayer } from './net/remote';
import { NavMap } from './ai/navmesh';
import { Bot, type Combatant } from './ai/bot';
import { BotManager } from './ai/bots';
import { CharacterRig, type HitPose } from './entities/rig';
import { isBehind } from './entities/hitboxes';
import { Corpse } from './gameplay/corpse';
import { Sfx } from './audio/sfx';
import { BACK_OFFSET, BodySounds, occluderWeight, pathOcclusion, type Vec, type Walker } from './audio/spatial';
import { Chat } from './ui/chat';
import { Hud, type Buff, type FeedIcon, type HitKind } from './ui/hud';
import { DamageNumbers, damageTier, ShotDamage } from './ui/damageNumbers';
import { Screens, type ModeTabMeta } from './ui/menu';
import { ladderLeader, pauseContext, previewMapName, type PauseContext } from './ui/pauseMenu';
import { closeReason, gameModeName, showHome, type HomeChoice } from './ui/home';
import { runEditor } from './editor/editor';
import { handoffChoice, takeHandoff } from './editor/launch';
import { editorPlay } from './editor/playEmbed';
import { Progress } from './gameplay/progress';
import { MAX_MINES, Mines } from './weapons/mines';
import { ArsenalPanel, upgradeName, weaponLabel, weaponName } from './ui/arsenal';
import { stickerBadge, stickerUpText, titleText } from './ui/album';
import { GUN_IDS, isKnife, KNIVES, progOf, upgradeAt, type GunId, type KnifeId, type WeaponId } from '@shared/progression';
import { DEFAULT_LOADOUT, grenadeStats, gunIn, knifeOf, knifePassive, loadoutKnife, sanitizeLoadout, slotStats, type GunSlot, type Loadout } from '@shared/arsenal';
import { MODE_RULES, type GameModeId } from '@shared/modes';
import { FINAL_STEP, killsForStep, ladderLoadout, type LadderPos } from '@shared/gunGame';
import { ladderTabSub, renderLadderTab, stepName } from './ui/ladder';
import { Scoreboard } from './ui/scoreboard';
import { DEATH_MESSAGES, getLang, pick, t, type StringKey } from './ui/strings';
import { itemOf, startItems, ZOMBIE, zombieGunData, zombieLoadout, type ZItems } from '@shared/zombies';
import { gateAreas } from '@shared/barricades';
import { tombsOf } from '@shared/tombs';
import { ZombieClient, type ZombieLink } from './zombies/client';
import { LocalZombies } from './zombies/local';
import { renderCoffinTab, tintFog, zombieAtmosphere } from './zombies/ambience';

const DEG = Math.PI / 180;
const MOUSE_DEG_PER_COUNT = 0.022;
const VM_FOV = 58;
const UP = new THREE.Vector3(0, 1, 0);
const WORLD_ONLY = groups(GROUP.BULLET, GROUP.WORLD);

const vec3 = (v: THREE.Vector3): Vec3 => [+v.x.toFixed(3), +v.y.toFixed(3), +v.z.toFixed(3)];
const KIND_ICON: Record<KillKind, FeedIcon> = { gun: null, head: 'head', groin: 'bird', knife: 'knife', grenade: 'grenade', fall: null, void: null, explosion: 'grenade', dog: 'dog', zombie: 'zombie', thorns: null };
/** Dose Dupla: seconds between the two grenades of one throw. */
const DOUBLE_THROW_GAP = 0.3;
/** How each timed potion shows on the buff panel (the debuffs in colder colors). */
const POTION_BUFFS: Record<Exclude<PotionKind, 'pato'>, { icon: string; label: StringKey; color: string }> = {
  veloz: { icon: '💨', label: 'buffVeloz', color: '#6fe3ff' },
  lerdo: { icon: '🐌', label: 'buffLerdo', color: '#b08a5e' },
  critico: { icon: '💀', label: 'buffCritico', color: '#ff5a4f' },
  bebado: { icon: '🍺', label: 'buffBebado', color: '#e0a83a' },
};
const AWARD_TEXT: Record<AwardLabel, StringKey> = { kill: 'kill', headshot: 'headshot', groin: 'groin', knife: 'knife', backstab: 'backstab', longShot: 'longShot', humiliation: 'humiliation' };

async function boot() {
  const bootT0 = performance.now();
  const boot: Record<string, number> = {};
  const mark = (name: string) => (boot[name] = Math.round(performance.now() - bootT0));
  const screens = new Screens();
  screens.setProgress(0.1);
  // Controllers drive the menus from the start (home, editor), and the match once it begins.
  new PadNav(gamepad);
  gamepad.onDeviceChange = () => screens.showControls(gamepad);

  const physics = await createPhysics();
  mark('physics');
  screens.setProgress(0.45);

  const ctx = createRenderContext(document.getElementById('game')!);
  const quality = new QualityManager(ctx);
  const sfx = new Sfx();
  const textures = loadTextureOverrides(ctx.renderer);
  screens.setProgress(1);
  const settings = loadSettings();
  applyKeybinds(settings.keybinds);
  quality.set(settings.quality);
  if (quality.software) screens.showGpuWarning(quality.gpu);
  // Bound before the home: its Settings tab shows the same controls (the touch controls only exist later).
  let relayoutTouch = () => {};
  screens.bindSettings(settings, (s) => {
    saveSettings(s);
    applyKeybinds(s.keybinds);
    sfx.setVolume(s.volume);
    sfx.setSpatialMode(spatialMode(s));
    if (s.quality !== quality.current) quality.set(s.quality);
    relayoutTouch();
  });

  // --- Home: the account, then an online session, bots or offline training -------------------------
  screens.hideLoading();
  // The map editor's Play (Revisions 01 etapa 4): this page is the game in the editor's Game tab, playing the map
  // being edited (client/editor/playEmbed.ts): no home, and its Exit goes back to editing.
  const embed = editorGame;
  // The map editor comes in through the home's choice (the Mapas tab's Editar and Novo mapa) or, between
  // reloads, its handoff (client/editor/launch.ts: opening a map's current version again after a 409).
  const handoff = embed ? null : takeHandoff();
  const picked: HomeChoice = embed ? await embed.choice() : handoff ? handoffChoice(handoff) : await showHome();
  if (picked.mode === 'editor') {
    // The editor runs on its own loop: no input, player or HUD; leaving it reloads the page.
    await runEditor({ ctx, quality, physics, mapa: picked.mapa, rascunho: picked.rascunho });
    return;
  }
  const choice = picked;
  /** The editor's map played in its Game tab: the document being edited (not saved). */
  const tested = embed ? { data: embed.data } : null;
  const online = choice.mode === 'online' ? choice : null;
  const conn = online?.conn ?? null;
  const me = online?.joined.you ?? 0;
  if (online) conn!.seed(online.joined.time);

  // --- Map: the session's (online) or the one picked on the home screen ------------------------------
  screens.showLoading();
  screens.setProgress(0.3);
  const tMap = performance.now();
  // ?mapa=/maps/arquivo.glb loads a map made in Blender over whatever was picked (map makers' preview).
  const mapUrl = new URLSearchParams(location.search).get('mapa');
  // Online: the version the session plays, downloaded from the server (cached). Offline: the official maps' data
  // ship with the client (shared/data/mapas), so training and bots work without the server.
  // A map picked in the Mapas tab for bots or the range (P43) comes at its version from the server, like online.
  const mapData = tested
    ? tested.data
    : mapUrl
      ? null
      : online
        ? await fetchMapVersion(online.joined.session.map, online.joined.session.versao)
        : choice.versao
          ? await fetchMapVersion(choice.map, choice.versao)
          : await loadOfficialMap(choice.map);
  // An offline match counts as a play of the map (the server counts the online ones itself); a Play in the editor doesn't.
  if (!online && !mapUrl && !tested) api('POST', `/api/mapas/${encodeURIComponent(choice.map)}/jogadas`).catch(() => {});
  const buildMap = mapData ? buildMapFromData(mapData, { physics, scene: ctx.scene, renderer: ctx.renderer, sfx, modo: 'jogo' }) : buildGltfMap(mapUrl!, new MapBuilder(physics, ctx.scene), ctx.renderer);
  const [map] = await Promise.all([buildMap, textures]);
  const mapBuildMs = performance.now() - tMap;
  if (map.atmosphere) applyAtmosphere(ctx, map.atmosphere);
  if (map.shadowExtent) {
    const sc = ctx.sun.shadow.camera;
    sc.left = sc.bottom = -map.shadowExtent;
    sc.right = sc.top = map.shadowExtent;
    sc.far = 150;
    sc.updateProjectionMatrix();
  }
  mark('map');
  screens.setProgress(1);
  screens.hideLoading();

  const botMode = choice.mode === 'bots' ? choice : null;
  const registry: HitboxRegistry = new Map();
  const dummies = new DummyManager(physics.world, ctx.scene, choice.mode === 'offline' ? map.dummies : [], registry);
  const net = online ? new RemoteWorld(physics.world, ctx.scene, registry, conn!, me) : null;
  const effects = new Effects(ctx.scene);
  const viewmodel = new Viewmodel(ctx.vmScene);
  // Weapon progression from the account (level 1 without one) and our land mines (a grenade upgrade).
  const progress = new Progress(choice.account);
  // --- Game mode: the session's (online), the one picked for the bots, none on the training range -------
  const gameMode: GameModeId | null = online ? online.joined.session.mode : choice.mode === 'bots' ? choice.game : null;
  const rules = gameMode ? MODE_RULES[gameMode] : null;
  /** The weapons are fixed for the match: the Arsenal is read-only and new upgrades wait for the next one. */
  const lockedLoadout = !!rules?.lockedLoadout;
  const gunGame = gameMode === 'corrida-armada';
  /** Zumbi: co-op waves; weapons from the Mystery Coffin (client/zombies). */
  const zombieMode = gameMode === 'zumbi';
  // The zombie night: thicker, greener fog (and red on boss waves, see the render frame).
  if (zombieMode && map.atmosphere) applyAtmosphere(ctx, zombieAtmosphere(map.atmosphere));
  /**
   * What we enter the match with: online the server's (it validates our hits with it), corrida armada's first
   * step against bots, the zombie mode's plain rifle alone, otherwise the account's Arsenal (level 1 without
   * an account).
   */
  const mine = online?.joined.players.find((p) => p.id === me)?.lo;
  const startLoadout: Loadout = mine ? sanitizeLoadout(mine) : gunGame ? ladderLoadout(0) : zombieMode ? zombieLoadout(startItems()) : progress.loadout;
  const mines = new Mines(physics, ctx.scene);
  const player = new LocalPlayer(physics, map.killY);
  player.netControlled = !!online;
  if (online) player.respawnDelay = NET.respawnDelay + 0.3;
  if (botMode) player.respawnDelay = 5;
  // The character from the profile (default look without an account) and what it does in the game: only
  // the PCD mode (reload without a hand/arm, speed without a leg, no hitbox on the missing limb). Height and
  // build are looks: the eye, the hitboxes and the health are the same for everyone (style guide).
  const look = choice.account?.aparencia ?? defaultAppearance(choice.sex);
  const body = bodyStats(look);
  player.maxHealth = body.maxHealth;
  player.health = body.maxHealth;
  viewmodel.setBody(look, choice.sex);
  const avatar = new Avatar(ctx.scene, look, choice.sex);
  const melee = new Melee(loadoutKnife(startLoadout));
  // The grenade as its upgrades make it (how many, what G does, the blast); applyLoadout keeps it current.
  let grenadeData = grenadeStats(startLoadout.ativas.granada);
  const thrower = new GrenadeThrower(grenadeData);
  const grenades = new GrenadeProjectiles(physics, ctx.scene, grenadeData, (s, at, duck) => sfx.at(at, 'normal', (x) => (duck ? x.quack() : x.grenadeBounce(s))));
  const taunt = new Taunt();
  const hud = new Hud();
  const damageNumbers = new DamageNumbers<HTMLDivElement>({
    root: document.getElementById('dmg-numbers')!,
    create: () => document.createElement('div'),
    size: () => ({ w: window.innerWidth, h: window.innerHeight }),
  });
  // Corrida armada orders it by the ladder, with a column for each player's weapon.
  const scoreboard = new Scoreboard(gunGame ? 'ladder' : zombieMode ? 'zombie' : 'plain');
  const input = new Input(ctx.renderer.domElement);
  sfx.setVolume(settings.volume);
  sfx.setSpatialMode(spatialMode(settings));
  // The map's walls for the sound: room echo where it's enclosed (its marked rooms, rays elsewhere), muffling
  // behind walls by how thick they are and what they are (audio/spatial.ts).
  const soundRay = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: 1, z: 0 });
  const soundCast = (o: Vec, d: Vec, max: number) => {
    soundRay.origin = o;
    soundRay.dir = d;
    return physics.world.castRay(soundRay, max, true, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, WORLD_ONLY);
  };
  const occluder = (handle: number, thickness: number | null) => {
    const info = physics.surfaces.get(handle);
    return occluderWeight(info?.material ?? 'concrete', thickness, info?.occluder);
  };
  sfx.setWorld(
    (o, d, max) => soundCast(o, d, max)?.timeOfImpact ?? null,
    (from, to) => {
      const dx = to.x - from.x;
      const dy = to.y - from.y;
      const dz = to.z - from.z;
      const len = Math.hypot(dx, dy, dz);
      if (len < 0.8) return 0;
      // From the ears to the sound and back: the same collider both ways is one obstacle (where each ray meets
      // it gives its thickness), two are two.
      const a = soundCast(from, { x: dx / len, y: dy / len, z: dz / len }, len - 0.3);
      if (!a) return 0;
      const back = { x: to.x - (dx / len) * BACK_OFFSET, y: to.y - (dy / len) * BACK_OFFSET, z: to.z - (dz / len) * BACK_OFFSET };
      const b = soundCast(back, { x: -dx / len, y: -dy / len, z: -dz / len }, len - 0.55);
      return pathOcclusion(len, { handle: a.collider.handle, toi: a.timeOfImpact }, b && { handle: b.collider.handle, toi: b.timeOfImpact }, occluder);
    },
    map.rooms,
  );
  // Other people's footsteps, landings, slides and reloads, from what their bodies are doing.
  const bodySounds = new BodySounds();
  const groundProbe = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 });
  const groundAt = (feet: Vec) => {
    groundProbe.origin = { x: feet.x, y: feet.y + 0.1, z: feet.z };
    const hit = physics.world.castRay(groundProbe, 0.5, true, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, WORLD_ONLY);
    return (hit && physics.surfaces.get(hit.collider.handle)?.material) || 'concrete';
  };
  const playBody = (id: number, w: Walker, dt: number, reloadTime: () => number, gun: () => GunId) => {
    const f = w.feet;
    for (const ev of bodySounds.update(id, w, dt)) {
      const at = { x: f.x, y: f.y + 0.4, z: f.z };
      if (ev.kind === 'step') sfx.at(at, 'step', (s) => s.footstep(groundAt(f), ev.loud * 2));
      else if (ev.kind === 'land') sfx.at(at, 'step', (s) => s.land(ev.hard));
      else if (ev.kind === 'slide') sfx.at(at, 'step', (s) => s.slide(groundAt(f)));
      else sfx.at({ x: f.x, y: f.y + 1.2, z: f.z }, 'normal', (s) => s.reload(reloadTime(), false, gun()));
    }
  };
  // Phones and tablets: touch controls over the HUD; the pause button leaves to the menu.
  const touch = IS_MOBILE ? new TouchControls(input, settings, document.getElementById('hud')!) : null;
  gamepad.attach(input, settings);
  input.padActive = gamepad.device === 'pad';
  // Start on a controller resumes from the pause menu.
  gamepad.onStart = () => {
    if (!document.getElementById('menu')!.classList.contains('hidden')) document.getElementById('play-btn')!.click();
  };
  if (touch) touch.onPause = () => input.unlock();
  // Session chat: online only (Enter/T on a computer, the chat button on a phone).
  const chat = new Chat(input);
  chat.enable(!!conn);
  chat.onSend = (text) => conn?.send({ t: 'chat', text });
  if (touch) {
    touch.onChat = () => chat.toggle();
    touch.setChat(!!conn);
  }
  // Phones: leaving the browser (home button, a call) pauses like Esc does on a computer.
  if (IS_MOBILE) document.addEventListener('visibilitychange', () => document.hidden && input.unlock());
  // The context prompt (humiliate a body) is tapped on phones.
  if (IS_MOBILE) {
    const prompt = document.getElementById('prompt')!;
    prompt.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      input.press('taunt', true);
    });
    for (const ev of ['pointerup', 'pointercancel', 'pointerleave'] as const) prompt.addEventListener(ev, () => input.press('taunt', false));
  }

  // Bots mode: a navmesh from the map's colliders, and hitboxes on the local player so bots can hit us.
  let bots: BotManager | null = null;
  // Bots route around Amora's bite zone (a little wider than the zone itself). The solo zumbi game builds the
  // mesh the server bakes: the wall's gaps as polygons of their own, for its barricades (shared/barricades.ts).
  // (a glTF preview, ?mapa=, has no data: the cemetery's layout stands in)
  // The haunted graves: the map's own tombstones go along with its zombie data (as the server does).
  const zombieNavMap = zombieMode ? (mapData?.zumbi ? { ...mapData.zumbi, lapides: tombsOf(mapData.pecas) } : ZOMBIE.mapas.cemiterio) : undefined;
  const nav = botMode ? await NavMap.build(physics, map.dog ? [map.dog.zone.clone().expandByScalar(0.3)] : [], zombieNavMap ? gateAreas(zombieNavMap) : []) : null;
  const playerPos = new THREE.Vector3();
  const playerTarget: Combatant & { yaw: number } = {
    id: me,
    sex: choice.sex,
    look,
    get name() {
      return choice.name;
    },
    get position() {
      return playerFeet(playerPos);
    },
    get dead() {
      return player.dead;
    },
    get health() {
      return player.health;
    },
    get yaw() {
      return player.yaw;
    },
    eye: (out) => player.eye(1, out),
    refineRegion: (pt, r) => playerRig?.refineRegion(pt, r) ?? r,
    isBehind: (pt) => isBehind(pt, playerFeet(playerPos), player.yaw),
  };
  const playerRig = botMode && !zombieMode ? new CharacterRig(physics.world, playerTarget, registry, body.missing) : null;
  if (playerRig) player.mb.ignoreBody = playerRig.body;

  // --- Zumbi: the match's zombies, the Mystery Coffin and revives. Online the server runs the match; solo it
  // runs here (client/zombies/local.ts) on the same navmesh the bots use. Either way, the same messages.
  let zombies: ZombieClient | null = null;
  let localZombies: LocalZombies | null = null;
  if (zombieMode) {
    const zmap = zombieNavMap!;
    let link: ZombieLink | null = null;
    if (conn) {
      link = { online: true, send: (m) => conn.send(m), on: (type, fn) => conn.on(type, fn), now: () => conn.serverNow(), renderTime: () => conn.serverNow() - NET.interpDelayMs };
    } else if (nav) {
      localZombies = new LocalZombies(nav.navMesh, zmap, {
        me,
        name: choice.name,
        hurt: (amount, _from, kind) => {
          const dealt = player.damage(amount, simTime, kind ?? 'zombie');
          if (dealt > 0) {
            hud.damageFlash(dealt);
            sfx.hurt();
          }
        },
        setLoadout: (lo) => takeLadderWeapons(lo),
        newMatch: () => startRound(),
      });
      link = localZombies;
    }
    if (link) {
      zombies = new ZombieClient(
        link,
        {
          me,
          hud,
          sfx,
          effects,
          physics,
          scene: ctx.scene,
          registry,
          world: physics.world,
          feet: () => playerFeet(new THREE.Vector3()),
          alive: () => !player.dead,
          yaw: () => player.yaw,
          nameOf: (id) => nameOf(id),
          keyName: (a) => {
            if (gamepad.device === 'pad' || IS_MOBILE) return null;
            const k = screens.keyName(a);
            return k === '—' ? null : k;
          },
          teammates: () => [...(net?.players.values() ?? [])].map((p) => ({ id: p.id, position: p.position, alive: p.alive })),
          refill: () => {
            for (const g of Object.values(guns)) g.refill();
            thrower.refill();
          },
          respawn: () => comeBack(),
          push: (v) => player.launch(v[0], v[1], v[2]),
          shake: (k) => (shake = Math.min(1, shake + k)),
          setDowned: (id, down) => {
            const rp = net?.players.get(id);
            if (rp) rp.downed = down;
          },
          killFeedback: (at, head) => {
            hud.hit('kill');
            killFx(at);
            if (head) effects.burst('star', at, UP, 12);
          },
        },
        zmap,
        online?.joined.zumbi ?? localZombies?.match.sync(),
      );
      // The horde's bodies are built now, on the loading screen, not when the first wave comes.
      zombies.view.prewarm();
      mark('zombies');
    }
  }

  /** Everything that can currently be shot / stabbed / blown up (in co-op: only the enemies). */
  const targets = (): Target[] => (zombies ? zombies.view.targets() : net ? net.targets() : [...dummies.list, ...(bots?.bots ?? [])]);
  const humiliables = (): Iterable<Humiliable> => (zombies ? [] : net ? net.corpses.values() : bots ? [...dummies.list, ...bots.corpses.values()] : dummies.list);
  const nameOf = (id: number | null) =>
    id === me ? t('you') : id === null ? '' : (net?.info.get(id)?.name ?? bots?.bots.find((b) => b.id === id)?.name ?? '?');

  // Free-for-all (online and against bots) uses the neutral spawns spread over the map.
  const allSpawns = online || botMode ? map.spawnsFFA : map.spawnsA;
  let lastSpawn: SpawnPoint | null = null;
  const pickSpawn = (): SpawnPoint => {
    if (bots) return bots.pickSpawn(playerTarget);
    if (zombies) {
      // Co-op: away from the zombies (12 m), and near a teammate who's still up, if any.
      const zs = zombies.view.targets().map((z) => z.position);
      const safe = allSpawns.filter((s) => zs.every((z) => z.distanceTo(s.position) >= 12));
      const pool = safe.length ? safe : allSpawns;
      const mates = [...(net?.players.values() ?? [])].filter((p) => p.alive && !p.downed);
      if (!mates.length) return pick(pool);
      const mate = pick(mates).position;
      return pool.reduce((a, b) => (a.position.distanceTo(mate) <= b.position.distanceTo(mate) ? a : b));
    }
    const options = allSpawns.filter((s) => s !== lastSpawn);
    if (!net) return pick(options);
    // Free-for-all: section 6 rules against every living remote player.
    const threats = [...net.players.values()].filter((p) => p.alive).map((p) => ({ feet: p.position, eye: p.position.clone().setY(p.position.y + MOVE.eyeStand) }));
    return pickSafeSpawn(options, threats, physics);
  };
  let spawnedAt = 0;
  const respawn = () => {
    // Mines only exist while their owner is alive: they go away as we come back.
    mines.clearOwner(null);
    lastSpawn = pickSpawn();
    player.spawn(lastSpawn);
    if (bots) bots.protect(playerTarget);
    spawnedAt = performance.now();
    conn?.send({ t: 'respawn', p: vec3(lastSpawn.position), yaw: lastSpawn.yaw });
  };
  if (zombies?.waitingToJoin) {
    // Zumbi, a wave already on: we come in at the break. Meanwhile we watch from a spawn spot, as the dead do.
    lastSpawn = pickSpawn();
    player.spawn(lastSpawn);
    player.kill(0);
    hud.showDeath(t('zJoinWaitTitle'));
  } else respawn();
  physics.world.step(); // builds the query pipeline before the first ray

  // Match stats (offline; online the server's numbers are shown).
  let simTime = 0;
  let shots = 0;
  let hits = 0;
  let kills = 0;
  let points = 0;
  let lastTtk: number | null = null;
  let lastHitDist = 0;
  let killerId: number | null = null;
  let myCorpseId: number | null = null;
  let deathMessage: string | null = null;

  // --- Collectibles (the courtyard's cherry: extra max health for a while) ------------------------
  // Offline and against bots the game applies it; online the server checks the pickup, applies it and
  // tells everyone ('pickup'). Times are on the game clock: seconds of simulation offline (it pauses with
  // the menu), the server's clock online.
  const pickups = map.pickups ?? [];
  const clock = () => (conn ? conn.serverNow() / 1000 : simTime);
  /** When each taken collectible grows back (game clock). */
  const pickupBack = new Map<string, number>();
  /** When our cherry wears off (game clock; 0: none). */
  let boostEnds = 0;
  /** Online: when we last asked the server for a pickup (once is enough while it answers). */
  let pickupAsked = 0;
  /** What each collectible does (cherry or biscuit), from the map's objects. */
  const pickupKind = (id: string) => mapData?.objetos.coletaveis.find((k) => k.id === id)?.tipo;
  /** A giant rat's humanity (RAT): extra max health until we die. */
  let humanity = false;
  /** Max health: the body's, the cherry's while it lasts and the humanity's. */
  const refreshMaxHealth = () => {
    player.maxHealth = body.maxHealth + (boostEnds ? CHERRY.extraHealth : 0) + (humanity ? RAT.extraHealth : 0);
    player.health = Math.min(player.health, player.maxHealth);
  };
  const startBoost = (until: number) => {
    boostEnds = until;
    refreshMaxHealth();
    sfx.cherry();
    hud.notice(t('cherryTaken', { n: CHERRY.extraHealth, s: CHERRY.duration }));
  };
  const endBoost = (announce: boolean) => {
    if (!boostEnds) return;
    boostEnds = 0;
    refreshMaxHealth();
    if (announce) {
      sfx.cherryEnd();
      hud.notice(t('cherryOver'));
    }
  };
  /** The Scooby biscuit: full health. */
  const eatBiscuit = () => {
    player.health = player.maxHealth;
    sfx.scoobySnack();
    hud.showBanner(t('biscuitTaken'), 'level');
  };
  const gainHumanity = () => {
    if (humanity) return;
    humanity = true;
    refreshMaxHealth();
    player.health = Math.min(player.maxHealth, player.health + RAT.extraHealth);
    sfx.humanity();
    hud.showBanner(t('humanityTaken', { n: RAT.extraHealth }), 'level');
  };
  const loseHumanity = () => {
    if (!humanity) return;
    humanity = false;
    refreshMaxHealth();
  };
  // --- The witch's potions (POTION): a random effect. The duck (our grenades are rubber ducks, everyone
  // sees and hears them) lasts until we die; the others change the balance and last a minute. Offline the
  // game draws it; online the server does (and applies the critical to the damage it computes).
  let duckAmmo = false;
  /** The timed potion we're feeling and when it wears off (game clock). */
  let potionKind: Exclude<PotionKind, 'pato'> | null = null;
  let potionEnds = 0;
  /** When the witch lets us drink again (game clock). */
  let potionReady = 0;
  let potionAsked = 0;
  const nearPotion = () => {
    const pot = map.potion;
    if (!pot || player.dead || clock() < potionReady) return false;
    const f = playerFeet(new THREE.Vector3());
    return Math.hypot(f.x - pot.at.x, f.z - pot.at.z) < pot.radius && Math.abs(f.y - pot.at.y) < 1.5;
  };
  /** Spread and recoil (both guns): the golden carp sharpens them, the drunk potion ruins them. */
  const refreshWeaponMods = () => {
    const drunk = potionKind === 'bebado';
    for (const g of Object.values(guns)) {
      g.spreadMul = (aimEnds ? KOI.spreadMul : 1) * (drunk ? POTION.drunkSpread : 1);
      g.recoilMul = (aimEnds ? KOI.recoilMul : 1) * (drunk ? POTION.drunkRecoil : 1);
    }
  };
  const potionSpeed = () => (potionKind === 'veloz' ? POTION.fastSpeed : potionKind === 'lerdo' ? POTION.slowSpeed : 1);
  const endPotion = (announce: boolean) => {
    if (!potionKind) return;
    potionKind = null;
    potionEnds = 0;
    refreshWeaponMods();
    if (announce) hud.notice(t('potionOver'));
  };
  const applyPotion = (kind: PotionKind, until: number) => {
    potionReady = clock() + POTION.cooldown;
    map.potion?.drink(kind);
    sfx.potionGulp();
    if (kind === 'pato') duckAmmo = true;
    else {
      potionKind = kind;
      potionEnds = until;
      refreshWeaponMods();
    }
    hud.showBanner(t(`potion_${kind}`, { s: POTION.duration }), 'level');
  };
  const drinkPotion = () => {
    if (conn) {
      if (performance.now() - potionAsked < 800) return;
      potionAsked = performance.now();
      conn.send({ t: 'potion' });
      return;
    }
    const kind = POTION.kinds[Math.floor(Math.random() * POTION.kinds.length)];
    applyPotion(kind, clock() + POTION.duration);
  };
  // --- The koi (KOI): shot or stabbed for account XP (online: the server decides and awards it); a golden
  // carp also sharpens our aim (spread and recoil) for a while or until we die.
  /** When our golden carp's aim wears off (game clock; 0: none). */
  let aimEnds = 0;
  /** Where the sharp aim came from: the golden carp (Chinese garden) or a shooting gallery (Halloween). */
  let aimWhy: 'goldenKoi' | 'galleryAim' = 'goldenKoi';
  /** Online: when we last reported each fish (once is enough while the server answers). */
  const fishAsked = new Map<string, number>();
  /** Sharper aim until `until` (the golden carp's, or a shooting gallery's: `why` is the banner). */
  const startAim = (until: number, why: 'goldenKoi' | 'galleryAim' = 'goldenKoi') => {
    aimEnds = until;
    aimWhy = why;
    refreshWeaponMods();
    sfx.levelUp();
    hud.showBanner(t(why, { s: KOI.goldenDuration }), 'level');
  };
  // --- Giant rats (RAT): our hits bring one down; its humanity is ours (online, once the server agrees).
  /** Online: when we last claimed each rat (once is enough while the server answers). */
  const ratAsked = new Map<string, number>();
  // Gags that care who set them off (the ghost faces the shooter) ask where we shoot from.
  map.props.shooter = () => player.eye(1, new THREE.Vector3());
  if (map.rewards) {
    map.rewards.ratDown = (id) => {
      if (conn) {
        if (performance.now() - (ratAsked.get(id) ?? -1e9) < 800) return;
        ratAsked.set(id, performance.now());
        conn.send({ t: 'rat', id });
        return;
      }
      map.rats?.kill(id, clock() + RAT.respawn);
      gainHumanity();
    };
    // Shooting galleries: whoever knocks down the last target gets the golden carp's sharp aim.
    map.rewards.aimBonus = () => startAim(clock() + KOI.goldenDuration, 'galleryAim');
  }
  /** What we're under, for the HUD's buff panel (timed ones first). */
  const buffs = (): Buff[] => {
    const now = clock();
    const list: Buff[] = [];
    if (player.dead) return list;
    if (aimEnds) {
      const koi = aimWhy === 'goldenKoi';
      list.push({ id: 'aim', icon: koi ? '🐟' : '🎯', label: t(koi ? 'buffKoi' : 'buffGallery'), color: '#ffd36b', left: Math.max(0, aimEnds - now), total: KOI.goldenDuration });
    }
    if (boostEnds) list.push({ id: 'cherry', icon: '🍒', label: t('buffCherry'), color: '#ff6fa0', left: Math.max(0, boostEnds - now), total: CHERRY.duration });
    if (potionKind) list.push({ id: 'potion', ...POTION_BUFFS[potionKind], label: t(POTION_BUFFS[potionKind].label), left: Math.max(0, potionEnds - now), total: POTION.duration });
    if (humanity) list.push({ id: 'humanity', icon: '💜', label: `${t('buffHumanity')} +${RAT.extraHealth}`, color: '#c9a2ff' });
    // The bride's scream: slower for a few seconds.
    const chill = zombies?.slowLeft() ?? 0;
    if (chill > 0) list.push({ id: 'chill', icon: '😱', label: t('buffChilled'), color: '#b06bff', left: chill, total: ZOMBIE.chefes.noiva.grito?.duracao ?? 3 });
    // The thorns on the wall's bars and the hedge: losing health every second for a while.
    const bleed = zombies?.bleedLeft() ?? 0;
    if (bleed > 0) list.push({ id: 'bleed', icon: '🩸', label: t('buffBleeding'), color: '#e0453a', left: bleed, total: ZOMBIE.espinhos.sangraSegundos });
    // The chapel's totem: no break between waves, more money and XP, until the match ends.
    if (zombies?.totemOn) list.push({ id: 'vigil', icon: '🕯️', label: t('buffVigil'), color: '#ff7a1a', until: t('buffUntilMatchEnd') });
    if (duckAmmo) list.push({ id: 'duck', icon: '🦆', label: t('buffDuck'), color: '#ffe066' });
    return list;
  };
  const endAim = (announce: boolean) => {
    if (!aimEnds) return;
    aimEnds = 0;
    refreshWeaponMods();
    if (announce) hud.notice(t(aimWhy === 'galleryAim' ? 'galleryAimOver' : 'goldenKoiOver'));
  };
  /** What a shot or a knife did to the map's critters: fruit falls by itself, a fish is killed. */
  const hitCritter = (c: CritterHit) => {
    const fish = c.fish;
    if (!fish || !map.fish) return;
    sfx.at(c.point, 'normal', (s) => s.splash());
    hud.hit('hit');
    if (conn) {
      if (performance.now() - (fishAsked.get(fish.id) ?? -1e9) < 800) return;
      fishAsked.set(fish.id, performance.now());
      conn.send({ t: 'fish', id: fish.id });
      return;
    }
    // Offline and against bots the game decides (no account XP without the server).
    const now = clock();
    const [min, max] = KOI.respawn;
    map.fish.kill(fish.id, now + min + Math.random() * (max - min), Math.random() < KOI.goldenChance);
    if (fish.golden) startAim(now + KOI.goldenDuration);
  };

  const updatePickups = () => {
    const now = clock();
    if (player.dead) endAim(false);
    else if (aimEnds && now >= aimEnds) endAim(true);
    for (const [id, at] of pickupBack) {
      if (now < at) continue;
      pickupBack.delete(id);
      pickups.find((p) => p.id === id)?.restore();
    }
    if (player.dead) endBoost(false);
    else if (boostEnds && now >= boostEnds) endBoost(true);
    if (player.dead) loseHumanity();
    if (player.dead) {
      duckAmmo = false;
      potionReady = 0;
      endPotion(false);
      return;
    }
    if (potionKind && now >= potionEnds) endPotion(true);
    const f = playerFeet(feet);
    for (const pk of pickups) {
      const kind = pickupKind(pk.id);
      const radius = kind === 'biscoito' ? BISCUIT.radius : CHERRY.radius;
      if (!pk.available || Math.hypot(f.x - pk.position.x, f.z - pk.position.z) > radius || Math.abs(f.y - pk.position.y) > 1.5) continue;
      if (conn) {
        if (performance.now() - pickupAsked > 800) {
          pickupAsked = performance.now();
          conn.send({ t: 'pickup', id: pk.id });
        }
      } else if (kind === 'biscoito') {
        pk.take();
        pickupBack.set(pk.id, now + BISCUIT.respawn);
        eatBiscuit();
      } else {
        pk.take();
        pickupBack.set(pk.id, now + CHERRY.respawn);
        startBoost(now + CHERRY.duration);
        player.health = Math.min(player.maxHealth, player.health + CHERRY.extraHealth);
      }
    }
  };

  const aimForward = new THREE.Vector3();
  const shotDir = new THREE.Vector3();
  const eye = new THREE.Vector3();
  const muzzle = new THREE.Vector3();
  const tmp = new THREE.Vector3();
  const feet = new THREE.Vector3();

  const computeAim = (out: THREE.Vector3) => {
    // Recoil offset is part of the aim; positive recoil yaw kicks to the right.
    const p = player.pitch + weapon.recoilPitch * DEG;
    const y = player.yaw - weapon.recoilYaw * DEG;
    return out.set(-Math.sin(y) * Math.cos(p), Math.sin(p), -Math.cos(y) * Math.cos(p));
  };

  const award = (label: string, value: number) => {
    points += value;
    hud.popup(label, value);
  };

  const killFx = (at: THREE.Vector3) => {
    sfx.killDing();
    sfx.boing();
    effects.burst('confetti', tmp.copy(at).setY(at.y + 1.2), UP, 40);
  };

  /** Offline kill bookkeeping for every way of killing a dummy. */
  const onKill = (dummy: Dummy, res: HitResult, weaponName: string, icon: FeedIcon) => {
    kills++;
    lastTtk = res.ttk;
    killFx(dummy.position);
    award(t('kill'), SCORE.kill);
    hud.killfeed(t('you'), weaponName, dummy.name, icon);
  };

  const groinFx = (at: THREE.Vector3) => {
    hud.showBanner(t('groinBanner'), 'bird');
    sfx.bird();
    effects.burst('confetti', at, UP, 25, 0xffd23f);
  };

  // The gun hooks, shared by both slots: they act on the gun in hand (`weapon`).
  const gunHooks: WeaponHooks = {
    shoot(spread, shotIndex, pellets) {
      shots++;
      bots?.unprotect(playerTarget);
      player.eye(1, eye);
      computeAim(aimForward);
      applySpread(aimForward, spread, shotDir);
      // One ray per bullet: a scattergun's pellets each go their own way around the shot, each one a hit of its own.
      const dirs = pellets ? pellets.map((p) => offsetDir(shotDir, p.theta, p.phi, new THREE.Vector3())) : [shotDir];

      // Muzzle position in world space (viewmodel is camera-relative).
      viewmodel.muzzleCameraSpace(muzzle).applyMatrix4(ctx.camera.matrixWorld);
      viewmodel.flash();
      viewmodel.kick(weapon.data.coiceVisual ?? 1);
      gamepad.rumble(45, 0.1, 0.35);
      effects.flash(muzzle);
      // Clear even at low health: only the rest of the sound is muffled then.
      sfx.unmuffled((s) => s.gunshot(1, weapon.data.silenciador ? 'silenciado' : weapon.data.arma));

      // The shot's feedback, once however many pellets landed: the best of them (a kill, then a head, then a hit).
      let landed = false;
      let headMark = false;
      let mark: HitKind | null = null;
      let markedElsewhere = false;
      let heardImpact = false;
      const land = (dist: number, head: boolean, kind: HitKind | null) => {
        landed = true;
        lastHitDist = dist;
        headMark ||= head;
        if (kind === null) markedElsewhere = true;
        else if (!mark || kind === 'kill' || (kind === 'head' && mark === 'hit')) mark = kind;
      };
      // The floating damage numbers (only we see them): one per target, whatever its pellets did.
      const dealt = new ShotDamage<object>();
      // Eight pellets on a wall make one impact sound, not eight.
      const impact = (at: THREE.Vector3, material: SurfaceMaterial) => {
        if (heardImpact) return;
        heardImpact = true;
        sfx.at(at, 'normal', (s) => s.impact(material));
      };

      dirs.forEach((dir, i) => {
        const { hit, through, keep, end } = traceShot(physics, registry, eye, dir, weapon.data.alcanceMaximo, playerRig?.body, weapon.data.penetracao);
        if (shotIndex % weapon.data.tracanteACada === 0) effects.tracer(muzzle, end);
        // The others see and hear one shot, whatever its pellets did.
        if (i === 0) conn?.send({ t: 'shot', o: vec3(muzzle), e: vec3(end) });
        // Fish and fruit don't stop the bullet: whatever it hits further on is hit too.
        const critter = map.critters?.shot(eye, dir, hit ? hit.distance : Math.min(120, weapon.data.alcanceMaximo));
        if (critter) {
          effects.burst('confetti', critter.point, tmp.copy(dir).negate(), 4, critter.fish ? 0xbfeaff : 0xc8102e);
          hitCritter(critter);
        }

        // Through wood and glass: entry and exit holes, splinters out the far side.
        for (const p of through) {
          effects.decal(p.point, p.normal);
          effects.decal(p.exit, p.exitNormal);
          effects.burst('debris', p.point, p.normal, 3, 0x9a6a3a);
          effects.burst('debris', p.exit, dir, 5, 0x9a6a3a);
          impact(p.point, p.surface.material);
          p.surface.onShot?.(p.point);
        }
        if (!hit) return;
        if (hit.target) {
          const entity = hit.target.entity;
          const region: HitRegion = entity.refineRegion(hit.point, hit.target.region);
          const groin = region === 'virilha';
          const head = region === 'cabeca';
          const crit = potionKind === 'critico';
          const tier = damageTier(region, crit);
          tmp.copy(dir).negate();
          if (zombies?.isZombie(entity)) {
            // A zombie: reported to the match (the server online), which decides the damage and the kill.
            if (entity.dead) return;
            dealt.add(entity, hit.point, zombies.shot(entity, region, hit.distance, weapon.data, keep, crit), tier, zombies.healthOf(entity));
            effects.burst(head || groin ? 'star' : 'debris', hit.point, tmp, head || groin ? 10 : 7, 0x6f8a3a);
            land(hit.distance, head || groin, head ? 'head' : 'hit');
            return;
          }
          if (net) {
            // Online: report the hit, show feedback now; the server confirms damage and kills.
            if (entity.dead) return;
            const remote = entity as RemotePlayer;
            conn!.send({ t: 'hit', target: remote.id, region, dist: +hit.distance.toFixed(2), w: weapon.data.arma, ...(keep < 1 ? { keep: +keep.toFixed(3) } : {}) });
            // The server's sum (same formula), up to the health its last snapshot gave them.
            dealt.add(entity, hit.point, computeDamage(weapon.data, hit.distance, critRegion(region, crit), keep), tier, remote.health);
            effects.burst(head || groin ? 'star' : 'confetti', hit.point, tmp, head || groin ? 10 : 6);
            land(hit.distance, head || groin, head ? 'head' : 'hit');
            return;
          }
          if (entity instanceof Bot && bots) {
            // Against bots: same rules as online; kills and popups come back through the bot hooks.
            if (entity.dead) return;
            const kind: KillKind = head ? 'head' : groin ? 'groin' : 'gun';
            const res = bots.hit(entity, playerTarget, computeDamage(weapon.data, hit.distance, critRegion(region, crit), keep), { kind, region, dist: hit.distance, w: weapon.data.arma });
            if (res.dealt <= 0) return;
            dealt.add(entity, hit.point, res.dealt, tier);
            effects.burst(head || groin ? 'star' : 'confetti', hit.point, tmp, head || groin ? 10 : 6);
            land(hit.distance, head || groin, res.killed ? null : head ? 'head' : 'hit');
            return;
          }
          const dummy = entity as Dummy;
          const res = dummy.applyHit(computeDamage(weapon.data, hit.distance, critRegion(region, crit), keep), region, simTime, dir, groin ? 'forward' : 'back');
          if (res.damage <= 0) return;
          dealt.add(entity, hit.point, res.damage, tier);
          effects.burst(res.headshot || groin ? 'star' : 'confetti', hit.point, tmp, res.headshot || groin ? 10 : 6);
          land(hit.distance, res.headshot || groin, res.killed ? 'kill' : res.headshot ? 'head' : 'hit');
          if (res.killed) {
            onKill(dummy, res, weaponName(weapon.data.arma), groin ? 'bird' : res.headshot ? 'head' : null);
            if (res.headshot) award(t('headshot'), SCORE.headshot);
            if (groin) {
              award(t('groin'), SCORE.groin);
              groinFx(hit.point);
            }
            if (hit.distance > SCORE.longShotDistance) award(t('longShot'), SCORE.longShot);
          }
        } else {
          effects.decal(hit.point, hit.normal);
          effects.burst('debris', hit.point, hit.normal, 5, 0x9a8f80);
          effects.burst('spark', hit.point, hit.normal, 3);
          const surface = hit.surface;
          if (surface) {
            impact(hit.point, surface.material);
            surface.onShot?.(hit.point);
          }
        }
      });
      for (const d of dealt.values()) damageNumbers.show(d.at, d.amount, d.tier);
      if (!landed) return;
      // One shot, one hit for the accuracy count; a bot's kill already marked itself.
      hits++;
      sfx.hitmarker(headMark);
      if (mark && (mark === 'kill' || !markedElsewhere)) hud.hit(mark);
    },
    dryFire: () => sfx.dryFire(),
    reloadStart: (duration, empty) => sfx.reload(duration, empty, weapon.data.arma),
    reloadEnd: () => {},
  };
  /** What we carry: the guns in each slot and every weapon's upgrades (refreshed by applyLoadout). */
  let loadout = startLoadout;
  /** Only the knife in hand (corrida armada's lightsaber): no guns, the fire button swings it. */
  let bladeOnly = false;
  /** The two gun slots, each with its own magazine; `weapon` is the one in hand. */
  const guns: Record<GunSlot, Weapon> = {
    primaria: new Weapon(slotStats(loadout, 'primaria')!, gunHooks),
    secundaria: new Weapon(slotStats(loadout, 'secundaria') ?? slotStats(loadout, 'primaria')!, gunHooks),
  };
  let slot: GunSlot = 'primaria';
  let weapon = guns.primaria;
  /** Seconds left bringing the gun in hand up after a switch (it can't fire, aim or reload meanwhile). */
  let drawT = 0;

  /** Zumbi: what we carry from the coffin (the local match's solo, the server's online). */
  const zItems = (): ZItems => localZombies?.match.itemsOf(me) ?? zombies?.items ?? startItems();
  /** The zumbi mode's item in a gun slot, if any. */
  const slotItem = (s: GunSlot) => (zombieMode ? itemOf(zItems()[s]) : undefined);
  /** A slot's name on the HUD: the coffin's item in the zumbi mode, the gun otherwise. */
  const slotName = (s: GunSlot) => {
    const it = slotItem(s);
    return it ? t(`zitem_${it.id}` as StringKey) : weaponName(guns[s].data.arma);
  };
  const slotRarity = (s: GunSlot) => slotItem(s)?.raridade ?? '';
  /** A damaged copy from the coffin in that slot (the HUD tags it). */
  const slotDamaged = (s: GunSlot) => !!slotItem(s) && !!zItems().danificadas?.[s];

  /** Puts a slot's gun in the hands; `draw`: a switch (the gun comes up, with its draw time and sound). */
  const holdSlot = (next: GunSlot, draw: boolean) => {
    if (next !== slot) {
      weapon.holster();
      drawT = 0;
    }
    slot = next;
    weapon = guns[next];
    viewmodel.setGun(weapon.data);
    hud.setWeaponName(bladeOnly ? weaponLabel(knifeOf(loadout)) : slotName(next), slotRarity(next), !bladeOnly && slotDamaged(next));
    if (!draw) return;
    drawT = weapon.data.troca;
    viewmodel.draw(drawT);
    sfx.weaponSwitch();
  };
  /** 1, 2, the wheel, the swap button: the other gun, if there's one in that slot (none with only a blade). */
  const switchTo = (next: GunSlot) => {
    if (!bladeOnly && next !== slot && gunIn(loadout, next)) holdSlot(next, true);
  };

  // --- Weapon progression: each kill's points level up only the weapon that made it ------------------
  let knifeForm: KnifeId = 'faca';
  /** Our knife's passive (null where the mode hands the knife out), see knifePassive. */
  let ownPassive: KnifePassive | null = null;
  /** The rubber chicken's getaway: faster until then. */
  let rushUntil = -1;
  let rushMul = 1;
  /**
   * Puts `lo` in our hands: each slot's gun, the knife and the grenade with their upgrades (or only the
   * knife). `tell`: the choice changed here (the Arsenal, where it can change mid-match), so the server hears.
   */
  const applyLoadout = (lo: Loadout, tell = false) => {
    loadout = lo;
    const blade = !!lo.soFaca;
    if (blade !== bladeOnly) {
      bladeOnly = blade;
      weapon.holster();
      viewmodel.setBladeOnly(blade);
      hud.setMeleeOnly(blade);
    }
    for (const s of ['primaria', 'secundaria'] as const) {
      const g = slotStats(lo, s);
      // Zumbi: hordes need more bullets than a duel (the reserve is refilled at every break); a damaged gun from
      // the coffin holds fewer rounds (its damage penalty is the server's, on every hit).
      if (g) guns[s].setData(zombieMode ? zombieGunData(g, lo.danificadas?.[progOf(g.arma)]) : g);
      guns[s].reloadMul = body.reloadMul;
    }
    const knife = loadoutKnife(lo);
    melee.setData(knife);
    viewmodel.setKnife(knife.forma);
    knifeForm = knife.forma;
    ownPassive = knifePassive(knife.forma, gameMode);
    player.noFallDamage = ownPassive?.id === 'boia';
    holdSlot(gunIn(lo, slot) ? slot : 'primaria', false);
    grenadeData = grenadeStats(lo.ativas.granada);
    // A mode without grenades (corrida armada): none carried, none coming back. Zumbi: they come back only
    // between waves, not over time.
    thrower.setData(rules && !rules.grenades ? { ...grenadeData, quantidade: 0 } : zombieMode ? { ...grenadeData, recargaSegundos: 0 } : grenadeData);
    thrower.kind = grenadeData.tipo;
    viewmodel.setGrenadeKind(grenadeData.tipo);
    if (tell) conn?.send({ t: 'loadout', lo: progress.choice });
  };
  // Points only come from the server (online kills, humiliations, time alive): it pushes the new progress.
  // With a locked loadout (every online mode) what we hold doesn't change: new upgrades wait for the next match.
  conn?.on('progresso', (m) => {
    const lockedBefore = [...GUN_IDS, ...KNIVES].filter((w) => !progress.unlocked(w));
    progress.applyServer(m);
    if (!lockedLoadout && rules?.weapons !== 'mode') applyLoadout(progress.loadout);
    if (!m.subiu) return;
    if (m.subiu.tipo === 'conta') hud.showBanner(t('accountLevelUp', { level: m.subiu.nivel }), 'level');
    else {
      // Each level unlocks an upgrade: the common ones are on at once (next match, if locked), the optional
      // ones wait in the Arsenal.
      const w = m.subiu.tipo;
      const u = upgradeAt(w, m.subiu.nivel);
      hud.showBanner(`${u?.icone ?? ''} ${t('upgradeUnlocked', { weapon: weaponName(w), level: m.subiu.nivel, upgrade: u ? upgradeName(w, u.id) : '' })}`, 'level');
      if (u?.opcional) hud.notice(t(lockedLoadout ? 'upgradeTurnOnNext' : 'upgradeTurnOn'));
      else if (lockedLoadout) hud.notice(t('upgradeNextMatch'));
      // The level also unlocked a weapon (the pistol's frees the SMG): it waits in the Arsenal, not in our hands.
      for (const freed of lockedBefore.filter((x) => progress.unlocked(x))) hud.notice(t('weaponUnlocked', { weapon: weaponName(freed) }));
    }
    sfx.levelUp();
  });
  // An album sticker went up (online, from the server): one banner after the other when several come at once.
  const stickerLines: string[] = [];
  let stickerShowing = false;
  const nextSticker = () => {
    const line = stickerLines.shift();
    stickerShowing = !!line;
    if (!line) return;
    hud.showBanner(line, 'level');
    sfx.levelUp();
    setTimeout(nextSticker, 2000);
  };
  conn?.on('figurinha', (m) => {
    const line = stickerUpText(m.id, m.nivel);
    if (!line) return;
    stickerLines.push(line);
    if (!stickerShowing) nextSticker();
  });
  // The pause menu's Arsenal tab (corrida armada shows its ladder and zumbi the coffin instead, see "Menus"):
  // in a match what is in our hands (locked as the match began, levels and points live), on the training range
  // editable, the new choice in our hands at once.
  const arsenalPanel =
    !gunGame && !zombieMode
      ? new ArsenalPanel(progress, screens.modeBody, { editable: !lockedLoadout, inUse: () => loadout, startLevels: progress.levels, onChange: () => applyLoadout(progress.loadout, true) })
      : null;
  // Training range: a change the account didn't save is undone, in the Arsenal and in our hands.
  if (arsenalPanel && !lockedLoadout)
    progress.onSaveError(() => {
      applyLoadout(progress.loadout, true);
      hud.notice(t('arsenalSaveFailed'));
    });
  applyLoadout(startLoadout);
  // Zumbi: the bigger reserve from the start.
  if (zombieMode) for (const g of Object.values(guns)) g.refill();
  const scopeEl = document.getElementById('scope')!;

  // --- Knife ----------------------------------------------------------------------------------------
  const startMelee = () => {
    player.eye(1, eye);
    const found = findMeleeTarget(physics, targets(), eye, player.yaw, melee.data.alcanceInvestida, melee.data.anguloGraus);
    if (!melee.tryStart(found?.target ?? null)) return;
    weapon.cancelReload();
    sfx.meleeSwing(knifeForm);
    conn?.send({ t: 'swing' });
  };

  const resolveMelee = () => {
    player.eye(1, eye);
    // Zumbi: a swing scares the haunted graves' ghosts close by (whatever it hits).
    zombies?.knifeSwing();
    // The lunge target if it is now in reach, otherwise whatever is in front of us.
    let target = melee.target;
    const inReach = target && findMeleeTarget(physics, targets(), eye, player.yaw, melee.data.alcance + 0.4, 180)?.target === target;
    if (!inReach) target = findMeleeTarget(physics, targets(), eye, player.yaw, melee.data.alcance, melee.data.anguloGraus)?.target ?? null;
    if (!target) {
      // Nobody in reach: a fish in the pond or the cherries overhead (a little extra reach, down or up).
      const critter = map.critters?.stab(eye, computeAim(aimForward), melee.data.alcance + 0.4);
      if (!critter) return;
      sfx.knifeHit();
      effects.burst('star', critter.point, UP, 8);
      hitCritter(critter);
      return;
    }
    sfx.knifeHit();
    // The lightsaber's sweep: everyone else in reach and in front too.
    const sweep = ownPassive?.id === 'vuuum' ? meleeTargets(physics, targets(), eye, player.yaw, melee.data.alcance, melee.data.anguloGraus).map((f) => f.target) : [];
    for (const victim of new Set([target, ...sweep])) stabOne(victim);
  };

  /** A swing landing on `target`: a zombie, a player (online), a bot or a training dummy. */
  const stabOne = (target: Target) => {
    tmp.set(target.position.x - eye.x, 0, target.position.z - eye.z).normalize();
    const behind = target.isBehind(eye);
    effects.burst('star', new THREE.Vector3().copy(target.position).setY(target.position.y + 1.1), UP, 12);
    if (zombies?.isZombie(target)) {
      zombies.stab(target);
      hud.hit('hit');
      return;
    }
    if (net) {
      conn!.send({ t: 'stab', target: (target as RemotePlayer).id, behind });
      hud.hit('hit');
      return;
    }
    if (target instanceof Bot && bots) {
      const res = bots.hit(target, playerTarget, melee.data.letal ? LETHAL_DAMAGE : 55, { kind: 'knife', behind, w: 'faca', knife: knifeForm });
      if (!res.killed && res.dealt > 0) hud.hit('hit');
      return;
    }
    // One-hit kill, as in the original.
    const dummy = target as Dummy;
    const res = dummy.applyHit(melee.data.letal ? LETHAL_DAMAGE : 55, 'peito', simTime, tmp, 'back');
    if (res.damage <= 0) return;
    hud.hit(res.killed ? 'kill' : 'hit');
    if (res.killed) {
      onKill(dummy, res, weaponLabel(knifeOf(loadout)), 'knife');
      award(t('knife'), SCORE.knife);
      if (behind) award(t('backstab'), ownPassive?.id === 'tapaGelado' ? ownPassive.costas : SCORE.backstab);
      knifeKillPassive();
    }
  };

  /**
   * A kill with our knife: its passive. Online the server already gave the spoon's health back (it comes with
   * the next snapshot); the getaway and the full magazine are ours to apply. The frozen fish's bigger
   * backstab is in the kill's points.
   */
  const knifeKillPassive = () => {
    const p = ownPassive;
    if (p?.id === 'coloDeVo') {
      if (!net) player.health = Math.min(player.maxHealth, player.health + p.vida);
      hud.notice(t('passiveFx_coloDeVo', { vida: p.vida }));
    } else if (p?.id === 'fugaEscandalosa') {
      rushUntil = simTime + p.segundos;
      rushMul = p.velocidade;
      hud.notice(t('passiveFx_fugaEscandalosa'));
    } else if (p?.id === 'lanche' && !bladeOnly) {
      weapon.fillMag();
      hud.notice(t('passiveFx_lanche'));
    }
  };

  // --- Humiliation ----------------------------------------------------------------------------------
  const playerFeet = (out: THREE.Vector3, alpha = 1) => {
    player.eye(alpha, out);
    out.y -= eyeHeight(player.move) * player.eyeScale;
    return out;
  };

  // --- Amora: whoever steps in front of her door gets bitten (map hazard, instant kill) ----------------
  const dog = map.dog;
  const lastBite = new Map<object, number>();
  const biteOnce = (who: object, at: THREE.Vector3) => {
    const last = lastBite.get(who);
    if (last !== undefined && simTime - last < 2) return false;
    lastBite.set(who, simTime);
    dog!.bite(at);
    return true;
  };
  const dogTick = () => {
    if (!dog) return;
    if (!player.dead) {
      const f = playerFeet(new THREE.Vector3());
      if (dog.contains(f) && biteOnce(player, f)) {
        // Online the server owns deaths: report it like a fall.
        if (conn) conn.send({ t: 'selfDamage', amount: LETHAL_DAMAGE, cause: 'dog' });
        else player.damage(LETHAL_DAMAGE, simTime, 'dog');
      }
    }
    for (const b of bots?.bots ?? []) if (!b.dead && dog.contains(b.position) && biteOnce(b, b.position.clone())) bots!.kill(b, null, { kind: 'dog' });
    // Remote players report their own bite; here she just lunges at them.
    for (const p of net?.targets() ?? []) if (!p.dead && dog.contains(p.position)) biteOnce(p, p.position.clone());
  };

  const humiliationFx = (corpse: Humiliable) => {
    hud.showBanner(t('humiliatedBanner'), 'taunt');
    sfx.airHorn();
    sfx.applause();
    effects.burst('confetti', corpse.corpseCenter(tmp).setY(tmp.y + 0.5), UP, 60);
  };

  const finishTaunt = (corpse: Humiliable) => {
    humiliationFx(corpse);
    // Online the points arrive with the server's confirmation (tauntEnd); against bots, from the manager.
    if (!net && !(corpse instanceof Corpse)) {
      award(t('humiliation'), SCORE.humiliation);
      hud.killfeed(t('you'), t('danceName'), corpse.name, 'taunt');
    }
  };

  // --- Grenades -------------------------------------------------------------------------------------
  let shake = 0; // camera trauma 0..1
  let lastBeep = -1;
  let grenadeSeq = 1;
  let secondThrowIn: number | null = null;

  /** The land mine upgrade: a mine just in front of our feet (online, others see it too). */
  const plantMine = () => {
    if (mines.own >= MAX_MINES) {
      thrower.count++; // nothing planted, charge back
      hud.notice(t('mineLimit', { n: MAX_MINES }));
      return;
    }
    const f = playerFeet(new THREE.Vector3());
    const at = mines.groundAt(f.addScaledVector(new THREE.Vector3(-Math.sin(player.yaw), 0, -Math.cos(player.yaw)), 0.6));
    const id = grenadeSeq++;
    mines.place(id, null, at);
    sfx.minePlant();
    conn?.send({ t: 'grenade', id, p: vec3(at), v: [0, 0, 0], fuse: 0, mine: true });
  };

  /** Distance from `from` to the closest of `samples` with a clear line (walls block the blast), or null. */
  const blastDistance = (from: THREE.Vector3, samples: THREE.Vector3[]): number | null => {
    let best: number | null = null;
    for (const p of samples) {
      const d = new THREE.Vector3().subVectors(p, from);
      const len = d.length();
      if (len < 1e-3) return 0;
      const hit = physics.world.castRay(new RAPIER.Ray(from, { x: d.x / len, y: d.y / len, z: d.z / len }), len, true, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, WORLD_ONLY);
      if (hit && hit.timeOfImpact < len - 0.05) continue;
      if (best === null || len < best) best = len;
    }
    return best;
  };

  const bodySamples = (p: THREE.Vector3) => [new THREE.Vector3(p.x, p.y + 0.3, p.z), new THREE.Vector3(p.x, p.y + 1.1, p.z), new THREE.Vector3(p.x, p.y + 1.6, p.z)];

  /** Visual + audio part of an explosion (also used for other players' grenades). */
  const explosionFx = (at: THREE.Vector3) => {
    const center = at.clone();
    center.y += 0.1; // keep the occlusion rays off the floor it is lying on
    const groundHit = physics.world.castRayAndGetNormal(new RAPIER.Ray(center, { x: 0, y: -1, z: 0 }), 1.5, true, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, WORLD_ONLY);
    const ground = groundHit
      ? { point: center.clone().setY(center.y - groundHit.timeOfImpact), normal: new THREE.Vector3(groundHit.normal.x, groundHit.normal.y, groundHit.normal.z) }
      : null;
    effects.explosion(center, ground, grenadeData.explosao.raioDano);
    player.eye(1, eye);
    const listener = eye.distanceTo(center);
    sfx.at(center, 'boom', (s) => s.explosion());
    shake = Math.min(1, shake + Math.max(0, 1 - listener / 18));
    return center;
  };

  /** Our own grenade went off: effects, then damage (locally offline, reported to the server online). */
  const explode = (at: THREE.Vector3, id: number) => {
    const center = explosionFx(at);
    const blast = grenadeData.explosao;
    const f = playerFeet(feet);
    const selfDist = player.dead ? null : blastDistance(center, [new THREE.Vector3(f.x, f.y + 0.3, f.z), eye.clone()]);

    // Zumbi: the zombies the blast reaches (walls block it), for the match to hurt.
    const zs = zombies ? zombies.blast((samples) => blastDistance(center, samples), blast.raioDano) : [];
    if (net) {
      const reported: { target: number; dist: number }[] = [];
      // Teammates can't hurt each other (co-op): only ourselves.
      for (const p of zombies ? [] : net.targets()) {
        if (p.dead) continue;
        const dist = blastDistance(center, bodySamples(p.position));
        if (dist !== null && dist <= blast.raioDano) reported.push({ target: p.id, dist: +dist.toFixed(2) });
      }
      if (selfDist !== null && selfDist <= blast.raioDano) reported.push({ target: me, dist: +selfDist.toFixed(2) });
      conn!.send({ t: 'boom', id, p: vec3(center), hits: reported, ...(zs.length ? { zs } : {}) });
      if (reported.some((r) => r.target !== me) || zs.length) {
        sfx.hitmarker(false);
        hud.hit('hit');
      }
      return;
    }
    if (zombies && zs.length) {
      zombies.link.send({ t: 'boom', id, p: vec3(center), hits: [], zs });
      sfx.hitmarker(false);
      hud.hit('hit');
    }

    let anyHit = false;
    let anyKill = false;
    for (const d of dummies.list) {
      if (d.dead) continue;
      const p = d.position;
      const dist = blastDistance(center, bodySamples(p));
      if (dist === null) continue;
      const dmg = clampExplosionDamage(blast, explosionDamage(blast, dist), d.health);
      if (dmg <= 0) continue;
      const away = new THREE.Vector3(p.x - center.x, 0, p.z - center.z).normalize();
      const res = d.applyHit(dmg, 'peito', simTime, away, 'back');
      if (res.damage <= 0) continue;
      anyHit = true;
      effects.burst('confetti', tmp.copy(p).setY(p.y + 1.1), UP, 6);
      if (res.killed) {
        anyKill = true;
        onKill(d, res, weaponLabel('granada', loadout.ativas.granada), 'grenade');
      }
    }
    for (const b of bots?.bots ?? []) {
      if (b.dead) continue;
      const dist = blastDistance(center, bodySamples(b.position));
      if (dist === null) continue;
      const dmg = clampExplosionDamage(blast, explosionDamage(blast, dist), b.health);
      if (dmg <= 0) continue;
      const res = bots!.hit(b, playerTarget, dmg, { kind: 'grenade', w: 'granada' });
      if (res.dealt > 0) anyHit = true;
      if (res.killed) anyKill = true;
    }
    if (anyHit) {
      sfx.hitmarker(false);
      hud.hit(anyKill ? 'kill' : 'hit');
    }
    // Your own grenade can always kill you: a "non-lethal" blast only protects others.
    if (selfDist !== null) {
      const dmg = explosionDamage(blast, selfDist);
      const dealt = player.damage(dmg, simTime, 'explosion');
      if (dealt > 0) {
        hud.damageFlash(dealt);
        sfx.hurt();
      }
    }
  };

  /** Hand position in the world: in front of the eye, a bit right and down (never inside a wall). */
  const handPosition = (dir: THREE.Vector3, out: THREE.Vector3) => {
    player.eye(1, eye);
    const right = new THREE.Vector3(Math.cos(player.yaw), 0, -Math.sin(player.yaw));
    const target = new THREE.Vector3().copy(eye).addScaledVector(dir, 0.45).addScaledVector(right, 0.12).addScaledVector(UP, -0.08);
    const d = new THREE.Vector3().subVectors(target, eye);
    const len = d.length();
    d.divideScalar(len);
    const hit = physics.world.castRay(new RAPIER.Ray(eye, d), len, true, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, WORLD_ONLY);
    return out.copy(eye).addScaledVector(d, hit ? Math.max(0, hit.timeOfImpact - 0.1) : len);
  };

  /**
   * Throws one of our grenades; the id travels with the projectile and is reported with its explosion.
   * `impact`: goes off on first contact (thrown); otherwise by `fuse` (dropped while cooking).
   */
  const launch = (origin: THREE.Vector3, vel: THREE.Vector3, fuse: number, impact = false) => {
    const id = grenadeSeq++;
    const limit = impact ? grenadeData.tempoMaximoVoo : fuse;
    grenades.spawn(origin, vel, limit, undefined, id, { impact, ignore: playerRig?.body, duck: duckAmmo });
    if (duckAmmo) sfx.at(origin, 'normal', (s) => s.quack());
    conn?.send({ t: 'grenade', id, p: vec3(origin), v: vec3(vel), fuse: +limit.toFixed(3), ...(impact ? { impact } : {}), ...(duckAmmo ? { duck: true } : {}) });
  };

  const throwGrenade = (fuseLeft: number) => {
    const p = player.pitch + (grenadeData.anguloExtraGraus * Math.PI) / 180;
    const dir = new THREE.Vector3(-Math.sin(player.yaw) * Math.cos(p), Math.sin(p), -Math.cos(player.yaw) * Math.cos(p));
    const origin = handPosition(dir, new THREE.Vector3());
    // Jump + throw (in the air, or jump pressed on the same tick) throws farther.
    const jumping = !player.move.grounded || input.down('jump');
    const speed = grenadeData.velocidadeLancamento * (jumping ? grenadeData.bonusPulo : 1);
    // Inherit part of the player's run (and of the jump's lift) so throws on the move feel right.
    const vel = dir.multiplyScalar(speed).add(new THREE.Vector3(player.move.vel.x * 0.6, jumping ? Math.max(0, player.move.vel.y) * 0.5 : 0, player.move.vel.z * 0.6));
    // Once thrown the fuse no longer matters: it goes off on contact.
    launch(origin, vel, fuseLeft, grenadeData.impacto);
    sfx.grenadeThrow();
  };

  /** Dying with a cooked grenade drops it at your feet, still live (offline: online you're already dead). */
  const dropCookedGrenade = () => {
    const left = thrower.fuseLeft;
    if (left === null) return;
    thrower.cancel();
    thrower.count = Math.max(0, thrower.count - 1);
    if (net) return;
    const f = playerFeet(new THREE.Vector3());
    launch(f.setY(f.y + 0.3), new THREE.Vector3(0, 1, 0), left);
  };

  // --- Bots ----------------------------------------------------------------------------------------
  /**
   * Name of the weapon behind a kill (`weapon`, when the server or the bots tell it): the gun that shot (an old
   * rifle too), the killer's knife (a stab only says 'faca'), the land mine (bots carry no upgrades).
   */
  const weaponNameFor = (kind: KillKind, weapon: WeaponId | null | undefined, lo: Loadout = DEFAULT_LOADOUT) => {
    const w: WeaponId = weapon ?? (kind === 'knife' ? 'faca' : kind === 'grenade' || kind === 'explosion' ? 'granada' : 'rifle');
    if (isKnife(w)) return weaponLabel(knifeOf(lo));
    return weaponLabel(w, lo.ativas[progOf(w)]);
  };
  if (botMode && nav && !zombieMode) {
    bots = new BotManager({
      physics,
      scene: ctx.scene,
      registry,
      nav,
      spawns: allSpawns,
      effects,
      sfx,
      player: playerTarget,
      count: botMode.count,
      skill: botMode.skill,
      game: botMode.game,
      hooks: {
        playerLoadout: (lo) => takeLadderWeapons(lo),
        roundEnd: (winner, restartAt) => endRound(winner === playerTarget ? me : winner.id, winner.name, restartAt),
        roundStart: () => startRound(),
        damagePlayer: (amount) => {
          const dealt = player.damage(amount, simTime, 'killed');
          if (dealt > 0) {
            hud.damageFlash(dealt);
            sfx.hurt();
          }
          return player.health;
        },
        kill: (victim, killer, kind, awards, corpse, weapon) => {
          const victimName = victim === playerTarget ? t('you') : victim.name;
          // A bot's knife is drawn each life (its loadout is otherwise the default one, without upgrades).
          const killerLoadout = killer === playerTarget ? loadout : killer instanceof Bot ? { ...DEFAULT_LOADOUT, faca: killer.knife.forma } : DEFAULT_LOADOUT;
          if (killer) hud.killfeed(killer === playerTarget ? t('you') : killer.name, weaponNameFor(kind, weapon, killerLoadout), victimName, KIND_ICON[kind]);
          else if (kind === 'dog') hud.killfeed('Amora', t('dogBite'), victimName, 'dog');
          else hud.notice(`💀 ${victimName}`);
          if (killer === playerTarget) {
            hud.hit('kill');
            killFx(victim.position);
            if (kind === 'knife') knifeKillPassive();
            for (const a of awards) hud.popup(t(AWARD_TEXT[a.label]), a.value);
            if (kind === 'groin') groinFx(victim.position.clone().setY(victim.position.y + 0.9));
          }
          if (victim === playerTarget) {
            killerId = killer?.id ?? null;
            myCorpseId = corpse.info.id;
            deathMessage = killer ? t('killedByWith', { name: killer.name, weapon: weaponNameFor(kind, weapon, killerLoadout) }) : null;
          }
        },
        tauntStarted: (dancer, corpse) => {
          if (corpse.info.victim === me && player.dead) hud.showDeath(`${dancer.name} 💃 ${t('humiliatedBanner')}`);
        },
        humiliation: (dancer, corpse, awards) => {
          const victimName = corpse.info.victim === me ? t('you') : corpse.name;
          hud.killfeed(dancer === playerTarget ? t('you') : dancer.name, t('danceName'), victimName, 'taunt');
          if (dancer === playerTarget) for (const a of awards) hud.popup(t(AWARD_TEXT[a.label]), a.value);
          else if (corpse.info.victim === me || corpse.corpseCenter(tmp).distanceTo(playerFeet(feet)) < 25) humiliationFx(corpse);
        },
      },
    });
    const navDebug = nav.debugMesh();
    ctx.scene.add(navDebug);
    Object.assign(window, { __ocNavDebug: navDebug });
  }

  // --- Online: server messages ----------------------------------------------------------------------
  if (net && online && conn) {
    for (const p of online.joined.players) net.upsertInfo(p);
    zombies?.syncInfo(online.joined.players);
    for (const c of online.joined.corpses) net.addCorpse(c);
    /** The map alone (no players, no hitboxes) around the end of someone else's shot (weapons/remoteImpact.ts). */
    const impactRay = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 });
    const impactCast: ImpactCast = (from, dir, max) => {
      impactRay.origin = from;
      impactRay.dir = dir;
      const hit = physics.world.castRayAndGetNormal(impactRay, max, true, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, WORLD_ONLY);
      if (!hit) return null;
      return { distance: hit.timeOfImpact, normal: new THREE.Vector3(hit.normal.x, hit.normal.y, hit.normal.z), surface: physics.surfaces.get(hit.collider.handle) };
    };

    conn.on('snap', (m) => {
      net.snapshot(m.time, m.players);
      const mine = m.players.find((p) => p.id === me);
      if (!mine) return;
      if (!player.dead) player.health = mine.h;
      // The server didn't accept our respawn (timing): ask again.
      if (!mine.alive && !player.dead && performance.now() - spawnedAt > 1500 && lastSpawn) {
        spawnedAt = performance.now();
        conn.send({ t: 'respawn', p: vec3(lastSpawn.position), yaw: lastSpawn.yaw });
      }
    });
    conn.on('playerJoined', (m) => {
      net.upsertInfo(m.player);
      hud.notice(t('playerJoined', { name: m.player.name }));
    });
    // A player came back: the mines of their previous life go away.
    conn.on('spawned', (m) => mines.clearOwner(m.id));
    conn.on('playerLeft', (m) => {
      mines.clearOwner(m.id);
      const name = net.info.get(m.id)?.name;
      net.remove(m.id);
      if (name) hud.notice(t('playerLeft', { name }));
    });
    conn.on('scores', (m) => {
      m.players.forEach((p) => net.upsertInfo(p));
      zombies?.syncInfo(m.players);
    });
    conn.on('shot', (m) => {
      const rp = net.players.get(m.id);
      if (!rp) return;
      const from = rp.muzzle(new THREE.Vector3());
      rp.fire();
      // Their gun's own bang; a silencer: no tracer, and only those nearby hear it.
      const gun = rp.gun;
      const end = new THREE.Vector3(...m.e);
      if (!gun.silenciador) effects.tracer(from, end);
      // The bang comes from where their muzzle really was (sent with the shot), not the estimated one: a shooter
      // hugging a wall outside must not sound as if behind it.
      sfx.at({ x: m.o[0], y: m.o[1], z: m.o[2] }, gun.silenciador ? 'step' : 'gun', (s) => s.gunshot(1, gun.silenciador ? 'silenciado' : gun.arma));
      // Where it hit the map: the same mark, dust, sparks and impact sound as our own shots. Never the
      // surface's gag (onShot): the shooter already triggers it and the `prop` message syncs it.
      const impact = remoteImpact(new THREE.Vector3(...m.o), end, impactCast);
      if (impact) {
        effects.decal(impact.point, impact.normal);
        effects.burst('debris', impact.point, impact.normal, 5, 0x9a8f80);
        effects.burst('spark', impact.point, impact.normal, 3);
        const material = impact.surface?.material;
        if (material) sfx.at(impact.point, 'normal', (s) => s.impact(material));
      }
    });
    conn.on('swing', (m) => {
      const rp = net.players.get(m.id);
      // The rubber chicken's scream, the lightsaber's vwoom and the other knives' sounds carry much farther than a knife's swish.
      const form = rp?.knife.forma ?? 'faca';
      if (rp) sfx.at({ x: rp.position.x, y: rp.position.y + 1.3, z: rp.position.z }, rp.knife.passiva.id === 'discreta' ? 'step' : 'normal', (s) => s.meleeSwing(form));
    });
    // Ours too: the mode handed out other weapons (corrida armada's next step); the others draw theirs.
    conn.on('playerLoadout', (m) => (m.id === me ? takeLadderWeapons(sanitizeLoadout(m.lo)) : net.setLoadout(m.id, m.lo)));
    // Corrida armada: someone won the round; then everyone starts over.
    conn.on('roundEnd', (m) => endRound(m.winner, m.name, m.restartAt / 1000));
    conn.on('roundStart', (m) => {
      m.players.forEach((p) => net.upsertInfo(p));
      startRound();
    });
    conn.on('grenade', (m) => {
      // The thrower's arm swings on their avatar.
      const by = net.players.get(m.owner);
      if (!m.mine) by?.throwGrenade();
      if (!m.mine && by) sfx.at({ x: by.position.x, y: by.position.y + 1.4, z: by.position.z }, 'step', (s) => s.grenadeThrow());
      if (m.mine) {
        mines.place(m.id, m.owner, new THREE.Vector3(...m.p));
        sfx.at({ x: m.p[0], y: m.p[1] + 0.2, z: m.p[2] }, 'normal', (s) => s.minePlant());
      }
      else grenades.spawn(new THREE.Vector3(...m.p), new THREE.Vector3(...m.v), m.fuse, `${m.owner}:${m.id}`, 0, { impact: m.impact, duck: m.duck });
    });
    conn.on('boom', (m) => {
      grenades.removeRemote(`${m.owner}:${m.id}`);
      mines.remove(m.id, m.owner);
      explosionFx(new THREE.Vector3(...m.p));
    });
    conn.on('damage', (m) => {
      if (m.target !== me) {
        // Someone else was hit: their torso jerks along the bullet's path.
        if (m.from) net.players.get(m.target)?.hitReact(new THREE.Vector3(...m.from));
        return;
      }
      player.health = m.health;
      player.lastDamageAt = simTime;
      hud.damageFlash(m.amount);
      sfx.hurt();
    });
    conn.on('kill', (m) => {
      m.players.forEach((p) => net.upsertInfo(p));
      net.addCorpse(m.corpse);
      const victimName = m.victim === me ? t('you') : m.corpse.name;
      const killerLoadout = m.attacker === me ? loadout : m.attacker !== null ? net.players.get(m.attacker)?.loadout : undefined;
      const weaponName = weaponNameFor(m.kind, m.arma, killerLoadout);
      if (m.attacker !== null) hud.killfeed(nameOf(m.attacker), weaponName, victimName, KIND_ICON[m.kind]);
      else if (m.kind === 'dog') hud.killfeed('Amora', t('dogBite'), victimName, 'dog');
      // Bleeding out (zumbi): the zombie side says it.
      else if (m.kind !== 'zombie') hud.notice(`💀 ${victimName}`);
      if (m.attacker === me && m.victim !== me) {
        hud.hit('kill');
        killFx(new THREE.Vector3(...m.corpse.p));
        if (m.kind === 'knife') knifeKillPassive();
        for (const a of m.awards) hud.popup(t(AWARD_TEXT[a.label]), a.value);
        if (m.kind === 'groin') groinFx(new THREE.Vector3(...m.corpse.p).setY(m.corpse.p[1] + 0.9));
      }
      if (m.victim === me) {
        killerId = m.attacker !== me ? m.attacker : null;
        myCorpseId = m.corpse.id;
        taunt.cancel(simTime);
        thrower.cancel();
        player.kill(simTime);
        sfx.sadTrombone();
        const killer = m.attacker !== null && m.attacker !== me ? nameOf(m.attacker) : null;
        // The killer's calling card: the album sticker they show and the title they wear.
        const killerInfo = killer ? net.info.get(m.attacker!) : undefined;
        hud.setDeathShowcase(stickerBadge(killerInfo?.fig), titleText(killerInfo?.tit));
        const msg = killer
          ? t('killedByWith', { name: killer, weapon: weaponName })
          : pick(DEATH_MESSAGES[getLang()][m.kind === 'void' ? 'void' : m.kind === 'fall' ? 'fall' : m.kind === 'dog' ? 'dog' : m.kind === 'zombie' ? 'zombie' : m.kind === 'thorns' ? 'thorns' : 'explosion']);
        hud.showDeath(msg);
      }
    });
    conn.on('taunt', (m) => {
      const c = net.corpses.get(m.corpse);
      if (c && m.id !== me) c.claimedBy = m.id;
      // The victim watches from the death cam.
      if (c && c.info.victim === me && player.dead) hud.showDeath(`${nameOf(m.id)} 💃 ${t('humiliatedBanner')}`);
    });
    conn.on('tauntEnd', (m) => {
      m.players.forEach((p) => net.upsertInfo(p));
      const c = net.corpses.get(m.corpse);
      if (!c) return;
      if (!m.done) {
        if (c.claimedBy === m.id) c.claimedBy = null;
        return;
      }
      c.markHumiliated();
      hud.killfeed(nameOf(m.id), t('danceName'), c.info.victim === me ? t('you') : c.name, 'taunt');
      if (m.id === me) for (const a of m.awards) hud.popup(t(AWARD_TEXT[a.label]), a.value);
      else if (c.info.victim === me || c.corpseCenter(tmp).distanceTo(playerFeet(feet)) < 25) humiliationFx(c);
    });
    conn.on('prop', (m) => map.props.remote(m.id, net?.players.get(m.by)?.position ?? null));
    // Collectibles: someone took one (maybe us); taken ones as we joined are still growing back.
    for (const k of online.joined.pickups ?? []) {
      pickups.find((p) => p.id === k.id)?.take();
      pickupBack.set(k.id, k.ready / 1000);
    }
    // Fish: who's dead (and until when) or golden as we joined; then every kill, ours or not.
    for (const f of online.joined.fish ?? []) map.fish?.set(f.id, f.ready / 1000, f.golden);
    // Giant rats: the dead ones as we joined, then every kill (whoever brought it down gets the humanity).
    for (const r of online.joined.rats ?? []) map.rats?.set(r.id, r.ready / 1000);
    conn.on('potion', (m) => {
      if (m.by === me) applyPotion(m.kind, m.until / 1000);
      else map.potion?.drink(m.kind);
    });
    conn.on('rat', (m) => {
      map.rats?.kill(m.id, m.ready / 1000);
      if (m.by === me) gainHumanity();
    });
    conn.on('fish', (m) => {
      map.fish?.kill(m.id, m.ready / 1000, m.golden);
      if (m.by !== me) return;
      const golden = m.prize === 'dourada';
      hud.notice(t(golden ? 'goldenKoiXp' : 'koiXp', { n: golden ? KOI.goldenXp : KOI.xp }));
      if (golden && m.until) startAim(m.until / 1000);
    });
    conn.on('pickup', (m) => {
      const pk = pickups.find((p) => p.id === m.id);
      if (!pk) return;
      pk.take();
      pickupBack.set(m.id, m.ready / 1000);
      const biscuit = pickupKind(m.id) === 'biscoito';
      if (m.by === me) {
        if (biscuit) eatBiscuit();
        else startBoost(m.until / 1000);
      } else sfx.at({ x: pk.position.x, y: pk.position.y + 0.6, z: pk.position.z }, 'normal', (s) => (biscuit ? s.scoobySnack() : s.cherry()));
    });
    conn.on('chat', (m) => chat.add(m.name, m.text, m.id === me));
    conn.on('chatRefused', (m) => chat.system(t(m.reason === 'muted' ? 'chatMuted' : 'chatSlow')));
    map.props.onLocal = (id) => conn.send({ t: 'prop', id });
    conn.onClose = (code) => hud.setNetStatus(code === CLOSE.revoked || code === CLOSE.replaced ? closeReason(code) : t('lostConnection'));
  }

  // --- Corrida armada: the ladder's weapons, the banners as we climb, the end of a round -------------
  /** Weapons the mode handed us mid-match (a ladder step): in our hands at once, full magazines. */
  function takeLadderWeapons(lo: Loadout) {
    applyLoadout(lo);
    for (const g of Object.values(guns)) g.refill();
  }
  /** Our step on the ladder (null in the other modes): the server's online, the bots manager's offline. */
  const myLadder = (): LadderPos | null => (!gunGame ? null : (net?.info.get(me)?.ladder ?? bots?.ladderOf(me) ?? { step: 0, kills: 0 }));
  /** The step last shown, to announce a change (moving up, or down after a stab). */
  let shownLadder: LadderPos | null = null;
  const watchLadder = () => {
    const l = myLadder();
    if (!l) return;
    const before = shownLadder;
    shownLadder = l;
    if (before?.step === l.step && before.kills === l.kills) return;
    if (!before) return;
    // A stab on a step with kills: one of them lost, same weapon.
    if (before.step === l.step) {
      if (l.kills === before.kills - 1) hud.showBanner(t('ladderLostKill', { n: l.kills, total: killsForStep(l.step) }), 'bird');
      return;
    }
    if (l.step > before.step) {
      hud.showBanner(l.step === FINAL_STEP ? t('ladderFinal') : t('ladderNext', { weapon: stepName(l.step) }), 'level');
      sfx.levelUp();
    } else hud.showBanner(t('ladderDown', { weapon: stepName(l.step) }), 'bird');
  };
  /** Zumbi: the coffin's weapons we carry, as last shown (the weapon's name follows them; the menu reads them itself). */
  let shownItems = '';
  const watchZombieItems = () => {
    if (!zombieMode) return;
    const items = zItems();
    const key = JSON.stringify(items);
    if (key === shownItems) return;
    shownItems = key;
    if (!bladeOnly) hud.setWeaponName(slotName(slot), slotRarity(slot), slotDamaged(slot));
  };
  /** The round is over (who won, and when the next starts on the game clock); null while playing. */
  let roundOver: { title: string; won: boolean; restartAt: number } | null = null;
  function endRound(winner: number | null, name: string, restartAt: number) {
    const won = winner === me;
    roundOver = { title: won ? t('roundYouWon') : t('roundWinner', { name }), won, restartAt };
    if (won) {
      sfx.airHorn();
      sfx.applause();
    } else sfx.sadTrombone();
  }
  /** A new round: everyone (us too, alive or dead) back at a spawn point on the first step. */
  function startRound() {
    roundOver = null;
    hud.showRoundEnd(null);
    shownLadder = { step: 0, kills: 0 };
    if (zombies) zombies.reset();
    taunt.cancel(simTime);
    thrower.cancel();
    secondThrowIn = null;
    comeBack();
    hud.showBanner(zombieMode ? t('zCountdown') : t('roundStart'), 'level');
  }

  // --- Menus and pointer lock ---------------------------------------------------------------------
  relayoutTouch = () => touch?.layout();
  // The start card and the pause menu (client/ui/pauseMenu.ts): what the rail says here (the mode, the map, the
  // session or the bots or the wave, the banner, the exit), and the mode's tab: the Arsenal, corrida armada's
  // ladder or the zumbi mode's coffin. Refreshed with the HUD while the menu is open (online the world goes on).
  const mapName = mapUrl ? previewMapName(mapUrl) : (mapData?.nome ?? choice.map);
  const pauseNow = (): PauseContext => {
    const c = pauseFacts();
    // A Play in the editor's Game tab: the exit stops the game and goes back to editing.
    return embed ? { ...c, exit: t('backToEditor'), confirm: t('pmConfirmEditor') } : c;
  };
  const pauseFacts = (): PauseContext =>
    pauseContext({
      place: online ? 'online' : botMode ? 'bots' : 'range',
      mode: gameMode,
      session: online ? { name: online.joined.session.name, players: net?.info.size ?? 1, max: online.joined.session.max } : undefined,
      bots: botMode ? { count: botMode.count, skill: botMode.skill } : undefined,
      wave: zombies?.wave ?? 0,
    });
  const modeTabMeta = (c: PauseContext): ModeTabMeta => {
    if (c.tab === 'escada') {
      return { icon: '🪜', label: t('pmTabLadder'), sub: ladderTabSub(myLadder() ?? { step: 0, kills: 0 }), title: t('ladderTitle'), hint: t('pmLadderHint'), badge: null, foot: '' };
    }
    if (c.tab === 'caixao') {
      const cost = { cost: ZOMBIE.caixa.custo };
      return { icon: '⚰️', label: t('pmTabCoffin'), sub: t('pmTabCoffinSub'), title: t('zArsenalTitle'), hint: t(online ? 'pmCoffinHintOnline' : 'pmCoffinHintSolo', cost), badge: null, foot: t('pmCoffinFoot') };
    }
    const ro = c.readOnly;
    return {
      icon: '🎒',
      label: t('arsenal'),
      sub: t(ro ? 'pmArsenalSubReadOnly' : 'pmArsenalSubEditable'),
      title: t('arsenal'),
      hint: t(ro ? 'pmArsenalHintReadOnly' : 'pmArsenalHintEditable'),
      badge: ro ? 'readOnly' : 'editable',
      // Without an account nothing levels up: the footer says why.
      foot: t(!progress.signedIn ? 'pmArsenalFootGuest' : ro ? 'pmArsenalFootReadOnly' : 'pmArsenalFootEditable'),
    };
  };
  /** What the mode's tab last drew (it is drawn again only when that changes). */
  let modeTabKey = '';
  const drawModeTab = (force: boolean) => {
    const el = screens.modeBody;
    if (arsenalPanel) {
      // Points and choices redraw it themselves (Progress.onChange).
      if (force) arsenalPanel.render();
      return;
    }
    if (gunGame) {
      const players = net ? net.info.values() : (bots?.standings() ?? []);
      const round = roundOver && { title: roundOver.title, next: t('roundNext', { s: Math.max(0, Math.ceil(roundOver.restartAt - clock())) }) };
      const view = { pos: myLadder() ?? { step: 0, kills: 0 }, leader: ladderLeader(players, me), round };
      const key = JSON.stringify(view);
      if (force || key !== modeTabKey) renderLadderTab(el, view);
      modeTabKey = key;
    } else if (zombieMode) {
      const items = zItems();
      const key = JSON.stringify(items);
      if (force || key !== modeTabKey) renderCoffinTab(el, items);
      modeTabKey = key;
    }
  };
  const refreshMenu = () => {
    if (!screens.visible) return;
    const c = pauseNow();
    screens.setContext(c, mapName);
    screens.setModeTab(modeTabMeta(c));
    if (screens.openedTab === 'mode') drawModeTab(false);
  };
  screens.onTab((tab) => tab === 'mode' && drawModeTab(true));
  screens.onPlay(() => {
    sfx.unlock();
    sfx.ui();
    // The mouse first: the fullscreen request uses up the click, the pointer lock doesn't.
    void input.lock();
    // Phones: fullscreen and landscape (needs this tap). Computer: fullscreen keeps Esc for the game, so it
    // opens and closes the menu exactly and the mouse aims again at once. Never inside the editor's Game tab.
    if (!embed && settings.fullscreen && (IS_MOBILE || CAN_KEEP_ESCAPE) && !isFullscreen()) void enterFullscreen();
  });
  // Entering fullscreen may cost the pointer lock (browser-made, so it can be retaken without a click).
  document.addEventListener('fullscreenchange', () => {
    if (IS_MOBILE || !isFullscreen()) return;
    void keepEscape();
    if (pausedAt !== null && performance.now() - pausedAt < 1500) void input.lock();
  });
  if (touch) {
    // The layout editor: the controls shown over the paused game, draggable.
    screens.onEditLayout(
      () => {
        hud.show(true);
        touch.setEditing(true);
      },
      () => {
        touch.setEditing(false);
        hud.show(false);
        saveSettings(settings);
      },
      () => touch.resetLayout(),
    );
  }
  // The exit (after its confirmation): back to the home screen, or to editing in the editor's Game tab.
  screens.onExit(() => {
    conn?.close();
    // In the editor's Game tab: back to editing (the editor stops the game, as ■).
    if (embed) return embed.exit();
    location.reload();
  });
  // Desktop: clicking the game takes the mouse back (on phones the menu's button resumes).
  if (!IS_MOBILE) {
    ctx.renderer.domElement.addEventListener('click', () => {
      // Playing on a controller leaves the cursor free: a click hands the game back to the mouse.
      if (!input.locked || !document.pointerLockElement) {
        input.padActive = false;
        void input.lock();
      }
    });
  }
  /** When the pause menu opened (null: not paused, or the start menu that comes before playing). */
  let pausedAt: number | null = null;
  input.onLockChange = (locked) => {
    document.documentElement.classList.toggle('playing', locked);
    if (!locked) {
      touch?.reset();
      chat.close();
    }
    if (locked) {
      pausedAt = null;
      screens.hideMenu();
      hud.show(true);
    } else if (!embed?.frozen) {
      // Frozen by the editor's ❚❚: its veil says so, the pause menu waits for ▶.
      pausedAt = performance.now();
      screens.showMenu('pause');
      refreshMenu();
    }
  };
  // Computer: Esc opens the pause menu and, inside it, goes back one level: the exit's confirmation, then the
  // open tab, then the game (a key being bound takes its Esc first: it listens before this).
  // - In fullscreen the game keeps Esc (keepEscape): it pauses by letting go of the mouse itself, which the
  //   browser lets it take back without a click, so closing the menu has the mouse aiming at once.
  // - Elsewhere the browser takes the Esc that pauses and only gives the mouse back on a click or another key:
  //   the last Esc closes the menu and play resumes, the mouse coming back with the first key or click.
  // The Esc that opened the menu may be seen after it did (its time is earlier): never a second press.
  if (!IS_MOBILE)
    window.addEventListener('keydown', (e) => {
      if (e.code !== 'Escape' || e.repeat) return;
      if (input.locked) {
        if (escapeIsKept() && !chat.isOpen) {
          e.preventDefault();
          input.unlock();
        }
        return;
      }
      if (pausedAt !== null && e.timeStamp <= pausedAt) return;
      // The start card has tabs too: Esc closes them, but never starts the match.
      if (screens.visible && screens.back()) {
        e.preventDefault();
        return;
      }
      if (pausedAt === null) return;
      e.preventDefault();
      sfx.ui();
      void input.lock().then((got) => {
        if (got || input.locked) return;
        input.setPlaying(true);
        hud.notice(t('aimOnNextKey'));
      });
    });

  /** A new life: at a spawn point, full magazines, the primary in hand, the death screen gone. */
  function comeBack() {
    respawn();
    for (const g of Object.values(guns)) g.refill();
    holdSlot('primaria', false);
    drawT = 0;
    thrower.refill();
    hud.showDeath(null);
    killerId = null;
    myCorpseId = null;
    deathMessage = null;
  }

  // --- Simulation tick ------------------------------------------------------------------------------
  let lunging = false;
  let stateTimer = 0;
  const step = (dt: number) => {
    // Offline the world pauses with the menu; online it keeps going (other players don't wait).
    if (!input.locked && !net) return;
    const tSim = performance.now();
    stepInner(dt);
    simMsAvg += (performance.now() - tSim - simMsAvg) * 0.05;
  };
  const stepInner = (dt: number) => {
    simTime += dt;
    net?.update(dt);
    updatePickups();

    if (player.dead) {
      // Dose Dupla: dying between the two throws loses the second one (it must not fly as we respawn).
      secondThrowIn = null;
      // Zumbi: dead during a wave means back at the break (the zombie side writes the death card's line).
      if (!zombies || zombies.canRespawn()) {
        hud.setDeathTimer(player.respawnIn(simTime));
        if (player.canRespawn(simTime)) comeBack();
      }
    } else {
      // Zumbi: down (waiting for a revive) we can't move, shoot or throw; reviving someone, we don't shoot.
      const downed = !!zombies?.downed;
      player.eyeScale = downed ? 0.32 : 1;
      // Shots have priority over the sprint (dropped the same tick, see `move.sprint`) and over a grenade
      // in hand (the pin goes back in). They never interrupt a reload (no shooting until it ends; the knife
      // and grenades do cancel it), a knife swing (too quick: cancelling it would be an exploit) or a dance
      // (only death ends it). A slide keeps going: you can shoot while sliding.
      const canShoot = !bladeOnly && !weapon.reloading && !melee.swinging && !taunt.active && drawT <= 0 && !downed && !zombies?.busyHands;
      const fireIntent = canShoot && (input.down('fire') || input.peek('fire'));
      if (fireIntent) {
        if (thrower.cookT !== null) thrower.cancel();
        thrower.endFollowThrough();
      }

      const dancing = taunt.active;
      // Humiliation start: E while standing over a fresh corpse.
      if (input.consume('taunt') && !fireIntent && !dancing && !melee.swinging && !thrower.busy) {
        // Zumbi first: the Mystery Coffin (or a teammate down, held below).
        if (zombies?.press()) {
          /* used */
        } else {
          const corpse = nearestHumiliable(humiliables(), playerFeet(feet), HUMILIATION.radius, simTime);
          if (corpse) {
            weapon.cancelReload();
            taunt.start(corpse, player.yaw, simTime, (d) => sfx.danceMusic(d));
          } else if (nearPotion()) drinkPotion();
        }
      }
      zombies?.hold(input.down('taunt') && !fireIntent);
      // Zumbi: the weapon the coffin offers us, left there for the others (Z) or turned down (X).
      if (input.consume('donate')) zombies?.donate();
      if (input.consume('refuse')) zombies?.refuse();
      // The melee key swings the knife; with only a blade in hand (the lightsaber) the fire button does too.
      const swing = input.consume('melee') || (bladeOnly && (input.consume('fire') || input.down('fire')));
      if (swing && !fireIntent && !taunt.active && !thrower.busy && !downed) startMelee();

      // Grenade: hold G to cook, release to throw.
      const gEv = thrower.update(dt, input.down('grenade'), input.consume('grenade'), !fireIntent && !taunt.active && !melee.swinging && !downed);
      if (gEv?.type === 'pin') {
        sfx.pinPull();
        weapon.cancelReload();
        lastBeep = Math.ceil(grenadeData.pavio);
      } else if (gEv?.type === 'throw') {
        throwGrenade(gEv.fuseLeft);
        if (gEv.double) secondThrowIn = DOUBLE_THROW_GAP; // Dose Dupla: the second one follows
      } else if (gEv?.type === 'mine') {
        plantMine();
      } else if (gEv?.type === 'inHand') {
        const at = handPosition(new THREE.Vector3(-Math.sin(player.yaw), 0, -Math.cos(player.yaw)), new THREE.Vector3());
        const id = grenadeSeq++;
        conn?.send({ t: 'grenade', id, p: vec3(at), v: [0, 0, 0], fuse: 0 });
        explode(at, id);
      }
      if (secondThrowIn !== null) {
        secondThrowIn -= dt;
        if (secondThrowIn <= 0) {
          secondThrowIn = null;
          if (!player.dead) {
            throwGrenade(0);
            thrower.throwT = 0;
          }
        }
      }
      // Our mines: an enemy stepping close sets one off.
      if (mines.own > 0) {
        const enemies = net ? net.targets().filter((p) => !p.dead).map((p) => p.position) : [...dummies.list, ...(bots?.bots ?? [])].filter((d) => !d.dead).map((d) => d.position);
        for (const m of mines.triggered(enemies)) explode(m.position, m.id);
      }
      const fuse = thrower.fuseLeft;
      if (fuse !== null && Math.ceil(fuse) < lastBeep) {
        lastBeep = Math.ceil(fuse);
        sfx.fuseBeep(1 - fuse / grenadeData.pavio);
      }

      const locked = taunt.active || downed; // no moving, shooting or aiming while dancing (or down)
      let lunge: MoveInput['lunge'] = null;
      const wasLunging = lunging;
      if (melee.lunging && melee.target) {
        const p = melee.target.position;
        player.eye(1, eye);
        const dx = p.x - eye.x;
        const dz = p.z - eye.z;
        const dist = Math.hypot(dx, dz);
        // Close in until we're comfortably in reach, then stop.
        if (dist > melee.data.alcance * 0.6) {
          const v = melee.data.velocidadeInvestida;
          lunge = { x: (dx / dist) * v, z: (dz / dist) * v };
        }
      }
      lunging = lunge !== null;
      if (wasLunging && !lunging) {
        // End of the lunge: bleed off its speed so we stop at the target instead of sliding through it.
        const v = player.move.vel;
        const sp = Math.hypot(v.x, v.z);
        if (sp > 2) {
          v.x *= 2 / sp;
          v.z *= 2 / sp;
        }
      }
      const move: MoveInput = {
        forward: locked ? 0 : input.axis('forward', 'back', input.move.forward),
        right: locked ? 0 : input.axis('right', 'left', input.move.right),
        jump: !locked && (input.down('jump') || input.consume('jump')),
        crouch: !locked && input.down('crouch'),
        sprint: !locked && !melee.swinging && !fireIntent && input.down('sprint'),
        ads: !locked && !bladeOnly && !melee.swinging && !thrower.busy && input.down('ads'),
        yaw: player.yaw,
        speedMul: (bladeOnly ? 1 : weapon.data.movimento) * body.speedMul * potionSpeed() * (zombies?.speedMul() ?? 1) * (simTime < rushUntil ? rushMul : 1),
        lunge,
      };
      const ev = player.fixedStep(dt, move, simTime);
      if (ev.landed) {
        sfx.land(ev.fallHeight > 2.5);
        viewmodel.landed(ev.fallHeight);
      }
      if (ev.footstep) sfx.footstep(player.groundMaterial(), ev.footstep);
      if (player.move.slideStarted) {
        sfx.slide(player.groundMaterial());
        viewmodel.landed(1);
      }
      // Dust kicked up while sliding.
      if (player.move.sliding && Math.random() < 0.35) {
        playerFeet(feet);
        effects.burst('debris', feet.setY(feet.y + 0.05), UP, 2, 0xb8aa90);
      }
      if (ev.selfDamage) conn?.send({ t: 'selfDamage', amount: ev.selfDamage.amount, cause: ev.selfDamage.cause });
      dogTick();
      if (ev.damaged) {
        hud.damageFlash(ev.damaged);
        sfx.hurt();
      }
      if (ev.died) {
        taunt.cancel(simTime);
        dropCookedGrenade();
        sfx.sadTrombone();
        // Killed by a bot: the manager already recorded it; anything else is a death on our own.
        if (bots && ev.died !== 'killed') bots.kill(playerTarget, null, { kind: ev.died });
        const own = ev.died === 'killed' ? null : pick(DEATH_MESSAGES[getLang()][ev.died]);
        hud.showDeath(ev.died === 'killed' ? (deathMessage ?? '💀') : own!);
        hud.setDeathTimer(player.respawnIn(simTime));
        // Solo zumbi: nobody to revive us, the run is over.
        localZombies?.died();
      } else if (!player.dead) {
        if (melee.update(dt) === 'impact') resolveMelee();
        const done = taunt.update(dt, simTime);
        if (done) finishTaunt(done);
        // Switching guns: 1 and 2 pick a slot, the wheel (or the swap button) goes to the other one. Not with
        // the hands busy (knife, dance, a grenade in hand): those presses are dropped.
        const pick1 = input.consume('weapon1');
        const pick2 = input.consume('weapon2');
        const swap = input.consume('swapWeapon');
        if (!taunt.active && !melee.swinging && !thrower.busy) {
          if (pick1) switchTo('primaria');
          if (pick2) switchTo('secundaria');
          if (swap) switchTo(slot === 'primaria' ? 'secundaria' : 'primaria');
        }
        drawT = Math.max(0, drawT - dt);
        const busy = taunt.active || melee.swinging || thrower.busy || drawT > 0 || downed || !!zombies?.busyHands;
        // Only a blade in hand: no gun to aim, fire or reload.
        if (bladeOnly) input.consume('reload');
        else weapon.update(dt, {
          fireHeld: !busy && input.down('fire'),
          firePressed: input.consume('fire') && !busy,
          adsHeld: !busy && input.down('ads'),
          reloadPressed: input.consume('reload') && !busy,
          sprinting: player.move.sprinting,
          grounded: player.move.grounded,
          crouched: player.move.crouched,
          speed: player.horizontalSpeed,
          holdFire: busy,
        });
      }
    }
    // Presses that arrived while dead shouldn't fire later.
    if (player.dead) {
      for (const a of ['fire', 'reload', 'jump', 'melee', 'taunt', 'grenade', 'weapon1', 'weapon2', 'swapWeapon'] as const) input.consume(a);
    }

    for (const ex of grenades.fixedUpdate(dt)) explode(ex.position, ex.id);
    bots?.fixedUpdate(dt, simTime);
    // Solo zumbi: the match runs here, on the game clock.
    if (localZombies) localZombies.step(dt, vec3(playerFeet(feet)), player.move.grounded, !player.dead);
    if (playerRig) {
      // The hitboxes take the pose the others see (crouch, aim, reload...).
      const pose: HitPose = taunt.active
        ? { kind: 'dance', t: taunt.t }
        : {
            kind: 'armed',
            pose: {
              speed: player.horizontalSpeed,
              vel: { x: player.move.vel.x, z: player.move.vel.z },
              yaw: player.yaw,
              grounded: player.move.grounded,
              sprint: player.move.sprinting,
              crouch: player.move.crouched,
              slide: player.move.sliding,
              pitch: player.pitch,
              ads: weapon.ads > 0.5,
              reload: weapon.reloading,
              knife: melee.swinging,
              blade: bladeOnly,
              cook: thrower.cookT !== null,
              secondary: slot === 'secundaria',
              hold: holdOf(weapon.data.arma),
            },
          };
      playerRig.follow(playerFeet(feet), player.yaw, !player.dead, pose, dt);
    }
    dummies.fixedUpdate(dt, simTime, (spot) => {
      const tr = player.mb.body.translation();
      return !player.dead && Math.hypot(tr.x - spot.x, tr.z - spot.z) < 0.9 && Math.abs(player.feet - spot.y) < 1.8;
    });
    physics.world.step();

    // Upload our state at NET.stateRate.
    if (conn && !player.dead) {
      stateTimer += dt;
      if (stateTimer >= 1 / NET.stateRate) {
        stateTimer = 0;
        const f =
          (player.move.crouched ? FLAG.crouch : 0) |
          (player.move.sprinting ? FLAG.sprint : 0) |
          (weapon.ads > 0.5 ? FLAG.ads : 0) |
          (weapon.reloading ? FLAG.reload : 0) |
          (taunt.active ? FLAG.dance : 0) |
          (thrower.cookT !== null ? FLAG.cook : 0) |
          (player.move.grounded ? FLAG.grounded : 0) |
          (melee.swinging ? FLAG.knife : 0) |
          (player.move.sliding ? FLAG.slide : 0) |
          (slot === 'secundaria' ? FLAG.secondary : 0);
        playerFeet(feet);
        conn.send({ t: 'state', s: { p: vec3(feet), yaw: +player.yaw.toFixed(3), pitch: +player.pitch.toFixed(3), f } });
      }
    }
  };

  // --- Render frame ---------------------------------------------------------------------------------
  let showDebug = false;
  // F4 cycles: characters' hitboxes → characters + map colliders (and the bots' navmesh) → off.
  type DebugView = 'off' | 'chars' | 'all';
  let debugView: DebugView = 'off';
  const worldDebug = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.8 }));
  worldDebug.frustumCulled = false;
  worldDebug.visible = false;
  ctx.scene.add(worldDebug);
  // What moves (characters' blockers and movement bodies, grenades, doors) is drawn every frame: a snapshot
  // a fraction of a second old trails behind a running player like a second one.
  const movingDebug = new THREE.LineSegments(new THREE.BufferGeometry(), worldDebug.material);
  movingDebug.frustumCulled = false;
  movingDebug.visible = false;
  ctx.scene.add(movingDebug);
  let worldDebugAge = Infinity;
  const fillDebug = (lines: THREE.LineSegments, { vertices, colors }: RAPIER.DebugRenderBuffers) => {
    lines.geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
    lines.geometry.setAttribute('color', new THREE.BufferAttribute(colors, 4));
    lines.geometry.computeBoundingSphere();
  };
  /** Fixed map colliders from Rapier's debug renderer. */
  const refreshWorldDebug = () => {
    fillDebug(worldDebug, physics.world.debugRender(RAPIER.QueryFilterFlags.ONLY_FIXED));
    worldDebugAge = 0;
  };
  /** Moving colliders, but not character hitboxes (they have their own view) nor our own body (the camera's inside it). */
  const refreshMovingDebug = () => {
    const own = [player.mb.body.handle, playerRig?.body.handle];
    fillDebug(
      movingDebug,
      physics.world.debugRender(RAPIER.QueryFilterFlags.EXCLUDE_FIXED, (c) => ((c.collisionGroups() >>> 16) & GROUP.HITBOX) === 0 && !own.includes(c.parent()?.handle)),
    );
  };
  let hudTimer = 0;
  let fpsAvg = 60;
  let sprintVis = 0;
  let slideVis = 0;
  let renderTime = 0;
  const fpPos = new THREE.Vector3();
  const fpQuat = new THREE.Quaternion();
  const earFwd = new THREE.Vector3();
  const earUp = new THREE.Vector3();
  const tpPos = new THREE.Vector3();
  const tpQuat = new THREE.Quaternion();
  const euler = new THREE.Euler(0, 0, 0, 'YXZ');
  const mapFrame = {
    feet,
    listener: ctx.camera.position,
    launch: (vx: number, vy: number, vz: number) => player.launch(vx, vy, vz),
    get time() {
      return clock();
    },
  };
  const deathCamPos = new THREE.Vector3();
  let deathFloorAt = -1;
  let deathFloorY = 0;
  const deathCamLook = new THREE.Vector3();
  const lookM = new THREE.Matrix4();

  let simMsAvg = 0;
  let renderMsAvg = 0;
  const tuning = new TuningPanel({ 'Primeira pessoa (VM_FEEL)': VM_FEEL, 'Terceira pessoa (ANIM)': ANIM }, (section) => {
    if (section.startsWith('Primeira')) viewmodel.retune();
  });
  // Aim assist (touch and controller, never the mouse; off by default): slows the look over an enemy and
  // follows them while the player is aiming (gameplay/aimAssist.ts).
  const aimAssist = new AimAssist();
  let lastAimInput = 99;
  const render = (alpha: number, frameDt: number) => {
    const tRender = performance.now();
    renderTime += frameDt;
    const [mdx, mdy] = input.takeMouse();
    if (input.consume('debug')) showDebug = !showDebug;
    // F6: live tuning of the first- and third-person feel. It stays open while playing (Esc frees the mouse
    // to move the sliders; click the game to go back and feel the change).
    if (input.consume('tuning')) tuning.toggle();
    if (input.consume('hitboxes')) {
      debugView = debugView === 'off' ? 'chars' : debugView === 'chars' ? 'all' : 'off';
      const chars = debugView !== 'off';
      dummies.setDebug(chars);
      net?.setDebug(chars);
      bots?.setDebug(chars);
      zombies?.setDebug(chars);
      const navDebug = (window as unknown as { __ocNavDebug?: THREE.Object3D }).__ocNavDebug;
      if (navDebug) navDebug.visible = debugView === 'all';
      worldDebug.visible = movingDebug.visible = debugView === 'all';
      if (worldDebug.visible) refreshWorldDebug();
      hud.notice(t(debugView === 'chars' ? 'debugViewChars' : debugView === 'all' ? 'debugViewAll' : 'debugViewOff'));
    }
    // Map colliders can still be removed or added (props): a few times per second is enough for them.
    if (worldDebug.visible && (worldDebugAge += frameDt) > 0.2) refreshWorldDebug();
    if (movingDebug.visible) refreshMovingDebug();

    // Mouse look is applied per render frame for minimum latency; ADS scales by the zoom.
    if (input.locked && !player.dead && !taunt.active) {
      const zoomMul = 1 + (weapon.data.ads.zoom - 1) * weapon.ads;
      const adsMul = 1 + (settings.adsSensitivity - 1) * weapon.ads;
      lastAimInput = mdx || mdy || input.move.forward || input.move.right || gamepad.sinceStick < 0.05 ? 0 : lastAimInput + frameDt;
      const assist =
        settings.aimAssist && gamepad.device !== 'mouse'
          ? aimAssist.update(ctx.camera.position, player.yaw, player.pitch, targets(), frameDt, lastAimInput < 0.3)
          : { slow: 1, dYaw: 0, dPitch: 0 };
      const k = settings.sensitivity * MOUSE_DEG_PER_COUNT * DEG * zoomMul * adsMul * assist.slow;
      player.yaw -= mdx * k;
      player.pitch -= mdy * k * (settings.invertY ? -1 : 1);
      player.yaw += assist.dYaw;
      player.pitch += assist.dPitch;
      player.pitch = THREE.MathUtils.clamp(player.pitch, -89 * DEG, 89 * DEG);
    }

    sprintVis += ((player.move.sprinting ? 1 : 0) - sprintVis) * (1 - Math.exp(-8 * frameDt));
    slideVis += ((player.move.sliding ? 1 : 0) - slideVis) * (1 - Math.exp(-10 * frameDt));
    const cam = ctx.camera;
    player.eye(alpha, fpPos);
    const myCorpse = myCorpseId !== null ? (net?.corpses.get(myCorpseId) ?? bots?.corpses.get(myCorpseId)) : undefined;
    if (player.dead && myCorpse) {
      // Online death cam: behind our body, looking at whoever killed us (so we see the humiliation).
      const corpse = myCorpse.corpseCenter(new THREE.Vector3());
      const killer = killerId !== null ? (net?.players.get(killerId) ?? bots?.bots.find((b) => b.id === killerId)) : undefined;
      const focus = killer && killer.alive ? tmp.copy(killer.position).setY(killer.position.y + 1.1) : corpse;
      const away = new THREE.Vector3().subVectors(corpse, focus).setY(0);
      if (away.lengthSq() < 0.01) away.set(0, 0, 1);
      away.normalize();
      const wantPos = new THREE.Vector3().copy(corpse).addScaledVector(away, 3).setY(corpse.y + 2.2);
      const k = 1 - Math.exp(-4 * frameDt);
      if (simTime - player.deathAt < 0.05) {
        deathCamPos.copy(fpPos);
        deathCamLook.copy(focus);
      }
      deathCamPos.lerp(wantPos, k);
      deathCamLook.lerp(focus, k);
      lookM.lookAt(deathCamPos, deathCamLook, UP);
      fpPos.copy(deathCamPos);
      fpQuat.setFromRotationMatrix(lookM);
    } else {
      // Waiting to join a zumbi wave isn't a death: the view stays put at the spawn spot, no fall and no tilt.
      if (player.dead && !zombies?.waitingToJoin) {
        // Offline death cam: drop to the floor under the death spot (also when killed mid-air) and tilt.
        if (deathFloorAt !== player.deathAt) {
          deathFloorAt = player.deathAt;
          const hit = physics.world.castRay(new RAPIER.Ray({ x: fpPos.x, y: fpPos.y, z: fpPos.z }, { x: 0, y: -1, z: 0 }), 80, true, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, WORLD_ONLY);
          deathFloorY = hit ? fpPos.y - hit.timeOfImpact : fpPos.y - 1.2;
        }
        const d = Math.min(1, (simTime - player.deathAt) / 0.6);
        fpPos.y += (deathFloorY + 0.4 - fpPos.y) * d * d;
        euler.set(player.pitch * (1 - d) - d * 0.4, player.yaw, d * 0.5);
      } else {
        // Sliding rolls the camera slightly.
        euler.set(player.pitch + weapon.recoilPitch * DEG, player.yaw - weapon.recoilYaw * DEG, slideVis * 0.07);
      }
      // Explosion camera shake (trauma squared, decays quickly).
      if (shake > 0) {
        const k = shake * shake;
        const tt = renderTime * 40;
        euler.x += Math.sin(tt * 1.3) * 0.035 * k;
        euler.y += Math.sin(tt * 1.7 + 1) * 0.035 * k;
        euler.z += Math.sin(tt * 2.1 + 2) * 0.02 * k;
      }
      // The drunk potion: the view sways (the aim follows the crosshair, not the swaying).
      if (potionKind === 'bebado' && !player.dead) {
        euler.z += Math.sin(renderTime * 1.1) * 0.07;
        euler.x += Math.sin(renderTime * 0.83 + 1) * 0.025;
        euler.y += Math.sin(renderTime * 0.61 + 2) * 0.03;
      }
      fpQuat.setFromEuler(euler);
    }
    shake = Math.max(0, shake - frameDt * 1.6);

    // Humiliation: blend into an orbiting third-person camera and show the dancing avatar.
    const blend = taunt.blend;
    playerFeet(feet, alpha);
    if (taunt.active) {
      taunt.cameraPose(physics, feet, tpPos, tpQuat);
      cam.position.lerpVectors(fpPos, tpPos, blend);
      cam.quaternion.slerpQuaternions(fpQuat, tpQuat, blend);
      avatar.root.position.copy(feet);
      avatar.root.rotation.y = player.yaw;
      avatar.dance(taunt.t);
    } else {
      cam.position.copy(fpPos);
      cam.quaternion.copy(fpQuat);
    }
    // The ears follow the camera.
    sfx.setListener(cam.position, earFwd.set(0, 0, -1).applyQuaternion(cam.quaternion), earUp.set(0, 1, 0).applyQuaternion(cam.quaternion), frameDt);
    avatar.visible = taunt.active && blend > 0.15;

    const zoom = 1 + (weapon.data.ads.zoom - 1) * weapon.ads;
    const fov = settings.fov * zoom * (1 + 0.05 * sprintVis + 0.08 * slideVis * (1 - weapon.ads));
    if (Math.abs(cam.fov - fov) > 0.01) {
      cam.fov = fov;
      cam.updateProjectionMatrix();
    }
    const vmFov = VM_FOV * (1 - 0.1 * weapon.ads);
    if (Math.abs(ctx.vmCamera.fov - vmFov) > 0.01) {
      ctx.vmCamera.fov = vmFov;
      ctx.vmCamera.updateProjectionMatrix();
    }
    cam.updateMatrixWorld();

    // Magnified scopes: fully aimed, the gun gives way to the scope view.
    const scopeView = viewmodel.scoped && weapon.ads > 0.85 && !player.dead && blend < 0.5;
    scopeEl.classList.toggle('hidden', !scopeView);
    viewmodel.root.visible = !player.dead && blend < 0.5 && !scopeView && !zombies?.downed;
    mines.update(frameDt);
    viewmodel.update(frameDt, {
      ads: weapon.ads,
      sprint: sprintVis,
      grounded: player.move.grounded,
      speed: player.horizontalSpeed,
      strafe: player.strafeSpeed,
      mouseDX: mdx,
      mouseDY: mdy,
      reload: weapon.reloadProgress,
      slide: slideVis,
      melee: melee.progress,
      grenadeCook: thrower.cookT,
      grenadeThrow: thrower.throwT,
      crouch: player.move.crouchT,
    });

    // Animation LOD: far or off-screen characters pose less often.
    Avatar.setCamera(ctx.camera);
    dummies.render(alpha, frameDt, simTime);
    bots?.render(alpha, frameDt);
    net?.render(frameDt);
    if (zombies) {
      zombies.update(frameDt);
      tintFog(ctx, zombies.bossWave, frameDt);
    }
    for (const b of bots?.bots ?? []) {
      const m = b.move;
      playBody(-b.id, { feet: b.position, alive: !b.dead, grounded: m.grounded, sprint: m.sprinting, crouch: m.crouched, slide: m.sliding, reload: b.weapon.reloading }, frameDt, () => b.weapon.reloadDuration, () => b.gun);
    }
    for (const p of net?.players.values() ?? []) {
      const f = p.flags;
      const w = { feet: p.position, alive: p.alive, grounded: !!(f & FLAG.grounded), sprint: !!(f & FLAG.sprint), crouch: !!(f & FLAG.crouch), slide: !!(f & FLAG.slide), reload: !!(f & FLAG.reload) };
      playBody(p.id, w, frameDt, () => p.gun.recarga.tatica, () => p.gun.arma);
    }
    grenades.render(alpha);
    effects.update(frameDt);
    map.update(frameDt, mapFrame);
    if (dog) {
      const near: THREE.Vector3[] = [];
      if (!player.dead) near.push(playerFeet(new THREE.Vector3(), alpha));
      for (const b of bots?.bots ?? []) if (!b.dead) near.push(b.position);
      for (const p of net?.targets() ?? []) if (!p.dead) near.push(p.position);
      dog.update(frameDt, near);
    }

    // Dynamic crosshair: the gap is the projected spread cone.
    const spread = weapon.spreadDeg({ grounded: player.move.grounded, sprinting: player.move.sprinting, speed: player.horizontalSpeed, crouched: player.move.crouched }) * DEG;
    const gap = (Math.tan(spread) / Math.tan((cam.fov * DEG) / 2)) * (window.innerHeight / 2) + 3;
    hud.setCrosshair(gap, weapon.ads < 0.6 && sprintVis < 0.5 && !player.dead && !taunt.active);

    // Context prompt: dancing progress, or "[E] Oprimir" over a fresh corpse.
    if (taunt.active && taunt.dummy) {
      hud.setPrompt(screens.keyName('taunt'), t('dancing', { name: taunt.dummy.name }), taunt.t / taunt.duration);
    } else {
      const corpse = !player.dead && input.locked ? nearestHumiliable(humiliables(), feet, HUMILIATION.radius, simTime) : null;
      const zp = zombies && input.locked ? zombies.prompt() : null;
      if (zp) hud.setPrompt(screens.keyName('taunt'), zp.text, zp.frac);
      else if (corpse) hud.setPrompt(screens.keyName('taunt'), t('promptTaunt', { name: corpse.name }), corpse.humiliationTimeLeft(simTime) / HUMILIATION.window);
      else if (input.locked && nearPotion()) hud.setPrompt(screens.keyName('taunt'), t('promptPotion'), 1);
      else hud.setPrompt(null);
    }

    // Grenade HUD: fuse bar while cooking, warning pointing at any live grenade within its blast radius.
    const fuseLeft = thrower.fuseLeft;
    hud.setCook(fuseLeft === null ? null : fuseLeft / grenadeData.pavio);
    let warnAngle: number | null = null;
    let warnClose = 0;
    if (!player.dead) {
      let bestD = grenadeData.explosao.raioDano;
      for (const g of grenades.live) {
        const gp = g.mesh.position;
        const dist = gp.distanceTo(feet);
        if (dist > bestD) continue;
        bestD = dist;
        const dx = gp.x - feet.x;
        const dz = gp.z - feet.z;
        const fwd = -Math.sin(player.yaw) * dx - Math.cos(player.yaw) * dz;
        const side = Math.cos(player.yaw) * dx - Math.sin(player.yaw) * dz;
        warnAngle = Math.atan2(side, fwd);
        warnClose = 1 - dist / grenadeData.explosao.raioDano;
      }
    }
    hud.setGrenadeWarning(warnAngle, warnClose);

    // Scoreboard (Tab, online).
    const showBoard = (!!net || !!bots) && input.locked && input.down('scoreboard');
    scoreboard.visible = showBoard;
    if (showBoard && net && online) scoreboard.update(net.info.values(), me, online.joined.session.name);
    if (showBoard && bots && botMode) scoreboard.update(bots.standings(), me, t('botsSubtitle', { n: botMode.count, mode: gameModeName(botMode.game) }));

    hud.update(frameDt);
    damageNumbers.update(frameDt, ctx.camera);
    // Every frame (the bar and the ring move): the reload, and what the touch buttons show.
    hud.setReload(weapon.reloadProgress);
    touch?.setStatus(thrower.count, weapon.reloadProgress, weapon.mag <= weapon.data.pente * 0.3 && weapon.reserve > 0, thrower.rechargeProgress);
    sfx.setMuffled(player.dead ? 0 : Math.max(0, (HEALTH.lowThreshold - player.health) / HEALTH.lowThreshold));

    quality.beforeRender();
    ctx.render();
    if (input.locked) quality.update(frameDt);
    renderMsAvg += (performance.now() - tRender - renderMsAvg) * 0.05;

    fpsAvg += (1 / Math.max(frameDt, 1e-4) - fpsAvg) * 0.05;
    hudTimer -= frameDt;
    if (hudTimer <= 0) {
      hudTimer = 1 / 15;
      hud.setHealth(player.health, player.maxHealth);
      hud.setBoost(!!boostEnds);
      hud.setBuffs(buffs());
      hud.setAmmo(weapon.mag, weapon.reserve, weapon.data.pente, weapon.reloading);
      hud.setWeaponSlots(
        (['primaria', 'secundaria'] as const)
          .filter((s) => !bladeOnly && gunIn(loadout, s))
          // On a controller there's no key per slot (the D-pad switches): no key cap.
          .map((s) => ({ key: gamepad.device === 'pad' ? '' : screens.keyName(s === 'primaria' ? 'weapon1' : 'weapon2'), name: slotName(s), mag: guns[s].mag, reserve: guns[s].reserve, active: s === slot, rarity: slotRarity(s) || undefined, damaged: slotDamaged(s) || undefined })),
        drawT > 0,
      );
      hud.setGrenades(thrower.count, thrower.data.quantidade, thrower.rechargeProgress);
      const standing = net?.info.get(me) ?? bots?.standings().find((p) => p.id === me);
      hud.setScore(standing ? standing.score : points, standing ? standing.kills : kills, shots ? hits / shots : 0);
      // Corrida armada: our step on the ladder, and the round's winner with the countdown to the next.
      watchLadder();
      watchZombieItems();
      const l = myLadder();
      hud.setLadder(l && { step: l.step, total: FINAL_STEP + 1, name: stepName(l.step), kills: l.kills, need: killsForStep(l.step), final: l.step === FINAL_STEP });
      if (roundOver) hud.showRoundEnd(roundOver.title, t('roundNext', { s: Math.max(0, Math.ceil(roundOver.restartAt - clock())) }), roundOver.won);
      // The menu over a running match follows it (the wave, the players, the ladder, the coffin).
      refreshMenu();
      if (showDebug) {
        const info = ctx.renderer.info;
        const pos = cam.position;
        hud.setDebug(
          [
            `FPS ${fpsAvg.toFixed(0)}   draw calls ${info.render.calls}   tris ${(info.render.triangles / 1000).toFixed(1)}k`,
            `GPU ${quality.gpu}${quality.software ? '  ⚠ SOFTWARE' : ''}`,
            `CPU sim ${simMsAvg.toFixed(2)} ms/tick   render ${renderMsAvg.toFixed(2)} ms/frame   map build ${mapBuildMs.toFixed(0)} ms (${map.stats.meshes} meshes, ${map.stats.colliders} colliders)`,
            `quality ${quality.current}   pixel ratio ${quality.pixelRatio.toFixed(2)}   shadows ${ctx.renderer.shadowMap.enabled}`,
            ...(conn && net ? [`online: ${net.players.size + 1} jogadores   ping ${conn.rtt.toFixed(0)} ms   interp ${NET.interpDelayMs} ms`] : []),
            `pos ${pos.x.toFixed(1)} ${pos.y.toFixed(1)} ${pos.z.toFixed(1)}   speed ${player.horizontalSpeed.toFixed(2)} m/s`,
            `grounded ${player.move.grounded}  crouch ${player.move.crouched}  sprint ${player.move.sprinting}  slide ${player.move.sliding}`,
            `spread ${(spread / DEG).toFixed(2)}°  ads ${weapon.ads.toFixed(2)}  recoil ${weapon.recoilPitch.toFixed(2)}° / ${weapon.recoilYaw.toFixed(2)}°`,
            `last TTK ${lastTtk !== null ? `${(lastTtk * 1000).toFixed(0)} ms` : '-'}   ideal ${(idealTtk(weapon.data) * 1000).toFixed(0)} ms   last hit ${lastHitDist.toFixed(1)} m`,
            `shots ${shots}  hits ${hits}  time ${renderTime.toFixed(0)} s`,
          ].join('\n'),
        );
      } else {
        hud.setDebug(null);
      }
    }
  };

  // Dev-only handle for automated smoke tests and console poking.
  if (import.meta.env.DEV) {
    Object.assign(window, {
      __oc: {
        player, guns, melee, taunt, thrower, grenades, input, dummies, net, conn, me, ctx, physics, quality, map, effects, bots, nav, RAPIER,
        mines, progress, zombies, localZombies, sfx,
        get weapon() {
          return weapon;
        },
        trace: (o: THREE.Vector3, d: THREE.Vector3) => traceShot(physics, registry, o, d, weapon.data.alcanceMaximo, playerRig?.body, weapon.data.penetracao),
        stats: () => ({ shots, hits, kills, points, lastTtk }),
        perf: () => ({ boot, mapBuildMs, map: map.stats, simMsAvg, renderMsAvg, calls: ctx.renderer.info.render.calls, tris: ctx.renderer.info.render.triangles }),
      },
    });
  }

  // Render one frame behind the "click to play" card so the map is visible, then hand over to the loop.
  render(1, 0);
  mark('firstFrame');
  screens.showMenu('start');
  refreshMenu();
  // Every handler exists now: messages that arrived while the map was being built go through.
  conn?.release();
  if (!embed) {
    startLoop(step, render);
    return;
  }
  // The editor's Game tab: frozen by its ❚❚ (nothing simulated or drawn; the time frozen doesn't pile up), and ■
  // lets go of the mouse, the sounds and the renderer's context before the editor removes this page.
  let gone = false;
  startLoop(
    (dt) => {
      if (!embed.frozen && !gone) step(dt);
    },
    (alpha, frameDt) => {
      if (!embed.frozen && !gone) render(alpha, frameDt);
    },
  );
  embed.ready({
    pause() {
      if (embed.frozen || gone) return;
      embed.frozen = true;
      embed.veil(true);
      screens.hideMenu();
      input.unlock();
    },
    resume() {
      if (!embed.frozen || gone) return;
      embed.frozen = false;
      embed.veil(false);
      window.focus();
      sfx.unlock();
      // The click on ▶ reaches this page: the mouse comes back at once where the browser allows, else the pause
      // menu asks for a click.
      void input.lock().then((got) => {
        if (got || input.locked || gone) return;
        pausedAt = performance.now();
        screens.showMenu('pause');
      });
    },
    dispose() {
      if (gone) return;
      gone = true;
      embed.frozen = true;
      input.unlock();
      if (document.pointerLockElement) document.exitPointerLock();
      sfx.dispose();
      ctx.renderer.dispose();
      ctx.renderer.forceContextLoss();
    },
    memory: () => ({ geometries: ctx.renderer.info.memory.geometries, textures: ctx.renderer.info.memory.textures }),
  });
  // P52: the editor's ▶ click still counts in this page (the browser hands a click's activation to the same-origin
  // pages of the tab, for a few seconds): the sound and the mouse start at once, as the "Jogar" card would. When it
  // doesn't (the map took too long to build, or the browser won't), the card stays and asks for a click.
  if (embed.activated()) {
    sfx.unlock();
    void input.lock();
  }
}

/** The map editor's game (its Game tab), if this page is one: it's told when the game can't start. */
const editorGame = editorPlay();
boot().catch((err) => {
  console.error(err);
  editorGame?.failed(err);
  const tip = document.getElementById('loading-tip');
  if (tip) tip.textContent = `Erro ao iniciar: ${err instanceof Error ? err.message : String(err)}`;
});
