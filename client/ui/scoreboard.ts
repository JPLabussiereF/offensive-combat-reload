// Scoreboard (section 5, held on Tab): the standings of the session or bots match. In corrida armada the
// ladder decides: players are ordered by step and kills on it, and a column shows the weapon (N/total). In
// the zumbi mode it's a team's sheet: zombie kills, the match's money, times down and revives given.
import type { PlayerInfo } from '@shared/protocol';
import { FINAL_STEP, killsForStep } from '@shared/gunGame';
import { stickerBadge, titleText } from './album';
// The order lives with the pause menu's rules (pure), which names the corrida armada's leader with it.
import { standingsOrder } from './pauseMenu';
import { t } from './strings';

export type ScoreboardKind = 'plain' | 'ladder' | 'zombie';

/** The name cell: the album sticker the player shows, the name, and the title they wear under it. */
function nameCell(p: PlayerInfo, prefix: string): HTMLTableCellElement {
  const td = document.createElement('td');
  td.className = 'sb-name';
  td.insertAdjacentHTML('beforeend', stickerBadge(p.fig));
  td.append(prefix + p.name);
  const title = titleText(p.tit);
  if (title) {
    const small = document.createElement('small');
    small.className = 'sb-title';
    small.textContent = title;
    td.append(small);
  }
  return td;
}

export class Scoreboard {
  private el = document.getElementById('scoreboard')!;
  private body = document.getElementById('scoreboard-body')!;
  private key = '';

  /** 'ladder': corrida armada (the weapon column, ordered by the ladder); 'zombie': the zumbi mode's columns. */
  constructor(private kind: ScoreboardKind = 'plain') {
    document.getElementById('scoreboard-title')!.textContent = t('scoreboard');
    const head =
      kind === 'zombie'
        ? ['#', t('player'), t('level'), t('zColKills'), t('zColMoney'), t('zColDowns'), t('zColRevives'), 'Ping']
        : ['#', t('player'), t('level'), ...(kind === 'ladder' ? [t('ladderShort')] : []), t('points'), t('kills'), t('deaths'), t('humiliationsShort'), 'Ping'];
    document.getElementById('scoreboard-head')!.innerHTML = head.map((h) => `<th>${h}</th>`).join('');
  }

  set visible(v: boolean) {
    this.el.classList.toggle('hidden', !v);
  }

  update(players: Iterable<PlayerInfo>, me: number, sessionName: string) {
    const ladder = this.kind === 'ladder';
    const rows = standingsOrder(players, ladder);
    const key = sessionName + JSON.stringify(rows);
    if (key === this.key) return;
    this.key = key;
    document.getElementById('scoreboard-session')!.textContent = sessionName;
    this.body.innerHTML = '';
    rows.forEach((p, i) => {
      const tr = document.createElement('tr');
      if (p.id === me) tr.className = 'me';
      if (!p.alive || p.zumbi?.state === 'down') tr.classList.add('dead');
      // Bots and offline players have no account level.
      // The step (1-based) and the kills made on it toward the next one.
      const rung = p.ladder ? `${p.ladder.step + 1}/${FINAL_STEP + 1} · ${p.ladder.kills}/${killsForStep(p.ladder.step)}` : '—';
      const z = p.zumbi;
      const name = nameCell(p, z?.state === 'down' ? '✚ ' : '');
      const cells =
        this.kind === 'zombie'
          ? [String(i + 1), name, p.nivel ? String(p.nivel) : '—', String(z?.kills ?? p.kills), `$${z?.money ?? 0}`, String(z?.downs ?? 0), String(z?.revives ?? 0), `${p.ping} ms`]
          : [String(i + 1), name, p.nivel ? String(p.nivel) : '—', ...(ladder ? [rung] : []), String(p.score), String(p.kills), String(p.deaths), String(p.humiliations), `${p.ping} ms`];
      for (const c of cells) {
        if (typeof c !== 'string') {
          tr.appendChild(c);
          continue;
        }
        const td = document.createElement('td');
        td.textContent = c;
        tr.appendChild(td);
      }
      this.body.appendChild(tr);
    });
  }
}
