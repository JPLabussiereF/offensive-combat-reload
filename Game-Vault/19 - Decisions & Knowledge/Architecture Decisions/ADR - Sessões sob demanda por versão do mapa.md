---
title: ADR - Sessões sob demanda por versão do mapa
type: decision
status: documented
area: networking
source_paths:
  - server/app.ts
  - server/maps.ts
  - server/session.ts
  - server/modes.ts
  - server/navmesh.ts
  - shared/protocol.ts
  - shared/maps.ts
  - shared/modes.ts
  - client/net/maps.ts
  - client/ui/home.ts
  - client/main.ts
  - server/tests/sessions.test.ts
tags:
  - decision
  - adr
  - networking
  - sessions
  - maps
updated: 2026-10-06
---

# ADR - Sessões sob demanda por versão do mapa

## Contexto

Até a fase 2 da PF-6 o servidor criava, ao subir, **uma sala fixa por mapa e por modo** (`principal`, `jardim`, `halloween`, `corrida-armada-<mapa>`, `zumbi-cemiterio`) e mantinha sempre uma com vaga (`keepRoom`). Os mapas eram 4, fixos no código (`MAPS` em `shared/maps.ts`), e o servidor lia as posições dos coletáveis, da bruxa, dos ratos e dos peixes de tabelas em código.

Com o editor de mapas (PF-6), qualquer conta cria mapas da comunidade, jogáveis online, e cada salvamento cria uma **versão nova** do mapa. Decisões do dev no plano da PF-6: P14 (todas as sessões sob demanda: abrem quando alguém entra e fecham quando esvaziam) e P18/P22 (salvar cria versão nova; partidas em andamento terminam na versão anterior).

## Problema

Salas fixas não escalam para centenas de mapas, e uma sala que vive para sempre não tem como trocar de versão sem trocar o mapa no meio de uma partida.

## Opções consideradas

1. **Manter salas fixas para os oficiais e abrir as da comunidade sob demanda.** Dois comportamentos; a sala fixa ainda precisaria de uma regra para trocar de versão.
2. **Todas sob demanda, cada sala presa a uma versão.** Escolhida (P14).

## Decisão

- Não há sala fixa. A mensagem nova **`play {map, mode}`** põe o jogador numa sala **da versão atual** do mapa naquele modo com vaga, ou abre uma (nome: o do mapa, depois `<Mapa> 2`…). `create` (sala com nome) e `join` (por id) continuam.
- **Toda sala fecha quando esvazia** (`sessionsChanged`, agrupado em 100 ms).
- Cada sala recebe um **`MapRuntime`** (`server/maps.ts`): a versão salva do mapa (dados, nome, `exclusivo`, navmesh), carregada do banco uma vez e guardada em cache por `mapa@versão` (versões são imutáveis). A sala joga essa versão até o fim; os próximos `play` abrem salas da versão nova.
- Um **mapa de promessas por `mapa@versão|modo`** evita duas salas iguais quando dois jogadores pedem ao mesmo tempo (carregar a versão é assíncrono).
- **Mapa oculto ou apagado não abre sala** (`play` responde `error`); as salas que já jogam nele seguem até esvaziar.
- `play_count` do mapa sobe **uma vez por conta por sala**.
- O servidor lê coletáveis, bruxa, ratos, peixes, os dados de zumbi e a navmesh **da versão salva** (`Session.mapa.data.objetos`, `.zumbi`, `.navmesh`); saíram `MAPS`, `PICKUPS`, `WITCHES`, `RATS` e `FISH` de `shared/maps.ts`, e `MapId` virou `string`. Quais modos jogam num mapa: `modeAllowsMap(modo, exclusivo)` em `shared/modes.ts`.
- Protocolo: `SessionInfo` ganhou `versao` e `mapaNome` e perdeu `permanent`. O cliente baixa os dados da versão por HTTP (`GET /api/mapas/:id/versoes/:v`, com cache em memória e IndexedDB: `client/net/maps.ts`) antes de montar o mapa; offline (treino e bots) usa os JSON oficiais do pacote.

## Motivo

Escala com qualquer número de mapas, e "uma sala, uma versão" garante que ninguém fica com o mapa trocado no meio da partida, sem precisar migrar estado de sala nenhum.

## Consequências

