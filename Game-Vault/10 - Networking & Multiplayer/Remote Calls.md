---
title: Remote Calls
type: reference
status: documented
area: networking
source_paths:
  - server/modes.ts
  - shared/modes.ts
  - shared/protocol.ts
  - server/app.ts
  - server/session.ts
  - server/api.ts
  - client/net/connection.ts
  - client/main.ts
  - client/ui/home.ts
  - shared/progression.ts
  - shared/arsenal.ts
  - shared/zombies.ts
  - shared/zombieMatch.ts
  - shared/barricades.ts
  - client/zombies/client.ts
tags:
  - game
  - networking
  - protocol
updated: 2026-10-06
---

# Remote Calls

Catálogo de tudo que cruza a fronteira cliente ↔ servidor **durante o jogo**. O protocolo é **JSON sobre WebSocket**: cada mensagem é um objeto com o discriminador `t`. Tipos em `shared/protocol.ts` (`ClientMsg`, `ServerMsg`). Endpoints REST de conta estão detalhados em [[APIs]]; aqui só aparecem os que o fluxo de jogo usa.

Convenções:
- `Vec3` = `[x, y, z]` em metros; `NetState` = `{ p: Vec3 (pés), yaw, pitch, f (bits de FLAG) }`. O bit `FLAG.secondary` (512) diz que a secundária está na mão: o servidor usa para validar os acertos e os outros clientes, para desenhar a arma certa e tocar o som dela.
- Tempos `time`, `until`, `ready`, `s` são **tempo do servidor em ms** (`performance.now()` do processo servidor). Ver [[Synchronization]].
- O servidor **descarta silenciosamente** mensagens inválidas (JSON quebrado, `t` ausente, campos não finitos). Só `create`/`join` e `chat` respondem erro explícito.

## Transporte e handshake

| Item | Detalhe |
|---|---|
| Ticket | `POST /api/ws-ticket` (cookie de sessão obrigatório) → `{ ticket }` (32 bytes aleatórios base64url). Guardado no Redis como `ws:ticket:<sha256>` com TTL 30 s. Erros: `401 nao_autorizado`, `403 conta_suspensa`, `403 conta_em_exclusao`. |
| Upgrade | `GET /ws?ticket=...`. Respostas de recusa: `426` (sem header `Upgrade: websocket`, o ticket **não** é gasto), `403` (origem não permitida), `401` (ticket ausente, >100 chars, inexistente ou vencido), `403` (conta não ativa ou banida), `400` (upgrade falhou), `500` (erro interno). |
| Consumo | `GETDEL` atômico no Redis: ticket de uso único ([[ADR - Ticket de uso único para o WebSocket]]). |
| Limites | `maxPayloadLength` 16 KiB; token bucket de 150 msg/s por conexão (excesso é descartado). |

## Cliente → Servidor (`ClientMsg`)

### Lobby (tratadas em `server/app.ts`)

| `t` | Payload | Frequência | Validação | Resposta |
|---|---|---|---|---|
| `hello` | — | 1× após abrir | Nome e corpo vêm da conta, nunca da mensagem | `welcome {id, name, sessions}` + `progresso` |
| `list` | — | sob demanda | — | `sessions {list}` |
| `create` | `name`, `map?`, `mode?` | sob demanda | Exige `hello` antes; `sanitizeName(name, 24)` ou "Sala de <nome>"; mapa inválido → `DEFAULT_MAP`; modo inválido → `mata-mata`; mapa fora dos mapas do modo (`modeMaps`) → o primeiro deles (zumbi: sempre o cemitério; os outros modos nunca caem no cemitério) | sai da sala atual, cria e entra → `joined` |
| `loadout` | `lo` (`ArsenalChoice {secundaria, ligadas, desligadas?}`) | antes de `join`/`create` (a home sempre manda) | só fora de sessão; `equip` → `sanitizeChoice` com o XP de cada arma da conta (secundária trancada vira a pistola; sem `desligadas`, cliente antigo, nenhuma comum desligada) | `progresso` (com a `escolha` guardada). A escolha vale para a próxima sessão em que entrar |
| `join` | `session` | sob demanda | Exige `hello`; sessão existe e não está cheia | `joined`, ou `error` ("Diga olá primeiro.", "Essa sessão não existe mais.", "Sessão lotada.") |
| `leave` | — | sob demanda | — | `sessions {list}`; grava o progresso |
| `ping` | `c` (relógio do cliente), `rtt?` | 1 Hz | `Number(c)` | `pong {c, s}` |

### Dentro da sessão (tratadas em `Session.handle`, `server/session.ts`)

