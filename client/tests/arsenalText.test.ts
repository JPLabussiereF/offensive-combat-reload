// Every weapon and upgrade of shared/data/progression.json has its name and description in both languages
// (client/ui/strings.ts): the Arsenal, the HUD and the kill feed show them by id.
import { describe, expect, it } from 'bun:test';
import { PROG_WEAPONS, PROGRESSION } from '@shared/progression';
import { GAME_MODE_IDS } from '@shared/modes';
import { LADDER } from '@shared/gunGame';
import { setLang, t, type Lang, type StringKey } from '../ui/strings';
import { TREE_ROWS } from '../ui/arsenalTree';
import { UPGRADE_KINDS } from '../ui/arsenalCanvasLayout';

describe('textos do Arsenal', () => {
  for (const lang of ['pt-BR', 'en'] as Lang[]) {
    it(`toda arma e melhoria tem nome e descrição em ${lang}`, () => {
      setLang(lang);
      const missing: string[] = [];
      const check = (key: string) => {
        const text = t(key as StringKey);
        if (!text || text === 'undefined') missing.push(key);
      };
      // The tree's rows (client/ui/arsenalTree.ts), as the pause menu and the home's canvas name them, and every
      // weapon of every row (the old rifles and knives too).
      for (const r of TREE_ROWS) {
        check(`treeRow_${r.id}`);
        check(`cvRow_${r.id}`);
        check(`cvSlot_${r.id}`);
        for (const k of UPGRADE_KINDS) check(`cvUpgRow_${k}`);
        for (const w of r.armas) {
          check(`arma_${w}`);
          check(`armaDesc_${w}`);
        }
      }
      for (const w of PROG_WEAPONS) {
        check(`arma_${w}`);
        check(`armaDesc_${w}`);
        for (const u of PROGRESSION[w].melhorias) {
          check(`upg_${w}_${u.id}`);
          check(`upgDesc_${w}_${u.id}`);
          for (const [k, v] of Object.entries(u.efeitos)) {
            if (k === 'mira' || k === 'visual') continue;
            check(k === 'forma' || k === 'tipo' ? `fx_${k}_${v}` : `fx_${k}`);
          }
        }
      }
      expect(missing).toEqual([]);
    });
  }
});

describe('textos dos modos de jogo', () => {
  for (const lang of ['pt-BR', 'en'] as Lang[]) {
    it(`todo modo e todo degrau da corrida armada tem nome em ${lang}`, () => {
      setLang(lang);
      const missing: string[] = [];
      const check = (key: string) => {
        let text = '';
        try {
          text = t(key as StringKey);
        } catch {
          /* not there */
        }
        if (!text) missing.push(key);
      };
      for (const m of GAME_MODE_IDS) {
        check(`gameMode_${m}`);
        check(`gameModeDesc_${m}`);
      }
      for (const s of LADDER) check(`ladder_${s.id}`);
      expect(missing).toEqual([]);
    });
  }
});

describe('textos do menu de pausa', () => {
  // Every text of the pause menu (PF-11: the rail, the tabs, the exit's confirmation, the settings' sub-tabs).
  const KEYS = [
    'pmArsenalFootEditable', 'pmArsenalFootGuest', 'pmArsenalFootReadOnly', 'pmArsenalHintEditable', 'pmArsenalHintReadOnly', 'pmArsenalSubEditable',
    'pmArsenalSubReadOnly', 'pmBack', 'pmBadgeEditable', 'pmBadgeReadOnly', 'pmClose', 'pmCoffinBroken', 'pmCoffinFoot', 'pmCoffinHintOnline',
    'pmCoffinHintSolo', 'pmCoffinMul', 'pmCoffinOdds', 'pmConfigHint', 'pmConfigSub', 'pmConfirmBots', 'pmConfirmRace', 'pmConfirmRaceBots',
    'pmConfirmRange', 'pmConfirmSession', 'pmConfirmZombieAlone', 'pmConfirmZombieSolo', 'pmConfirmZombieTeam', 'pmDescAds', 'pmDescAssist',
    'pmDescFov', 'pmDescFullscreen', 'pmDescInvert', 'pmDescPadSens', 'pmDescQuality', 'pmDescSens', 'pmDescSpatial', 'pmDescVolume', 'pmEscFixed',
    'pmExitMatch', 'pmExitRace', 'pmExitRange', 'pmExitSession', 'pmHintBack', 'pmHintPick', 'pmHintResume', 'pmKeyPress', 'pmLadderFinal',
    'pmLadderFinalMany', 'pmLadderFinalOne', 'pmLadderGun', 'pmLadderHint', 'pmLadderNext', 'pmLadderNow', 'pmLadderSilenced', 'pmLadderToGo',
    'pmLadderToGoOne', 'pmLadderToWin', 'pmLadderToWinOne', 'pmLadderYou', 'pmLeader', 'pmLeaderOther', 'pmLeaderYou', 'pmLeave', 'pmLineBots',
    'pmLineRange', 'pmLineSession', 'pmLineWave', 'pmLineWaveAlone', 'pmLineWaveSolo', 'pmLineWaveTeam', 'pmLiveHorde', 'pmLiveOnline', 'pmMoreUpgrade',
    'pmMoreUpgrades', 'pmNextMatch', 'pmNoUpgrades', 'pmOff', 'pmOn', 'pmPadNote', 'pmPaused', 'pmPausedBots', 'pmPreview', 'pmRuleClimb',
    'pmRuleFinalMany', 'pmRuleFinalOne', 'pmRuleStab', 'pmStay', 'pmStayHint', 'pmSubAim', 'pmSubAudio', 'pmSubKeys', 'pmSubPad', 'pmSubTouch',
    'pmSubVideo', 'pmTabCoffin', 'pmTabCoffinSub', 'pmTabLadder', 'pmTabLadderSub', 'pmUpgradesUnlocked', 'pmWeaponsUnlocked', 'keyGroupMove',
    'keyGroupCombat', 'keyGroupOther',
  ];
  const PARAMS = { name: 'Rua', n: 3, max: 10, skill: 'Normal', total: 12, players: 3, file: 'a.glb', upgrade: 'X', xp: '1.000', prog: 'rifle', k: 1, need: 3, mag: 30, rpm: 700, weapon: 'Sabre', cost: 950, m: '1,4', wave: 'Onda 2/12' };
  for (const lang of ['pt-BR', 'en'] as Lang[]) {
    it(`todo texto existe e preenche os parâmetros em ${lang}`, () => {
      setLang(lang);
      const bad = KEYS.filter((k) => {
        const text = t(k as StringKey, PARAMS);
        return !text || text === 'undefined' || /[{}]/.test(text);
      });
      expect(bad).toEqual([]);
    });
  }

  it('os dois idiomas dizem coisas diferentes (nada ficou sem tradução)', () => {
    const same = KEYS.filter((k) => {
      setLang('pt-BR');
      const pt = t(k as StringKey, PARAMS);
      setLang('en');
      return pt === t(k as StringKey, PARAMS);
    });
    expect(same).toEqual([]);
  });
});