- `GET /api/sessoes` e `welcome.sessions` podem vir vazios: a tela inicial manda `play` na entrada rápida (o mapa da sala mais cheia entre os filtrados, ou um dos filtrados).
- **Incompatível com clientes antigos**: um cliente que não conhece `play` nem `versao` não consegue entrar; o deploy troca cliente e servidor juntos.
- Sessões e o cache de versões vivem na memória de um processo, como antes ([[Problem - Estado das partidas só em memória de um processo]]).
- Uma sala zumbi carrega a navmesh da sua versão (`server/navmesh.ts`, uma vez por processo e versão).

## Decisões do dev depois da fase 2 (P33 a P38)

Perguntas abertas pela fase 2, respondidas pelo dev:

- **P33 — limites provisórios ficam:** GLB com até 2000 nós (`GLB_LIMITS.nos`), 30 envios de GLB por hora por conta (`GLB_UPLOADS_PER_HOUR`), 200 MB de modelos por conta (`GLB_QUOTA_BYTES`) e a montagem de um mapa no construtor limitada a 120 s (`BUILD_TIMEOUT_MS`).
- **P34 — a equipe vê os mapas ocultos na lista:** `GET /api/mapas?ocultos=1` inclui os ocultos para admin e moderador (para mostrá-los de novo); para os outros o parâmetro é ignorado. Feito.
- **P35 — troca de nome pela equipe:** a espera de 7 dias do jogador recomeça a partir da troca. Feito ([[ADR - Papéis da equipe conferidos no servidor]]).
- **P36 — versões de mapas ocultos ou apagados continuam baixáveis** por id e versão (`GET /api/mapas/:id/versoes/:v`): as salas que já jogam nelas precisam, e os dados são imutáveis. Como estava.
- **P37 — GLB com `EXT_meshopt_compression` e `EXT_texture_avif` continuam recusados** (o servidor não os lê nem mede com `@gltf-transform/core` sozinho).
- **P38 — duplicar cria "Nome (cópia)"**, no registro e nos dados da versão, cortando o original para caber nos 60 caracteres (`copyName` em `server/mapRoutes.ts`). Feito.

## Decisões do dev na fase 4 (P43 a P45)

- **P43 — mapas abertos também contra bots e no campo de tiro:** na aba Mapas, o cartão de um mapa aberto (sem `exclusivo`) tem "Contra bots" e "Campo de tiro" além do Jogar online. O cliente baixa a versão atual (`fetchMapVersion`, `HomeChoice.versao`) e monta o mapa offline como faz online; o servidor só conta a jogada. Mapas exclusivos do zumbi continuam só no zumbi.
- **P44 — os 4 oficiais originais não são apagados:** `DELETE /api/mapas/:id` responde `403 mapa_protegido` para `rua`, `jardim`, `halloween` e `cemiterio`, para qualquer papel; `pode.apagar` vem falso e a tela não mostra Excluir. Oficiais criados depois podem ser apagados pela equipe.
- **P45 — nem ocultados:** `POST /api/mapas/:id/ocultar` responde `403 mapa_protegido` para os mesmos 4 (`pode.ocultar` falso, sem o botão Ocultar). O mapa padrão (`DEFAULT_MAP`), o mapa padrão de cada modo (`defaultMapFor`) e a entrada rápida dependem deles. Continuam editáveis e restauráveis; um que já estivesse oculto ainda pode ser desocultado.

## Código afetado

- `server/app.ts` (`sessionFor`, `enter`, `opening`, `sessionsChanged`), `server/maps.ts` (`MapRuntime`, `MapStore`, `mapRow`, `playable`, `allows`, `defaultMapFor`), `server/session.ts`, `server/modes.ts`, `server/navmesh.ts`.
- `shared/protocol.ts`, `shared/maps.ts`, `shared/modes.ts`.
- `client/net/maps.ts`, `client/main.ts`, `client/ui/home.ts`.
- Testes: `server/tests/sessions.test.ts`, `game.test.ts`, `modes.test.ts`, `zombies.test.ts` (helper `enterMap`).

Relacionado: [[Sessions]] · [[Matchmaking]] · [[ADR - Mapas como dados com catálogo de peças]] · [[ADR - Papéis da equipe conferidos no servidor]]