| `t` | Payload | Frequência | Validação no servidor | Efeito / resposta |
|---|---|---|---|---|
| `state` | `s: NetState` | **20 Hz** enquanto vivo | `p` Vec3 finito, `yaw/pitch/f` finitos; ignorado se morto; pitch limitado a ±1,6; `f` truncado a inteiro | Atualiza a posição usada nos `snap` e nas validações |
| `ping` | `c`, `rtt?` | 1 Hz | `rtt` limitado a 0–9999 ms | `pong {c, s}`; `rtt` vira o `ping` do placar |
| `shot` | `o`, `e` (Vec3) | por disparo | vivo, vetores finitos, intervalo ≥ 70 % do intervalo da cadência da arma em mãos (com as melhorias) | broadcast `shot {id, o, e}` (exceto o autor) — **cosmético** |
| `hit` | `target`, `region`, `dist`, `w` (`GunId` da arma que atirou), `keep?` | por acerto | ver [[Anti Cheat]]: `w` em mãos ou guardada há < 1 s e no loadout, ambos vivos, região em `HIT_REGIONS`, máx. `ceil(cadência/60)+2` acertos/s, distância vs servidor | `damage` (+ `kill`) para todos |
| `swing` | — | por golpe | vivo | broadcast `swing {id}` (cosmético) |
| `stab` | `target`, `behind` | por facada | ambos vivos; intervalo ≥ 75 % do `intervalo` da faca; distância horizontal ≤ `alcanceInvestida + 1,5 m` | `damage` (55 ou letal se a faca do nível for `letal`) |
| `grenade` | `id`, `p`, `v`, `fuse`, `impact?`, `mine?`, `duck?` | por lançamento | o modo tem granadas (não na corrida armada), vivo, campos finitos; id não repetido; máx. **4 granadas** e **3 minas** vivas; mina só se o nível da granada for do tipo `mina`; `fuse` limitado a `[0, pavio]` (ou `[0, tempoMaximoVoo]` se impacto) | broadcast `grenade {owner, ...}` (exceto o autor) |
| `boom` | `id`, `p`, `hits[] {target, dist}`, `zs?[] {z, dist}` (zumbi) | por explosão | granada registrada; mina: `p` a ≤ 1,5 m da origem; impacto: dentro do alcance físico possível; pavio: não antes de `fuse − 0,5 s`; cada alvo: `dist` informada vs servidor ≤ 3 m e dentro de `raioDano + 3` | broadcast `boom` + `damage`/`kill` |
| `loadout` | `lo` (`ArsenalChoice {secundaria, ligadas, desligadas?}`) | — (o cliente não manda mais em partida) | **recusado** em modos com `lockedLoadout` (todos os online): nada muda | só `progresso` para o autor, com a escolha que ficou ([[ADR - Equipamento travado no mata-mata]]) |
| `selfDamage` | `amount`, `cause` (`fall`/`void`/`dog`) | por evento | vivo, `amount > 0`, limitado a `LETHAL_DAMAGE` | `damage` no próprio jogador |
| `taunt` | `corpse` | ao começar a dançar | corpo existe, não humilhado, livre, dentro da janela, não é o próprio, distância ≤ raio + 1,5 m | broadcast `taunt {id, corpse}` |
| `tauntEnd` | `corpse`, `done` | ao parar/terminar | dança ativa nesse corpo; `done` só vale se durou ≥ duração − 400 ms | broadcast `tauntEnd {..., awards, players}` |
| `respawn` | `p`, `yaw` | após morrer | morto; ≥ `respawnDelay` (5 s) − 250 ms desde a morte | broadcast `spawned {id, p, yaw}` |
| `prop` | `id` (ex.: `hidrante:1`) | por gag | regex `^[a-z]{1,16}(:\d{1,3})?$`, ≥ 150 ms entre props | broadcast `prop {id, by}` (exceto autor) |
| `pickup` | `id` | ao pisar (cliente repete a cada 800 ms no máx.) | item existe, disponível, vivo, distância horizontal ≤ raio + 1,5 m e vertical ≤ 2 m | broadcast `pickup {id, by, ready, until}` |
| `fish` | `id` | ao abater carpa | viva, jogador a ≤ `KOI.range + raio do circuito` | broadcast `fish` + XP de conta |
| `rat` | `id` | ao derrubar rato | vivo, distância 3D ≤ `RAT.range` | broadcast `rat {id, by, ready}` |
| `potion` | — | ao beber (cliente: 800 ms entre pedidos) | mapa tem bruxa, vivo, fora do cooldown, perto da bruxa | broadcast `potion {by, kind, until}` |
| `chat` | `text` | por mensagem | `sanitizeChat`; silêncio da conta; 4 de rajada + 1 a cada 1,5 s | broadcast `chat` para **todos, inclusive o autor**, ou `chatRefused` |
| `zhit` | `z` (id do zumbi), `region`, `dist`, `w`, `keep?` | por acerto num zumbi ([[Zombie]]) | zumbi existe e não sumiu, atirador vivo e não caído, `w` disparável (como `hit`), **mesmo contador de cadência** de `hit`, distância do olho até o peito do zumbi **na posição do servidor** ≤ alcance e dentro de `LAG_SLACK` + 10% + o tamanho do zumbi | dano do servidor (`gunDamageToZombie` × raridade); morte → `zdie` (+ `zmoney`, XP) |
| `zstab` | `z` | por facada num zumbi | intervalo da faca como `stab`; distância horizontal ≤ `alcanceInvestida + 1,5 m + 0,4 × tamanho` | 120 × raridade da faca |
| `box` | — | `E` no Caixão Misterioso | de pé, a ≤ alcance + 1 m do caixão (lugar fixo); caixão parado e dinheiro ≥ preço (girar), ou oferta para este jogador (pegar) | `zbox` (girando; oferta com `item` e `flaw`); pegar → `playerLoadout` (com `danificadas` se a arma veio danificada) |
| `barricade` | `i` (brecha), `on` | segurando/soltando `E` numa brecha do muro | `i` inteiro e existente; de pé; a ≤ 2,4 m do centro da brecha (de qualquer lado); algo a fazer (erguer ou repregar); dinheiro ≥ $300 para erguer; o trabalho para se ele se afasta, cai ou solta; a tábua que fecha a brecha espera o vão ficar livre | `zbarwork` (começou/parou); pronto → `zbar` (`build` com o dinheiro dele, ou `nail` com o prêmio) |
| `revive` | `id`, `on` | segurando/soltando `E` sobre um colega caído | reanimador de pé, alvo caído, a ≤ 3,5 m; cancelado se ele se afasta | `zrevive`; completo (3 s) → `zup` |

