---
title: Naming Conventions
type: reference
status: documented
area: reference
source_paths:
  - client/main.ts
  - client/core/keybinds.ts
  - client/core/settings.ts
  - client/world/surfaces.ts
  - client/world/props.ts
  - client/ui/strings.ts
  - client/ui/home.ts
  - index.html
  - server/api.ts
  - server/config.ts
  - server/redis.ts
  - server/auth/sessions.ts
  - server/migrations/001_contas.sql
  - server/tests/game.test.ts
  - shared/protocol.ts
  - shared/weapons.ts
  - shared/account.ts
  - shared/data/weapons/rifle_padrao.json
  - shared/data/progression.json
  - docker-compose.yml
  - docs/MAPAS.md
  - shared/progression.ts
  - server/migrations/003_melhorias.sql
tags:
  - reference
  - naming
  - conventions
updated: 2026-10-06
---

# Naming Conventions

Convenções **observadas** no código (não há guia de estilo escrito nem linter configurado no repositório; o `tsconfig.json` só impõe `strict` e ausência de locais/parâmetros não usados). A regra geral que emerge é:

> **Código, comentários e estrutura em inglês; domínio do jogo, dados, textos ao jogador, logs e testes em português (pt-BR).**

## Idioma por tipo de identificador

| Tipo | Idioma | Exemplos |
| --- | --- | --- |
| Classes, funções, variáveis, tipos | Inglês | `BotManager`, `GrenadeThrower`, `PropBus`, `startServer`, `computeDamage`, `pickSafeSpawn` |
| Comentários de código | Inglês, frases completas, explicam o "porquê" | "Coalesce bursts of joins/leaves into one lobby update." |
| Valores de domínio (uniões de string) | **Português**, sem acento | Regiões `'cabeca' \| 'pescoco' \| 'virilha'`; poções `'pato' \| 'veloz' \| 'lerdo' \| 'critico' \| 'bebado'`; dificuldade `'facil' \| 'normal' \| 'dificil'`; qualidade `'auto' \| 'baixa' \| 'media' \| 'alta'`; coletáveis `'cereja' \| 'biscoito'`; armas de progressão `'rifle' \| 'pistola' \| 'smg' \| 'faca' \| 'granada'` (`smg` é a exceção em inglês); espaços `'primaria' \| 'secundaria'`; ids de melhoria em camelCase pt (`'pontoVermelho' \| 'luneta' \| 'silenciador' \| 'frango' \| 'sabre' \| 'mina'`…); formas da faca `'faca' \| 'frango' \| 'sabre'`; altura `'pequeno' \| 'medio' \| 'alto'` |
| Ids de mapa | Oficiais: português/curto (`rua`, `jardim`, `halloween`, `cemiterio`); comunidade: 10 letras e dígitos aleatórios | nome exibido em `nome` dos dados do mapa |
| Chaves de superfície | Português | `grama`, `asfalto`, `calcada`, `tijolo`, `reboco`, `madeira`, `telhado`, `vidro`, `papel`, `lataria`... (`client/world/surfaces.ts`) |
| Ids de gags (`PropBus`) | Português, minúsculas, `nome[:n]` | `hidrante:1`, `fantasma`, `bruxa`, `espantalho:2`, `caldeirao` (o servidor exige `^[a-z]{1,16}(:\d{1,3})?$`) |
| Ações de input | Inglês | `fire`, `ads`, `reload`, `melee`, `grenade`, `weapon1`, `weapon2`, `swapWeapon`, `taunt`, `scoreboard`, `chat` (`client/core/keybinds.ts`) |
| Tipos de mensagem do protocolo | Inglês camelCase, campo `t` | `hello`, `playerJoined`, `tauntEnd`, `selfDamage`, `chatRefused` — exceção: `progresso` |
| Campos de mensagem | Inglês curto, às vezes 1–2 letras | `p` (posição), `s` (estado), `f` (flags), `h` (vida), `o`/`e` (origem/fim), `lo` (loadout ou escolha do Arsenal), `ap` (aparência), `w` (arma do acerto); exceções em pt: `nivel`, `armas`, `arma`, `conta`, `subiu`, `escolha` |
| Constantes | `UPPER_SNAKE` com objeto `as const` | `NET`, `MOVE`, `SCORE`, `HUMILIATION`, `BOT_SKILLS`, `LAG_SLACK`, `REVOCATION_CHANNEL` |
| Ids de DOM | Inglês kebab-case | `#hud`, `#crosshair`, `#killfeed`, `#health-fill`, `#net-status`, `#loading-tip` |

