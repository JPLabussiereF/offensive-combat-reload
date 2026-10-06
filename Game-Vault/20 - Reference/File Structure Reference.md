---
title: File Structure Reference
type: reference
status: documented
area: reference
source_paths:
  - README.md
  - package.json
  - client/main.ts
  - server/index.ts
  - shared/protocol.ts
  - shared/arsenal.ts
  - shared/progression.ts
tags:
  - reference
  - file-structure
updated: 2026-10-06
---

# File Structure Reference

Árvore real do repositório (branch `main`, 193 arquivos versionados fora do Vault), com uma linha de propósito por pasta e por arquivo-chave. As descrições vêm dos comentários de cabeçalho de cada arquivo. Para responsabilidades e dependências, ver [[Modules]]; para a organização conceitual, [[Code Architecture Overview]].

## Raiz

```text
offensive-combat/
├── index.html              Página única do jogo: DOM do HUD, menus, home; carrega client/main.ts
├── package.json            Scripts bun (dev, dev:online, build, start, test, typecheck, admin...), dependências, bin "offensive"
├── bun.lock                Lockfile do Bun
├── bunfig.toml             Bun roda os binários (vite/tsc); testes: raiz ".", preload do banco de teste, timeout 20 s
├── tsconfig.json           TS do cliente + shared (DOM, strict, alias @shared/*)
├── vite.config.ts          Vite: alias @shared, porta 5173, proxy /api e /ws → :8787
├── Dockerfile              Uma build, duas imagens: server (Bun) e web (nginx)
├── docker-compose.yml      Serviços jogo, web, banco (Postgres 18), redis (Redis 8)
├── README.md               Visão do projeto, controles, regras, decisões da fase 1
├── .github/workflows/ci.yml  CI em PRs para main: typecheck + bun test com Postgres e Redis
├── .gitignore / .dockerignore
├── client/                 Jogo no navegador (Three.js + Rapier)
├── server/                 Servidor Bun (API, WebSocket, sessões)
├── shared/                 Código e dados usados pelos dois lados
├── public/                 Arquivos servidos como estão (texturas, modelos, mapas .glb, decodificador KTX2)
├── tools/                  CLIs e geradores
├── deploy/                 nginx e systemd para hospedar sem/com Docker
├── docs/                   Documentação humana (MAPAS, PERSONAGENS, DEPLOY)
└── Game-Vault/             Este cofre Obsidian
```

## `client/`

