---
title: ADR - Zumbis simulados no servidor sobre navmesh pré-gerada
type: decision
status: documented
area: architecture
source_paths:
  - shared/zombieMatch.ts
  - shared/zombies.ts
  - server/modes.ts
  - server/navmesh.ts
  - server/session.ts
  - tools/bake-navmesh.ts
  - shared/data/navmesh/halloween.json
  - client/zombies/local.ts
  - client/zombies/view.ts
  - client/ai/navmesh.ts
  - server/tests/zombies.test.ts
tags:
  - decision
  - adr
  - architecture
  - ai
  - networking
  - zombies
updated: 2026-10-06
---

# ADR - Zumbis simulados no servidor sobre navmesh pré-gerada

## Contexto

O [[Zombie|modo zumbi]] dá **XP de conta** e **dinheiro** por zumbi morto, e o dinheiro compra armas num sorteio. XP só pode vir do servidor ([[Anti Exploit]]), e o sorteio também precisa ser dele. Mas até aqui o servidor **não tinha mundo**: nem física, nem geometria do mapa (o mapa é montado por código no navegador), e o movimento dos jogadores é confiado ao cliente ([[ADR - Movimento confiado ao cliente]]). Os bots existem só offline porque a IA deles depende de Rapier e Recast no navegador ([[Problem - Bots só existem offline]]).

## Problema

Quem move os zumbis online, e sobre o quê, de um jeito que o servidor continue decidindo acertos, mortes, dinheiro, sorteios e XP, sem um custo grande de CPU, memória ou rede?

## Opções consideradas

1. **Um cliente "anfitrião" simula os zumbis** (ele já tem navmesh e Rapier) e manda as posições; o servidor decide o resto. Simples de começar, mas o jogo de todos depende da máquina, da rede e da aba (em segundo plano o `requestAnimationFrame` para) de um jogador; precisa de troca de anfitrião; e um anfitrião trapaceiro mexe na horda de todos.
2. **O servidor monta o mapa ao iniciar** (o código do cliente em Bun, com um canvas falso) e gera a navmesh. Funciona (~1 s e ~300 MB de pico por mapa), mas trava o laço do servidor ou exige um Worker, e põe o código de mapas do cliente dentro do servidor publicado.
3. **Direção em linha reta / "migalhas" das posições dos jogadores / campo de fluxo numa grade 2D.** Sem geometria, atravessa paredes; a grade 2D não entende a mansão de dois andares nem o esgoto sob a praça.
4. **Navmesh pré-gerada + Detour Crowd no servidor** (escolhida).

## Decisão

1. **A navmesh é gerada em tempo de desenvolvimento** por `tools/bake-navmesh.ts` (`bun run navmesh`): monta o mapa **headless em Bun com o próprio código do cliente** (`client/world/*`, com um canvas que não desenha nada) e roda `NavMap.build` (`client/ai/navmesh.ts`, as mesmas configurações dos bots). O resultado (`exportNavMesh` do recast-navigation, ~265 KB) vai em base64 para `shared/data/navmesh/<mapa>.json`, que entra no bundle do servidor. A geração é determinística (aleatoriedade com semente), e um teste refaz a malha e compara o hash: **mapa mudou sem refazer a malha, o teste falha**.
2. **O servidor simula** (`server/navmesh.ts` carrega a malha uma vez por processo, compartilhada; cada sessão tem a sua `Crowd`): o motor `ZombieMatch` (`shared/zombieMatch.ts`) roda no tick de 20 Hz da `Session` — seguir caminho, desviar uns dos outros, estados (saindo do chão, perseguindo, preparando o golpe, especiais), chefes. "Linha de visão" é um raycast na navmesh. O dano nos jogadores é decidido pela distância entre as posições do servidor no momento em que o golpe cai.
3. **Os clientes só desenham e informam**: `zsnap` a 20 Hz (cada zumbi: id, tipo, x, y, z, yaw, flags), desenhados 100 ms no passado e interpolados como os jogadores remotos, com as **mesmas hitboxes** de personagem (escaladas). O cliente detecta o acerto e manda `zhit {z, region, dist, w, keep}`; o servidor valida como um tiro em jogador: arma que ele podia ter disparado, cadência (o mesmo contador de acertos), distância do olho dele até o peito do zumbi na posição do servidor dentro de `LAG_SLACK` + 10% + o tamanho do zumbi ([[ADR - Acertos informados pelo cliente com tolerância de lag]]). Faca e granadas idem.
4. **O mesmo motor roda offline** (`client/zombies/local.ts`), sobre a navmesh que o navegador já gera para os bots (é a mesma malha), respondendo com as mesmas mensagens: o jogo solo e o online desenham e reagem pelo mesmo código. Sem servidor, sem XP.
5. **Ganchos novos na `Session`/`SessionMode`** em vez de outra `Session`: `handle` (mensagens do modo), `blast` (granadas validadas), `onLethal` (vida a zero vira "caído"), `joinState` e `snapshot` (estado na entrada e a cada tick), `dispose`; a `ModeHost` ganhou `map`, `damage`, `kill`, `firedGun` e `fireRate`; o jogador ganhou o estado genérico `downed` ([[ADR - Modos de jogo com regras declaradas e ganchos no servidor]]).

## Motivo

- O servidor decide tudo o que dá progresso ou dinheiro, e o sorteio é dele.
- Nada depende da máquina de um jogador; a horda é a mesma para todos.
- Barato: uma partida de 60 s simulados com a horda roda em ~30 ms de CPU (20 Hz, até ~30 agentes); no cliente, 17 zumbis custam ~1 ms por tick e ~3 ms de CPU por quadro (medido no Chrome headless). Rede: ~1–1,5 KB por `zsnap` com uma horda cheia.
- Reaproveita o que existia: o Recast dos bots, o código dos mapas, as hitboxes, a validação de acertos.
- Abre caminho para **bots online** (o servidor agora sabe andar no mapa).

## Consequências

- **A navmesh precisa ser refeita quando o mapa muda** (`bun run navmesh`; o teste avisa). Mapas novos no modo precisam entrar em `BUILDERS` (ferramenta) e `BAKED` (servidor).
- O servidor não conhece colisões finas (carros, caixas, o caixão, portas): zumbis seguem a navmesh, que já desconta os colisores estáticos do mapa; um jogador num lugar fora da malha (em cima de um carro) fica fora do alcance dos arranhões ([[Navigation]]).
- A altura dos zumbis vem da malha (~8 cm acima do chão; o cliente desconta).
- A primeira sessão do processo espera o WebAssembly do Recast (~0,4 s) antes de começar a contagem.
- O teste da malha monta o mapa inteiro em Bun (~1–2 s) dentro de `bun test`.
- O cliente de WebSocket do Bun corrompia quadros quando um teste enviava de dentro do evento de mensagem enquanto os `zsnap` chegavam; o helper dos testes entrega as mensagens na tarefa seguinte ([[Integration Tests]]).

## Código afetado

`shared/zombieMatch.ts` (novo), `shared/zombies.ts` (novo), `server/modes.ts`, `server/navmesh.ts` (novo), `server/session.ts`, `shared/protocol.ts`, `tools/bake-navmesh.ts` (novo), `shared/data/navmesh/halloween.json` (gerado), `client/zombies/*` (novo), `server/tests/zombies.test.ts`, `server/tests/helpers.ts`, `package.json` (`navmesh`).

Relacionado: [[Zombie]] · [[ADR - Modo zumbi cooperativo com caixão e raridades]] · [[AI Overview]] · [[Server Architecture]] · [[Network Performance]]