## Dados JSON (`shared/data/`)

- **Chaves em português camelCase**: `dano`, `distMax`, `multiplicadores`, `cadencia`, `pente`, `reserva`, `recarga.tatica/vazia`, `dispersao.mirando/parado/andando/noAr`, `alcanceMaximo`, `alcanceInvestida`, `quantidade`, `recargaSegundos`, `pavio`, `tempoMaximoVoo`, `bonusPulo`, `porMinutoVivo`, `porAbate`, `porOpressao`, `expoente`.
- Arquivos em `snake_case`: `rifle_padrao.json`, `pistola.json`, `smg.json`, `granada_frag.json`, `nivel_conta.json`; o `id` interno repete o nome (`"id": "rifle_padrao"`).
- Em `progression.json`, cada melhoria tem `id` em camelCase pt e `efeitos` com chaves pt (`dano`, `cadencia`, `recuo`, `mirando`, `troca`, `golpe`, `investida`, `raio`…); os textos ficam em `client/ui/strings.ts` com chaves derivadas do id: `arma_<arma>`, `armaDesc_<arma>`, `upg_<arma>_<id>`, `upgDesc_<arma>_<id>`, `fx_<efeito>`.
- Campo `_doc` (ou `_leia-me` no manifesto de texturas) com a explicação em português (o carregador do manifesto de texturas ignora explicitamente chaves que começam com `_`, em `client/world/surfaces.ts`).
- O código TypeScript que lê esses dados mantém os nomes pt (`rifle.cadencia`, `knife.alcanceInvestida`, `GRENADE.tempoMaximoVoo`).

## API HTTP e banco

- Rotas em português: `/api/auth/cadastro`, `/entrar`, `/sair`, `/recuperar`, `/redefinir`, `/api/perfil`, `/api/conta`, `/api/conta/cancelar-exclusao`, `/api/auth/discord/retorno`; exceções em inglês: `/api/me`, `/api/ws-ticket`.
- Corpos JSON em pt: `nome`, `sexo`, `aparencia`, `arsenal` (`{ secundaria, ligadas }`), `senha`; erros `{ erro: '<código>' }`.
- Códigos de erro em **pt `snake_case`** sem acento: `nao_autorizado`, `credenciais_invalidas`, `conta_suspensa`, `nome_esgotado`, `origem_invalida`, `erro_interno` (`ApiErrorCode` em `shared/account.ts`).
- Tabelas SQL em **inglês `snake_case` no singular**: `account`, `player_profile`, `weapon_progress`, `session_participation`, `sanction`, `auth_event`.
- Migrations numeradas `NNN_<nome-pt>.sql` (`001_contas.sql`, `002_aparencia.sql`, `003_melhorias.sql`) com `.down.sql` manual.

## Chaves de armazenamento e infraestrutura

