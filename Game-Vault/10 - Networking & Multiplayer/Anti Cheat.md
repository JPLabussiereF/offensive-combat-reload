---
title: Anti Cheat
type: system
status: documented
area: networking
source_paths:
  - server/session.ts
  - server/app.ts
  - server/progress.ts
  - shared/weapons.ts
  - shared/progression.ts
  - shared/data/weapons/granada_frag.json
  - server/tests/game.test.ts
  - shared/arsenal.ts
tags:
  - game
  - networking
  - security
  - anti-cheat
updated: 2026-10-06
---

# Anti Cheat

Não há anti-cheat no cliente (nenhuma ofuscação, detecção de memória ou de *aimbot* encontrada). A defesa é **validação no servidor**: cada relatório do cliente passa por *sanity checks* com as mesmas regras de `shared/`. Esta nota cobre trapaças de **gameplay**; abuso de serviço/protocolo (flood, força bruta, CSRF) está em [[Anti Exploit]].

## O que o servidor valida

### Identidade e progressão
- Nome, sexo e aparência vêm da conta (ticket), nunca da mensagem.
- Pontos, XP e níveis só nascem de eventos validados no servidor; o cliente só recebe `progresso` ([[Progression]]).
- Loadout: o cliente manda só a escolha do Arsenal (`loadout {lo: ArsenalChoice}`); o servidor descarta melhorias não liberadas pelo XP (`equip()` → `sanitizeChoice`) e resolve o loadout ele mesmo (`loadoutOf`). O dano, a cadência e o alcance usados nas validações são os do loadout **do servidor** (`gunStats`/`meleeStats`/`grenadeStats` com as melhorias). Ver [[Validation]].

### Tiros (`hit`)
| Checagem | Regra |
|---|---|
| Alvo | existe, não é o atirador, ambos vivos |
| Arma (`w`) | precisa ser a arma em mãos (pela `FLAG.secondary` do último `state`) ou a guardada há menos de 1 s (`SWITCH_GRACE_MS`, tiros em voo), e estar no loadout; senão o acerto é ignorado |
| Região | precisa estar em `HIT_REGIONS` (`cabeca`, `pescoco`, `peito`, `abdomen`, `quadril`, `bracos`, `maos`, `coxas`, `canelas`, `virilha`) |
| Cadência | no máx. `ceil(cadência/60) + 2` acertos confirmados por segundo, com a cadência da arma que atirou (rifle 700 rpm → 14/s; pistola 400 → 9/s, 11/s com o Gatilho; submetralhadora 950 → 18/s, 20/s com o Motor) |
| Alcance | distância do servidor (olho 1,6 m → peito 1,1 m) ≤ `alcanceMaximo` da arma (rifle 300 m; pistola e submetralhadora 200 m) |
| Distância | `|dist servidor − dist informada| ≤ 4 m (LAG_SLACK) + 10 %` |
| Penetração | `keep` limitado a `[mínimo da arma, 1]` — nunca mais que um acerto limpo |
| Dano | calculado no servidor (`computeDamage` com `gunStats` da arma e das melhorias) com a distância informada limitada ao alcance; o XP do abate vai para essa arma |

### Facada (`stab`)
- Ambos vivos; intervalo ≥ 75 % do `intervalo` da faca com as melhorias (`meleeStats`); distância horizontal ≤ `alcanceInvestida + 1,5 m`.

### Granadas (`grenade` / `boom`)
- Máx. 4 granadas e 3 minas vivas por jogador; id não pode repetir; mina só se a granada do loadout for do tipo `mina` (`grenadeStats`). A explosão de cada granada é guardada no lançamento (uma melhoria liberada depois não a aumenta).
- `fuse` limitado ao pavio (3 s) ou ao tempo máximo de voo (8 s) se de impacto.
- Explosão: mina a ≤ 1,5 m da origem; impacto dentro de `velocidade·t + 4,9·t² + 3 m` e antes de `fuse + 1 s`; pavio não antes de `fuse − 0,5 s`.
- Cada alvo: dentro de `raioDano + 3 m` da explosão e com `dist` informada a ≤ 3 m da do servidor; um alvo só conta uma vez; no máx. 10 alvos.
- Dano calculado no servidor (`explosionDamage`, `clampExplosionDamage`).

### Outros
- `respawn`: só morto e após `respawnDelay` (5 s) − 250 ms.
- `taunt`/`tauntEnd`: janela, raio (+1,5 m), não pode ser o próprio corpo, um dançarino por corpo, duração mínima (`HUMILIATION.duration` − 400 ms) para pontuar.
- Itens, carpas, ratos, poção: estado e cooldown no servidor; proximidade checada contra a última posição informada ([[ADR - Itens do mapa com autoridade do servidor]]).
- `selfDamage`: só causa dano a quem envia (não dá para ferir outros).
- `shot`/`prop`/`swing`: cosméticos, com limite de taxa.
- Mensagens malformadas são descartadas; números precisam ser finitos (`finite`, `vec`).

## Lacunas conhecidas (código confirmado)

> [!warning]
> Estas lacunas decorrem diretamente do código atual. Detalhes e impacto em [[Problem - Lacunas de validação de gameplay online]].

1. **Posição confiada**: `state` aceita qualquer posição finita — *speed hack*, *teleport* e *noclip* não são detectados ([[ADR - Movimento confiado ao cliente]]).
2. **Posição de respawn confiada**: o servidor não confere se é um ponto de nascimento válido.
3. **Sem linha de visão**: o servidor não tem a geometria do mapa; um acerto através de parede é aceito se a distância bater.
4. **Região do acerto confiada**: basta ser uma região válida; informar `virilha` (letal pelo guia de dano) ou `cabeca` em todo acerto não é detectado.
5. **`behind` da facada confiado** (bônus de facada pelas costas).
6. **Granada de pavio**: a posição `p` da explosão não é checada contra a trajetória; com `fuse: 0` (aceito, é o caso da granada que explode na mão) o `boom` pode vir logo em seguida em qualquer ponto. O servidor não aplica `quantidade`/`recargaSegundos` da granada — só o limite de 4 vivas.
7. **Pontaria**: não há detecção estatística de *aimbot*/*triggerbot*.

Mitigações existentes: tudo exige conta (banimento por conta com efeito imediato, ver [[Moderation]]); uma conexão por conta; limite de 150 msg/s.

## Evolução planejada

`README.md` e o cabeçalho de `server/session.ts` listam como próxima etapa: servidor simulando o movimento (o módulo `shared/movement.ts` já se declara "shared between client prediction and (later) the authoritative server"), rewind de hitboxes e *interest culling*.

## Testes

`server/tests/game.test.ts` cobre: nome vindo da conta, ticket de uso único, abate validado gerando progresso, itens que só quem está perto pega, uma poção por vez, loadout validado, dano e XP da arma que atirou (acerto de submetralhadora fora do loadout ignorado; acerto da arma guardada aceito dentro da folga da troca). Fora esse caso, não há testes de rejeição de acertos inválidos (busca em `server/tests/`). Ver [[Integration Tests]].

## Código relacionado

- `server/session.ts` — `handle()`, `onHit()`, `onStab()`, `onBoom()`, `onTaunt*()`, `onPickup()`, `onFish()`, `onRat()`, `onPotion()`; constantes `LAG_SLACK`, `PICKUP_SLACK`, `EYE`, `CHEST`.
- `shared/weapons.ts`, `shared/progression.ts`, `shared/data/weapons/*.json`.
- Ver também [[Security Overview]], [[Trust Boundaries]], [[Validation]], [[Combat]], [[Grenades]].
