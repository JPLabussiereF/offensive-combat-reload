// Scoreboard (section 5, held on Tab): the standings of the session or bots match. In corrida armada the
// ladder decides: players are ordered by step and kills on it, and a column shows the weapon (N/total).
import type { PlayerInfo } from '@shared/protocol';
import { FINAL_STEP, killsForStep } from '@shared/gunGame';
import { t } from './strings';

export class Scoreboard {
  private el = document.getElementById('scoreboard')!;
  private body = document.getElementById('scoreboard-body')!;
  private key = '';

  /** `ladder`: corrida armada (the weapon column, ordered by the ladder). */
  constructor(private ladder = false) {
    document.getElementById('scoreboard-title')!.textContent = t('scoreboard');
    const head = ['#', t('player'), t('level'), ...(ladder ? [t('ladderShort')] : []), t('points'), t('kills'), t('deaths'), t('humiliationsShort'), 'Ping'];
    document.getElementById('scoreboard-head')!.innerHTML = head.map((h) => `<th>${h}</th>`).join('');
  }

  set visible(v: boolean) {
    this.el.classList.toggle('hidden', !v);
  }

  update(players: Iterable<PlayerInfo>, me: number, sessionName: string) {
    const step = (p: PlayerInfo) => (p.ladder ? p.ladder.step * 100 + p.ladder.kills : 0);
    const rows = [...players].sort((a, b) => (this.ladder ? step(b) - step(a) : 0) || b.score - a.score || b.kills - a.kills || a.deaths - b.deaths);
    const key = sessionName + JSON.stringify(rows);
    if (key === this.key) return;
    this.key = key;
    document.getElementById('scoreboard-session')!.textContent = sessionName;
    this.body.innerHTML = '';
    rows.forEach((p, i) => {
      const tr = document.createElement('tr');
      if (p.id === me) tr.className = 'me';
      if (!p.alive) tr.classList.add('dead');
      // Bots and offline players have no account level.
      // The step (1-based) and the kills made on it toward the next one.
      const rung = p.ladder ? `${p.ladder.step + 1}/${FINAL_STEP + 1} · ${p.ladder.kills}/${killsForStep(p.ladder.step)}` : '—';
      const cells = [String(i + 1), p.name, p.nivel ? String(p.nivel) : '—', ...(this.ladder ? [rung] : []), String(p.score), String(p.kills), String(p.deaths), String(p.humiliations), `${p.ping} ms`];
      for (const c of cells) {
        const td = document.createElement('td');
        td.textContent = c;
        tr.appendChild(td);
      }
      this.body.appendChild(tr);
    });
  }
}