## Servidor → Cliente (`ServerMsg`)

| `t` | Payload | Quando | Destino |
|---|---|---|---|
| `welcome` | `id`, `name`, `sessions` | resposta ao `hello` | conexão |
| `sessions` | `list: SessionInfo[]` | `list`, `leave`, ou mudança no lobby (agrupada em 100 ms) | quem está no lobby |
| `joined` | `session`, `you`, `players` (com aparência), `corpses`, `time`, `pickups?`, `fish?`, `rats?`, `zumbi?` (`ZombieSync`: fase, onda, fim da fase, total, caixão, caídos, `bars` — as barricadas como estão) | ao entrar numa sala | conexão |
| `error` | `message` | falha em `create`/`join` | conexão |
| `playerJoined` | `player` (com aparência) | alguém entrou | sala, exceto quem entrou |
| `playerLeft` | `id` | alguém saiu | sala |
| `snap` | `time`, `players[] {id, s, h, alive}` | **20 Hz** | sala |
| `scores` | `players: PlayerInfo[]` | **1 Hz** | sala |
| `shot`, `swing` | `id`, (`o`, `e`) | retransmissão | sala, exceto autor |
| `damage` | `target`, `attacker`, `amount`, `health`, `from` | dano aplicado | sala |
| `kill` | `victim`, `attacker`, `kind`, `arma?` (a arma que matou e recebe os pontos), `awards`, `corpse`, `players` | morte | sala |
| `spawned` | `id`, `p`, `yaw` | respawn aceito | sala |
| `grenade`, `boom` | `owner`, `id`, ... | lançamento / explosão | sala, exceto autor |
| `taunt`, `tauntEnd` | `id`, `corpse`, (`done`, `awards`, `players`) | humilhação | sala |
| `playerLoadout` | `id`, `lo` (`Loadout {primaria, secundaria, ativas, soFaca?}`) | o modo trocou as armas de alguém no meio da partida (corrida armada: outro degrau, ou a rodada nova) | sala, **inclusive o próprio jogador** (são as armas que o servidor valida) |
| `roundEnd` | `mode`, `winner`, `name`, `restartAt` (hora do servidor) | fim de rodada (corrida armada: abate com o sabre) | sala |
| `roundStart` | `players: PlayerInfo[]` | rodada nova: todos mortos com respawn liberado, placar zerado | sala |
| `prop` | `id`, `by` | gag do mapa | sala, exceto autor |
| `pickup`, `fish`, `rat`, `potion` | ver tipos | itens/criaturas | sala |
| `chat` | `id`, `name`, `text` | fala aceita | sala (inclusive autor) |
| `chatRefused` | `reason: 'muted' \| 'slow'` | fala recusada | conexão |
| `pong` | `c`, `s` | resposta ao `ping` | conexão |
| `progresso` | `armas` (`{xp, nivel}` por arma), `escolha` (`ArsenalChoice`), `conta`, `subiu?` | `hello`, ao mudar a escolha, e sempre que o progresso muda | conexão |
| `figurinha` | `id` (da figurinha), `nivel` (1 Comum .. 4 Dourada) | quando o acabamento de uma figurinha do álbum sobe (conferido 1×/s no `tick` da sessão, `stickerUps`) | conexão (só o dono) |
| `zsnap` | `time`, `z: ZNet[]` (`[id, tipo, x, y, z, yaw, flags]`), `left`, `boss?: [id, vida, máx]` | **20 Hz** logo depois do `snap`, durante a onda ou com zumbis vivos | sala |
| `zwave` | `phase` (`waiting`/`countdown`/`wave`/`break`/`over`), `wave`, `until`, `total`, `boss?` | a partida muda de fase | sala |
| `zdie` | `id`, `by`, `how`, `award?`, `money?` | zumbi morreu | sala |
| `zfx` | `fx` (`slam`/`summon`/`scream`/`blink`/`charge`/`pound`/`spit`/`boom`/`intro`/`rise`), `id?`, `at`, `to?`, `r?`, `t0`, `t1` | golpe telegrafado ou efeito (o dano cai em `t1`); `rise`: um zumbi vai sair do chão em `at` em `t1` (0,9 s depois; um por surgimento) | sala |
| `zhitfx` | `id`, `fx`, `v?` (empurrão), `slow?`, `until?` | um golpe empurrou ou deixou alguém lento | sala (o cliente do jogador aplica) |
| `zbox` | `state` (`idle`/`rolling`/`offer`), `by`, `item`, `flaw` (`municao`/`dano`/`ambos` ou null), `until`, `money?` | o caixão mudou (o defeito só aparece na oferta) | sala |
| `zbar` | `i`, `fx` (`build`/`nail`/`hit`/`break`/`reset`), `built`, `boards`, `hp`, `by?`, `award?`, `money?` | uma barricada mudou: erguida, tábua pregada, golpe da horda (~1 por golpe), arrombada, ou desfeita numa partida nova | sala |
| `zbarwork` | `i`, `by`, `until` (0: parou) | alguém começou/parou de trabalhar numa barricada (próxima tábua em `until`) | sala |
| `zmoney` | `m: [id, dinheiro][]`, `why` (`assist`/`wave`/`boss`) | ajudas, bônus de onda, prêmio de chefe | sala |
| `zdown`, `zrevive`, `zup` | `id`, (`until`), (`by`, `money?`) | caiu / reanimando / levantou | sala |
| `zend` | `won`, `wave`, `secs`, `players: ZSummaryRow[]`, `restartAt` | fim da partida zumbi (resumo) | sala |

