---
title: Configuration Data
type: configuration
status: documented
area: data
source_paths:
  - shared/data/progression.json
  - shared/data/nivel_conta.json
  - shared/data/weapons/rifle_padrao.json
  - shared/data/weapons/faca.json
  - shared/data/weapons/granada_frag.json
  - shared/weapons.ts
  - shared/progression.ts
  - shared/accountLevel.ts
  - shared/constants.ts
  - shared/protocol.ts
  - shared/maps.ts
  - shared/catalog.ts
  - shared/palette.ts
  - server/config.ts
  - shared/data/weapons/pistola.json
  - shared/data/weapons/smg.json
  - shared/data/weapons/rifle_tia.json
  - shared/data/weapons/sabre.json
  - shared/arsenal.ts
tags:
  - game
  - data
  - configuration
updated: 2026-10-06
---

# Configuration Data

Dados que definem o jogo e **não mudam em tempo de execução**. Ficam no repositório, são importados por **cliente e servidor** (pasta `shared/`) e entram no build. Mudar um valor exige novo build/deploy (não há configuração remota nem *feature flags*: ver [[Feature Flags]] e [[Configurable Content]]).

## Arquivos de dados (JSON)

| Arquivo | Conteúdo | Lido por |
|---|---|---|
| `shared/data/weapons/rifle_padrao.json` | Rifle Padrão (espaço `primaria`): dano por distância, multiplicadores por região, cadência (700 rpm), alcance máximo (300 m), tempo de saque `troca` (0,45 s), ícone `icone`, pintura `visual`, modelo `.glb`, etc. | `shared/weapons.ts` (`WEAPONS`) |
| `shared/data/weapons/rifle_fita.json`, `rifle_tia.json`, `rifle_natal.json`, `rifle_chama.json`, `rifle_vovo.json`, `rifle_ouro.json` | Os rifles antigos (espaço `primaria`): cópias do Padrão com a troca de cada um, a pintura (`visual`) e a trava `libera: { arma: "rifle", pontos }` (ver [[Weapons#Rifles]]) | `shared/weapons.ts` (`WEAPONS`) |
| `shared/data/weapons/pistola.json` | Pistola do Porteiro (espaço `secundaria`): semiautomática, 400 rpm, pente 12/48, `troca` 0,3 s | `shared/weapons.ts` (`WEAPONS`) |
| `shared/data/weapons/smg.json` | Submetralhadora Liquidificador (espaço `secundaria`): automática, 950 rpm, pente 32/128, `troca` 0,35 s, trava `libera: { arma: "pistola", pontos: 1800 }` | `shared/weapons.ts` (`WEAPONS`) |
| `shared/data/weapons/faca.json` | Faca de Cozinha (`MELEE.faca`) | `shared/weapons.ts` |
| `shared/data/weapons/colher.json`, `frango.json`, `baguete.json`, `peixe.json`, `macarrao.json`, `sabre.json` | As facas antigas (`MELEE`): alcance, investida, intervalo e a trava `libera: { arma: "faca", pontos }` (ver [[Melee#As facas]]) | `shared/weapons.ts` |
| `shared/data/weapons/granada_frag.json` | Granada: quantidade 2, recarga 10 s, pavio 3 s, impacto, tempo máx. de voo 8 s, níveis (`raioDano` 7 m, `danoMax` 85, `podeMatar`) | `shared/weapons.ts` (`GRENADES`) |
| `shared/data/progression.json` | Por arma (rifle, pistola, smg, faca, granada): ícone e a lista de `melhorias`, uma por nível ≥ 2 (`nivel`, `xp`, `id`, `icone`, `opcional?`, `grupo?`, `efeitos`). Os nomes e descrições ficam em `client/ui/strings.ts` (`upg_<arma>_<id>`) | `shared/progression.ts`, aplicado por `shared/arsenal.ts` |
| `shared/data/nivel_conta.json` | Nível da conta: `porMinutoVivo` 10, `porAbate` 25, `porOpressao` 50; custo do nível n→n+1 = `round(1000 × n^1,5)` | `shared/accountLevel.ts` |

Os JSON trazem um campo `_doc` com a explicação em português. Detalhes de gameplay em [[Weapons]] e [[Progression]].

## Constantes em TypeScript

| Módulo | O quê |
|---|---|
| `shared/constants.ts` | `MOVE`, `HEALTH` (100, regen 25/s após 4 s), `SCORE`, `HUMILIATION` (janela 6 s, raio 2 m, 3,2 s), `SIM`, `CHERRY`, `BISCUIT`, `KOI`, `RAT`, `POTION`… |
| `shared/protocol.ts` | `NET` (tick 20 Hz, envio 20 Hz, interpolação 100 ms, 10 jogadores, limites de nome/chat, respawn 5 s, porta 8787, `/ws`), `FLAG` (inclui `secondary` = 512), `CLOSE` |
| `shared/maps.ts` | `OFFICIAL_MAPS` e `DEFAULT_MAP` (os mapas, com nomes e objetos, são dados: `shared/data/mapas/*.json` e, no servidor, as tabelas `map`/`map_version`) |
| `shared/account.ts` | Regras de nome, senha (8–128), e-mail (≤ 254), cooldown de nome (7 dias), carência de exclusão (30 dias) |
| `shared/catalog.ts`, `shared/palette.ts`, `shared/appearance.ts` | Catálogo de personalização, paleta e regras de aparência (validação no servidor) |

Lista consolidada em [[Constants Reference]].

> [!note]
> Resolvido: o comentário que chamava a granada online de "não letal" e a constante `ONLINE_GRENADE_LEVEL` foram removidos. A explosão vem de `grenadeStats` (`shared/arsenal.ts`), que usa o nível 1 de `granada_frag.json` (`"podeMatar": true`) com o raio da melhoria Pólvora. Ver [[Problem - Comentários dizem que a granada nível 1 não é letal]].

## Configuração de ambiente (servidor)

`server/config.ts` lê variáveis de ambiente (nomes apenas; valores reais nunca no vault — ver [[Sensitive Data]]):

| Variável | Finalidade |
|---|---|
| `DATABASE_URL` | Conexão PostgreSQL |
| `REDIS_URL` | Conexão Redis |
| `ORIGENS_PERMITIDAS` | Origens extras permitidas na API e no WebSocket (lista separada por vírgula) |
| `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `DISCORD_RETORNOS` | Login com Discord |
| `SMTP_USUARIO`, `SMTP_SENHA_APP`, `SMTP_REMETENTE` | E-mail de redefinição de senha |
| `NODE_ENV` | `production` / `test` |
| `PORT`, `HOST` | Porta e interface do servidor (`server/index.ts`) |

Referência completa (incluindo variáveis do Docker como `PG_SENHA`, `PORTA`): [[Configuration Reference]] e [[Environments]].

## Configuração do jogador

Preferências locais (`oc.settings.v1`) estão em [[Save System]] e [[Settings]].

## Código relacionado

- `shared/data/**`, `shared/*.ts`, `server/config.ts`, `server/index.ts`.
- Ver também [[Configuration]], [[Data Architecture]].
