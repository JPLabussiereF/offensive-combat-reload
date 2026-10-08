---
title: ADR - Mapas oficiais do repositório publicados na subida
type: decision
status: documented
area: data
source_paths:
  - server/maps.ts
  - server/app.ts
  - server/migrations/004_mapas.sql
  - shared/data/mapas/cemiterio.json
  - server/tests/maps.test.ts
tags:
  - decision
  - adr
  - maps
  - data
updated: 2026-10-07
---

# ADR - Mapas oficiais do repositório publicados na subida

## Contexto

Desde a PF-6 os mapas vivem no banco (`map`, com as versões imutáveis em `map_version`; ver [[ADR - Mapas como dados com catálogo de peças]] e [[ADR - Sessões sob demanda por versão do mapa]]). Os 4 oficiais também existem no repositório (`shared/data/mapas/*.json`), porque o treino e os bots jogam sem servidor. Na subida, `seedOfficialMaps` (`server/maps.ts`) gravava a **versão 1** de cada oficial que o banco ainda não tinha e **pulava** os que já existiam.

## Problema

Uma mudança no JSON de um oficial depois da primeira subida nunca chegava a um banco que já tinha o mapa. O caso que mostrou isso foi o totem da Vigília Sem Trégua (PR #51, 2026-10-07): o `cemiterio.json` ganhou `zumbi.totem` e perdeu duas velas, mas o banco local (e o de produção) continuou jogando a versão 1. O totem não aparecia online (`client/zombies/client.ts` só cria o totem com `map.totem`), e as velas antigas seguiam no altar. Os testes passavam porque rodam num banco novo.

## Opções consideradas

1. **Deixar como estava** e aplicar cada mudança de oficial pelo editor. É um passo manual, fácil de esquecer, e o JSON do repositório e o banco divergem sem aviso.
2. **Sempre sobrescrever com o arquivo** a cada subida. Desfaria toda edição da equipe pelo editor a cada reinício.
3. **Publicar uma versão nova só quando o arquivo mudou** desde a última versão tirada dele. Escolhida.

## Decisão

Na subida, para cada `shared/data/mapas/<id>.json` (fora os `*.golden.json`):

- Sem o mapa no banco: cria a versão 1, como antes.
- Com o mapa: compara o arquivo (como `jsonb`) com a **última versão vinda do repositório**, isto é, a última com `created_by` nulo, porque os salvamentos da equipe gravam a conta de quem salvou. Se for diferente, valida, monta (`MapBuilderPool`), grava uma **versão nova** com o arquivo e a torna a atual (`current_version`, `name`, `exclusive_mode`).
- Se o arquivo não mudou, não faz nada, mesmo que a equipe tenha editado o mapa depois.
- Mapa apagado (`deleted_at`) é pulado.
- A trava da linha do mapa (`FOR UPDATE`) e uma nova comparação dentro da transação evitam versões repetidas com dois servidores subindo juntos.

Conflito com edição da equipe (decisão do dev em 2026-10-07): **o repositório vence**. A versão do arquivo vira a atual, e a edição da equipe continua no histórico, restaurável pela aba Mapas.

## Motivo

A mudança feita no código chega a todo ambiente só com `docker compose up --build` (ou o deploy), sem passo manual. O que a equipe editou não se perde, e o histórico de versões do PF-6 continua imutável.

## Consequências

- Partidas em andamento terminam na versão em que começaram; as salas novas abrem na versão publicada.
- Se o arquivo de um oficial mudar, uma edição da equipe naquele mapa deixa de ser a atual na próxima subida (fica no histórico). Quem edita oficiais pelo editor deve levar a mudança para o JSON do repositório, se quiser mantê-la.
- A navmesh vem do arquivo pré-gerado (`shared/data/navmesh/<id>.json`). Mudou a geometria de um mapa zumbi, rode `bun run navmesh` antes, como na versão 1.
- Nenhuma migration nova: a origem de cada versão já estava em `created_by`.

## Código afetado

- `server/maps.ts`: `seedOfficialMaps`, `sameAsSeeded`.
- `server/tests/maps.test.ts`: "o JSON de um oficial que mudou vira versão nova e atual na subida; o mesmo JSON não cria nada nem desfaz a edição da equipe" ([[Integration Tests]]).