```text
client/
├── main.ts                 boot(): orquestra o jogo inteiro (≈1.890 linhas)
├── styles.css              Todo o CSS (HUD, menus, home, editor, toque)
├── ai/
│   ├── bot.ts              Bot: jogador dirigido por código (percepção, decisão, mira, gatilho)
│   ├── bots.ts             BotManager: mata-mata offline contra bots (dano, prêmios, corpos, respawn)
│   └── navmesh.ts          NavMap: navmesh Recast a partir dos colisores estáticos
├── audio/
│   ├── sfx.ts              Sons procedurais em Web Audio (barramentos de mixagem)
│   └── spatial.ts          Matemática de som espacial (distância, oclusão, eco), testável
├── character/              Sistema modular de personagens
│   ├── animator.ts         Animação procedural em 3ª pessoa (pés plantados + camada de cima)
│   ├── body.ts             Corpo base masculino/feminino, low poly facetado
│   ├── builder.ts          Geometria facetada e skinnada no formato de um GLB
│   ├── character.ts        Character: corpo + peças no mesmo esqueleto
│   ├── material.ts         Material do personagem (flat, atlas da paleta)
│   ├── palette.ts          Atlas de cores 256×256
│   ├── registry.ts         AssetRegistry: todo item vestível/segurável (GLB ou procedural)
│   ├── rig.ts              Esqueleto canônico, regiões, sockets
│   ├── items/              Definições de itens por categoria (accessories, bottoms, head, jackets, shoes, tactical, tops, common)
│   └── pieces/             Geração procedural das peças (hair, tops, sweaters, jackets, bottoms, shoes, headwear, accessories, tactical, rigid, kit, common, index)
├── core/
│   ├── loop.ts             Passo fixo 1/60 s + render interpolado
│   ├── input.ts            Ações nomeadas (teclado/mouse/toque/controle), pointer lock
│   ├── keybinds.ts         Regras puras de teclas remapeáveis
│   ├── gamepad.ts          Controles PS/Xbox pela Gamepad API
│   ├── device.ts           PC × celular, tela cheia, Esc preso
│   └── settings.ts         Preferências em localStorage (oc.settings.v1)
├── dev/
│   ├── characterLab.ts     Laboratório de personagens (tools/lab-personagens.html)
│   └── audit.ts            Checklist automático do catálogo (?audit=1)
├── entities/
│   ├── localPlayer.ts      Jogador local: corpo cinemático + movimento compartilhado + vida
│   ├── avatar.ts           Personagem em 3ª pessoa (adaptador sobre character/)
│   ├── rig.ts              CharacterRig: hitboxes + bloqueador que seguem o personagem
│   ├── hitboxes.ts         As 15 formas de hitbox nos ossos
│   ├── heldWeapons.ts      Armas vistas na mão dos outros (heldGun, heldKnife, heldGrenade)
│   └── dummy.ts            Bonecos de treino
├── gameplay/
│   ├── targets.ts          Contratos Target / Humiliable / HitboxRegistry
│   ├── corpse.ts           Corpo oprimível (online e contra bots)
│   ├── taunt.ts            Dança da opressão
│   ├── spawnPicker.ts      Escolha de spawn seguro (seção 6)
│   ├── progress.ts         Progressão das armas no cliente
│   └── aimAssist.ts        Assistência de mira (toque/controle)
├── net/
│   ├── api.ts              Cliente HTTP da API de contas (ApiError)
│   ├── connection.ts       WebSocket: despacho, hold/release, relógio, ping
│   └── remote.ts           Jogadores remotos interpolados e corpos online
├── render/
│   ├── renderer.ts         RenderContext (renderer, cenas, câmeras, sol), atmosfera
│   ├── quality.ts          Presets e resolução dinâmica; detecção de render sem GPU
│   ├── effects.ts          Efeitos em pool (decals, partículas, traçantes, luz de boca)
│   ├── materials.ts        Material toon, mesclagem de peças coloridas, PALETTE
│   ├── springs.ts          Molas amortecidas da 1ª pessoa
│   ├── viewmodel.ts        Braços + arma em 1ª pessoa (cena própria)
│   ├── viewmodelArms.ts    Braços da 1ª pessoa
│   └── weaponModels.ts     Modelos das armas de fogo com as melhorias (gunParts), formas da faca e mina
├── tests/                  Testes bun:test de lógica pura do cliente (aimAssist, arsenalText, keybinds, spatial)
├── ui/
│   ├── home.ts             Home: conta, lobby online, bots, treino (HomeChoice)
│   ├── auth.ts             Formulários de login/cadastro/senha
│   ├── profile.ts          Aba de perfil
│   ├── customize.ts        Editor de personagem
│   ├── menu.ts             Carregamento e menu inicial/pausa (Screens)
│   ├── hud.ts              HUD em DOM (Hud)
│   ├── chat.ts             Chat da sessão
│   ├── scoreboard.ts       Placar (Tab)
│   ├── arsenal.ts          Painel Arsenal: secundária, níveis e melhorias das armas
│   ├── corpseTimer.ts      Contagem sobre corpos oprimíveis
│   ├── touch.ts            Controles de toque estilo CoD Mobile
│   ├── padNav.ts           Navegação de menus com controle
│   ├── tuning.ts           Painel de ajuste ao vivo (F6)
│   └── strings.ts          Todas as strings (pt-BR e en), t()
├── weapons/
│   ├── weapon.ts           Lógica da arma de fogo (dados → comportamento); uma instância por espaço
│   ├── hitscan.ts          Raio de tiro, penetração
│   ├── remoteImpact.ts     Onde o tiro de outro jogador bateu no mapa (marca, faíscas, som)
│   ├── melee.ts            Faca
│   ├── grenades.ts         GrenadeThrower (mão) + GrenadeProjectiles (mundo)
│   └── mines.ts            Minas terrestres
└── world/
    ├── physics.ts          World Rapier, tabela de superfícies
    ├── mapBuilder.ts       MapBuilder: geometria estática + colisores
    ├── surfaces.ts         Biblioteca de superfícies e texturas trocáveis
    ├── textures.ts         Texturas procedurais pintadas
    ├── props.ts            PropBus: gags sincronizados
    ├── gltfMap.ts          Mapas/props do Blender (COL_, SPAWN_, MAT_, DUMMY_...)
    ├── blockoutMap.ts      Mapa "Rua dos Vizinhos" + interface GameMap
    ├── dragonGarden.ts     Mapa "Jardim do Dragão" (monta os setores de jardim/)
    ├── hauntedTown.ts      Mapa "Vila Assombrada"
    ├── halloween.ts        Peças e gags da Vila (fantasma, bruxa, rato, caldeirão...)
    ├── oriental.ts         Peças orientais (telhados, pavilhões, lanternas...)
    ├── furniture.ts        Móveis e props genéricos
    ├── vehicles.ts         Carros e veículos da rua
    ├── decor.ts            Sorvete gigante e flamingos
    ├── hydrant.ts          Gag do hidrante
    ├── dog.ts              Amora, a Chow Chow
    ├── canvasText.ts       Texto que cabe em placas
    └── jardim/             Setores e peças do Jardim do Dragão (pt-BR): bambu, bonsai, casa, cereja,
                            cerejeira, frutas, guerreiros, kit, lago, lanternas, luzes, panda, peixes, santuario
```

