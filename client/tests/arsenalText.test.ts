// Every weapon and upgrade of shared/data/progression.json has its name and description in both languages
// (client/ui/strings.ts): the Arsenal, the HUD and the kill feed show them by id.
import { describe, expect, it } from 'bun:test';
import { PROG_WEAPONS, PROGRESSION } from '@shared/progression';
import { GAME_MODE_IDS } from '@shared/modes';
import { LADDER } from '@shared/gunGame';
import { setLang, t, type Lang, type StringKey } from '../ui/strings';
import { TREE_ROWS } from '../ui/arsenalTree';

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
