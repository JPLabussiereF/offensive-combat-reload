---
title: Grenades
type: mechanic
status: documented
area: gameplay
source_paths:
  - shared/data/weapons/granada_frag.json
  - shared/weapons.ts
  - shared/progression.ts
  - shared/data/progression.json
  - shared/protocol.ts
  - client/weapons/grenades.ts
  - client/main.ts
  - server/session.ts
  - shared/arsenal.ts
tags:
  - game
  - gameplay
  - grenades
updated: 2026-10-06
---

# Grenades

> [!info] Evidência
> Configuração confirmada (`granada_frag.json`) e código confirmado (`GrenadeThrower`/`GrenadeProjectiles` em `client/weapons/grenades.ts`, `throwGrenade`/`explode` em `client/main.ts`, `onBoom` em `server/session.ts`).

## Objetivo

Arremesso de área que obriga o inimigo a sair da cobertura. A granada é **de impacto**: depois de lançada, explode no primeiro contato. O "cozimento" serve para arriscar e decidir o momento.

Este documento cobre o tipo `granada` (padrão) e o `dupla` (melhoria opcional **Dose Dupla**, nível 3). O tipo `mina` (melhoria opcional do nível 2) está em [[Land Mines]]; mina e Dose Dupla são do mesmo grupo (`modo`), então só uma fica ligada. As melhorias comuns **Cinto** (nível 4, +1 carga) e **Pólvora** (nível 5, raios ×1,2) valem para todos os tipos. Os números saem de `grenadeStats(melhorias)` (`shared/arsenal.ts`); árvore completa em [[Weapons]] e [[Progression]]. Fórmula de dano em [[Damage System]].

## Como o jogador interage

- **Segurar G**: tira o pino e começa a cozinhar (bipes a cada segundo, barra de pavio no [[HUD]]).
- **Soltar G**: arremessa. Um toque rápido ainda faz a animação de puxar o pino por no mínimo 0,2 s antes de lançar.
- **Pular + arremessar** (no ar, ou pulo no mesmo tick): vai mais longe.
- Controle: L1/LB; toque: botão de granada (segure para preparar).

## Regras

| Regra | Valor |
|---|---|
| Cargas por vida (`quantidade`) | 2 (3 com o Cinto; liberado no meio da vida, a carga extra vem pela recarga) |
| Recarga de uma carga (`recargaSegundos`) | 10 s |
| Pavio (`pavio`) | 3,0 s — passando disso, **explode na mão** |
| Puxar mínimo (`tempoMinimoPuxar`) | 0,2 s |
| Velocidade de lançamento | 17 m/s (× 1,35 pulando) |
| Ângulo extra acima da mira | 7° |
| Herança do movimento | 60% da velocidade horizontal do jogador (+50% da vertical se pulando) |
| Impacto (`impacto`) | `true`: explode no 1º contato com mapa, bloqueadores ou hitboxes |
| Tempo máximo de voo | 8 s (se não tocar em nada) |
| Intervalo entre arremessos | 0,8 s |
| Projétil | esfera de 7 cm, quique 0,35, atrito 0,7, CCD ligado |
| Dano | 85 até 2,5 m → 12 a 7 m; 0 além de 7 m; paredes bloqueiam. Com a Pólvora: 3 m e 8,4 m |

README: alcance aproximado ~9 m parado e ~18 m pulando (não verificado numericamente).

- O lançador **pode se matar** com a própria granada (dano sem proteção). A própria hitbox não detona a granada.
- Ao explodir: efeito de explosão, som, tremor de câmera proporcional à distância (até 18 m). Indicador no HUD aponta para qualquer granada viva dentro de 7 m.
- **Dose Dupla** (melhoria opcional do nível 3, tipo `dupla`): ao soltar, uma segunda granada é lançada **0,3 s depois**, gastando **uma única carga**. Morrer entre os dois arremessos perde a segunda (correção do commit `d7bc9d1`).

## Estados possíveis (`GrenadeThrower`)

`pronta` → `cozinhando (cookT)` → `lançada (throwT, animação de 0,5 s)` | `explodiu na mão` | `cancelada`.
Projétil: `voando/quicando` → `explodiu` | `caiu do mapa (y < −30)`.

## Entradas

`held`/`pressed` de G, `canStart` (sem tiro, sem dança, sem faca), estado de movimento (pulo).

## Saídas

Eventos `pin`, `throw {fuseLeft, double}`, `inHand`, `mine`. Online: `grenade {id, p, v, fuse, impact, duck}` ao lançar e `boom {id, p, hits[]}` ao explodir; o servidor retransmite `grenade`/`boom` e aplica o dano. Ver [[Remote Calls]].

## Dependências

[[Damage System]], [[Combat]], [[Movement]], [[Land Mines]], [[Buffs & Debuffs]] (pato), [[Visual Effects]], [[SFX]], [[Progression]].

## Exceções

- **Atirar cancela o cozimento**: o pino volta e a carga não é perdida. Faca e dança também não podem começar com granada na mão.
- **Morrer cozinhando**: offline, a granada cai viva aos pés com o pavio restante (sem impacto); online, a carga é apenas descontada (o jogador já está morto).
- Granadas de outros jogadores são **só visuais** no cliente; somem quando chega o `boom` do dono (ou 2 s após o pavio, como rede de segurança).
- Explodir na mão é relatado online como granada com `fuse: 0` na posição da mão.
- O servidor limita a **4 granadas vivas** por jogador e só aceita a explosão onde a granada poderia estar (ver [[Damage System]]).
- **Poção do pato**: a granada vira um pato de borracha 1,6× maior que faz "quá" ao quicar — só aparência ([[Buffs & Debuffs]]).

> [!warning] Pontos de atenção
> - A recarga de 10 s está documentada no JSON como "Offline prototype convenience", mas roda também online, e **o servidor não controla a contagem de cargas** (só o limite de 4 vivas). Ver [[Problem - Cargas de granada controladas só pelo cliente]].
> - Resolvido: os comentários que diziam que o nível 1 era "non-lethal" e a constante `ONLINE_GRENADE_LEVEL` foram removidos. O JSON tem `podeMatar: true` e a explosão vem de `grenadeStats`. Ver [[Problem - Comentários dizem que a granada nível 1 não é letal]].

## Código relacionado

- `client/weapons/grenades.ts` — `GrenadeThrower` (máquina de estados, cargas, recarga, `setData` quando as melhorias mudam), `GrenadeProjectiles` (corpos dinâmicos Rapier, detecção de impacto por *shape cast*), `grenadeModel`, `duckModel`.
- `client/main.ts` — `throwGrenade`, `launch`, `explode`, `explosionFx`, `blastDistance`, `dropCookedGrenade`, `DOUBLE_THROW_GAP`.
- `shared/weapons.ts` — `GrenadeData`, `GrenadeLevel`, `grenadeLevel`, `explosionDamage`, `clampExplosionDamage`.
- `shared/arsenal.ts` — `grenadeStats` (cargas, tipo, `explosao` com o raio da Pólvora).
- `server/session.ts` — case `grenade` (guarda a explosão de cada granada no lançamento), `onBoom`.

## Configurações relacionadas

`shared/data/weapons/granada_frag.json` (explosão do nível 1), `progression.json` (`granada`: mina, dupla, cinto, pólvora). Ver [[Constants Reference]].