## `server/`

```text
server/
├── index.ts                Entrada: PORT/HOST, startServer, SIGTERM/SIGINT
├── app.ts                  startServer(): Bun.serve (HTTP + WS), lobby, flush, revogação
├── session.ts              Session: uma partida de mata-mata livre (autoridade)
├── progress.ts             LiveAccount e XP em memória
├── api.ts                  Rotas /api/* (contas, perfil, ticket do WS)
├── http.ts                 Helpers HTTP e HttpError
├── accounts.ts             Todas as consultas SQL de jogadores
├── db.ts                   Pool pg, migrations, transaction
├── redis.ts                ioredis, canais oc:revogacao/oc:silencio, hit()
├── jobs.ts                 Manutenção diária (partições de auditoria, anonimização)
├── config.ts               CONFIG a partir do ambiente
├── email.ts                SMTP ou outbox/console
├── moderacao.ts            Banir, silenciar, papéis (para tools/admin.ts)
├── tsconfig.json           TS do servidor (tipos do Bun; inclui shared, tools, client/tests)
├── auth/
│   ├── sessions.ts         Cookie oc_sessao, autenticação, revogação
│   ├── password.ts         Cadastro, login com limites, recuperação de senha
│   └── discord.ts          OAuth Discord (PKCE, arctic)
├── migrations/             001_contas.sql, 002_aparencia.sql, 003_melhorias.sql (+ .down.sql manuais)
└── tests/                  bun:test de integração (auth, game, appearance), unitário (arsenal) + helpers, preload, env
```

## `shared/`

```text
shared/
├── protocol.ts             NET, FLAG, ClientMsg/ServerMsg, CLOSE, sanitizeName/Chat
├── constants.ts            MOVE, HEALTH, SCORE, HUMILIATION, SIM, GROUP, CHERRY, BISCUIT, POTION, RAT, KOI
├── maps.ts                 Ids de mapa e posições de coletáveis/bruxa/ratos/peixes
├── weapons.ts              Esquema e fórmulas de armas
├── movement.ts             Passo de movimento sobre o Rapier
├── progression.ts          Níveis e melhorias das armas, ArsenalChoice, PRIMARIES/SECONDARIES
├── arsenal.ts              Loadout e atributos com as melhorias (gunStats, meleeStats, grenadeStats)
├── accountLevel.ts         Nível da conta
├── account.ts              Regras e tipos da API de contas, ApiErrorCode
├── appearance.ts           Aparência e bodyStats
├── catalog.ts              Catálogo de itens do personagem
├── palette.ts              Paleta de cores
└── data/
    ├── progression.json    Melhorias de cada arma por nível
    ├── nivel_conta.json    Curva do nível da conta
    └── weapons/            rifle_padrao.json, pistola.json, smg.json, faca.json, granada_frag.json
```

## Demais pastas

```text
public/
├── basis/                  basis_transcoder.js/.wasm (decodificador KTX2)
├── maps/arena_teste.glb    Mapa glTF de exemplo (?mapa=/maps/arena_teste.glb)
├── models/casinha_cachorro.glb  Prop glTF de exemplo (casinha da Amora)
├── textures/manifest.json  Substituição de texturas por arquivo (vazio hoje)
├── icon.svg, manifest.webmanifest  PWA (Adicionar à Tela de Início)
tools/
├── offensive.ts            CLI "offensive": sobe/para/logs/status/firewall da stack Docker
├── dev-online.ts           Sobe servidor (watch) + Vite juntos
├── admin.ts                Console de moderação (banir, silenciar, papéis, sanções)
├── gerar-props-exemplo.mjs Gera os .glb de exemplo com @gltf-transform/core
└── lab-personagens.html    Página do laboratório de personagens
deploy/
├── nginx/docker.conf       nginx da imagem web (estáticos + proxy /ws, limites)
├── nginx/offensive-combat.conf  nginx sem Docker
└── offensive-combat.service     Unidade systemd do servidor
docs/
├── DEPLOY.md               Publicar e jogar com amigos; contas, e-mail, Discord
├── MAPAS.md                Criar mapas, props e texturas (código e Blender)
└── PERSONAGENS.md          Sistema modular de personagens e Blender
```

## Pastas geradas (não versionadas)

`node_modules/`, `dist/` (build do Vite, servido pelo servidor em produção), `build/` (`server.js`, `admin.js` do `bun build`) — listadas no `.gitignore`.

## Código relacionado

- `README.md` (seção "Estrutura"), `package.json`, cabeçalhos de cada arquivo

Ver também: [[Naming Conventions]], [[Modules]], [[Build Pipeline]].