`PlayerInfo` ganhou `fig?: [id, nivel]` e `tit?` (a figurinha do álbum em destaque, com o acabamento de agora, e o título; [[Achievements]]), `ladder?: {step, kills}` (corrida armada) e `zumbi?: {money, kills, downs, revives, state, items}` (zumbi; `items.danificadas` diz quais estão danificadas); `SessionInfo` ganhou `mode`; `KillKind` ganhou `'zombie'` (sangrou caído); `Loadout` ganhou `danificadas?` (por arma: `municao`/`dano`/`ambos`, mantido por `sanitizeLoadout`). Ver [[Gun Game]] e [[Zombie]].

`KillKind`: `gun`, `head`, `groin`, `knife`, `grenade`, `fall`, `void`, `explosion`, `dog`. `AwardLabel`: `kill`, `headshot`, `groin`, `knife`, `backstab`, `longShot`, `humiliation`.

## Códigos de fechamento (`CLOSE`)

| Código | Significado | Origem |
|---|---|---|
| `4001` (`revoked`) | Sessão revogada: logout, redefinição de senha, banimento, pedido de exclusão | mensagem no canal Redis `oc:revogacao` |
| `4002` (`replaced`) | A mesma conta conectou em outro lugar | nova conexão da conta |
| `1001` | "servidor reiniciando" | `close()` no desligamento |
| outro | perda de conexão | — |

O cliente traduz o código em texto (`closeReason()` em `client/ui/home.ts`; `hud.setNetStatus` em `client/main.ts`). Não há reconexão automática.

## Falhas possíveis e impacto de latência

- Mensagem descartada (inválida, flood, fora de regra) **não gera resposta**: o cliente pode ficar dessincronizado (ex.: respawn recusado). O cliente compensa reenviando `respawn` se após 1,5 s o `snap` ainda o mostra morto.
- Acertos chegam com atraso de ~RTT/2; a validação de distância usa a posição mais recente do servidor, daí a folga `LAG_SLACK`. Ver [[Synchronization]].

## Código relacionado

- `shared/protocol.ts`, `server/app.ts` (`message()`), `server/session.ts` (`handle()`), `server/api.ts` (`/api/ws-ticket`), `client/net/connection.ts`, `client/main.ts` (todos os `conn.send` / `conn.on`).
- Ver também [[Events & Messaging]], [[Validation]], [[Replication]].