| Onde | Formato | Exemplos |
| --- | --- | --- |
| `localStorage` | `oc.<nome>[.vN]` | `oc.settings.v1`, `oc.bots` |
| Cookies | `oc_<nome-pt>` | `oc_sessao`, `oc_oauth` |
| Canais Redis | `oc:<nome-pt>` | `oc:revogacao`, `oc:silencio` |
| Chaves Redis | `prefixo:...:id` | `ws:ticket:<sha256>`, `rl:login:conta:<id>`, `rl:<bucket>:ip:<ip>` |
| Tópicos do Bun | `sessao:<id>` | `sessao:principal` |
| Variáveis de ambiente | `UPPER_SNAKE`; padrões técnicos em inglês, específicas do projeto em pt | `DATABASE_URL`, `REDIS_URL`, `PORT`, `HOST` × `ORIGENS_PERMITIDAS`, `DISCORD_RETORNOS`, `SMTP_USUARIO`, `SMTP_SENHA_APP`, `PG_SENHA`, `PORTA` |
| Serviços do Compose | pt | `jogo`, `banco`, `redis`, `web` |
| `window` (dev) | `__oc*` | `window.__oc`, `window.__ocNavDebug` |

## Arquivos e pastas

- Pastas do cliente em inglês minúsculo (`core`, `render`, `world`, `entities`, `weapons`, `gameplay`, `ai`, `net`, `ui`).
- Arquivos TypeScript em **camelCase inglês** (`mapLoader.ts`, `gameMap.ts`, `spawnPicker.ts`), **exceto** o domínio do Jardim do Dragão, em português (`client/world/jardim/lanternas.ts`, `cerejeira.ts`, `peixes.ts`, `santuario.ts`), e `server/moderacao.ts`.
- Ferramentas em pt kebab-case: `tools/gerar-props-exemplo.mjs`, `tools/lab-personagens.html`; `tools/admin.ts`, `tools/offensive.ts` em inglês.
- Documentação humana em MAIÚSCULAS pt: `docs/MAPAS.md`, `docs/PERSONAGENS.md`, `docs/DEPLOY.md`.
- Nomes no Blender/glTF por prefixo: `COL_`, `SPAWN_`, `MAT_`, `DUMMY_`, `GAG_`, `KILLVOLUME` (`client/world/gltfMap.ts`, `docs/MAPAS.md`). Ver [[Asset Pipeline]].

## Textos e logs

- Strings ao jogador **só** em `client/ui/strings.ts` (dicionários `ptBR` e `en`, chaves em inglês camelCase: `cherryTaken`, `killedByWith`), acessadas por `t('chave', { param })`. Idioma pelo `navigator.language`. Exceção: falas de NPCs e placas do cenário estão em pt-BR direto no código (`GHOST_LINES`, `WITCH_SCOLDS`, `BOT_NAMES`, nomes de bonecos).
- Logs do servidor em pt-BR com prefixo de módulo entre colchetes: `[servidor]`, `[banco]`, `[progresso]`, `[api]`, `[ws]`. Ver [[Logging]].
- Mensagens de erro do protocolo em pt-BR ("Sessão lotada.").

## Testes

- `describe`/`it` em **pt-BR, frases que descrevem a regra**: `describe('ticket do WebSocket')` → `it('vale uma vez só')`; `it('o rato gigante dá uma humanidade (+vida máxima até morrer) a quem o derruba perto dele')`.
- Arquivos `*.test.ts` em `server/tests/` e `client/tests/`, com `helpers.ts`, `preload.ts`, `env.ts`. Ver [[Testing Overview]].

## Referências internas a documento de design

Comentários citam "section N" (ex.: "section 14", "section 6") e "style guide" — referências a um documento de design e a um guia de estilo de personagens que **não estão no repositório** (ver [[Documentation Status]]). `client/world/conversao/halloween.ts` (antes `hauntedTown.ts`) cita `README_Halloween.md`, também ausente.

## Commits e branches

Mistos: mensagens em inglês ("block second throw after death", "Add the Halloween map") e em pt com prefixo convencional ("fix: corrige detalhes da Vila Assombrada", "feat: teclas configuráveis"). Branches `fix/...`, `feat/...`, `chore/...`, `ci/...`. Não há convenção imposta.

## Código relacionado

- Arquivos listados em `source_paths`.

Ver também: [[Glossary]], [[File Structure Reference]], [[Utilities]].
