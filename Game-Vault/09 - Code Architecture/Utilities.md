---
title: Utilities
type: module
status: documented
area: code-architecture
source_paths:
  - server/http.ts
  - server/redis.ts
  - server/db.ts
  - shared/protocol.ts
  - shared/account.ts
  - shared/palette.ts
  - shared/weapons.ts
  - client/core/loop.ts
  - client/core/keybinds.ts
  - client/core/device.ts
  - client/render/materials.ts
  - client/render/springs.ts
  - client/world/canvasText.ts
  - client/world/mapBuilder.ts
  - client/audio/spatial.ts
  - client/ui/strings.ts
  - client/gameplay/spawnPicker.ts
  - client/gameplay/targets.ts
tags:
  - architecture
  - utilities
updated: 2026-10-05
---

# Utilities

Não existe uma pasta `utils/` nem `helpers/`. Os utilitários ficam **no módulo do domínio que os usa** e são exportados de lá. Esta nota lista os que são reutilizados em mais de um lugar ou que são puros (sem estado), para facilitar a busca.

## Servidor

| Função | Arquivo | O que faz |
| --- | --- | --- |
| `json(status, body, extra)`, `redirect(to, extra)` | `server/http.ts` | Respostas com `cache-control: no-store`; `HeaderMap` aceita array para repetir cabeçalhos (vários `Set-Cookie`) |
| `readJson(req)` | `server/http.ts` | Lê o corpo com limite de 16 KiB e exige objeto JSON |
| `readCookies(req)`, `cookie(req, name, value, maxAge, path)` | `server/http.ts` | Cookies `HttpOnly; SameSite=Lax`, `Secure` só sob HTTPS (via `X-Forwarded-Proto`) |
| `clientIp(req)`, `setPeer(req, addr)` | `server/http.ts` | IP do jogador; confia em `X-Forwarded-For` só se a conexão veio de rede privada (proxy local) |
| `originAllowed(req)`, `publicOrigin(req)`, `isHttps(req)`, `userAgent(req)` | `server/http.ts` | Proteção CSRF/CSWSH e dados da requisição |
| `randomToken()`, `sha256()`, `sha256hex()` | `server/http.ts` | 32 bytes aleatórios em base64url; hashes via `Bun.CryptoHasher` |
| `hit(redis, key, seconds)` | `server/redis.ts` | Contador de janela fixa (`INCR` + `EXPIRE NX`) para rate limit |
| `transaction(db, fn)` | `server/db.ts` | `BEGIN`/`COMMIT`/`ROLLBACK` com liberação do cliente do pool |

## Compartilhados (`shared/`)

| Função | Arquivo | O que faz |
| --- | --- | --- |
| `sanitizeName(raw, max)` | `shared/protocol.ts` | Remove controles e `<>`, colapsa espaços, corta |
| `sanitizeChat(raw)` | `shared/protocol.ts` | Remove controles e overrides bidirecionais, corta por code point (não quebra emoji) |
| `asSex(v)` | `shared/protocol.ts` | Normaliza para `'m' \| 'f'` |
| `cleanName`, `validName`, `validEmail`, `validPassword`, `formatTag` | `shared/account.ts` | Regras de conta e formato `Nome#1234` |
| `snap(hex, allowed, fallback)` | `shared/palette.ts` | Aproxima uma cor da paleta permitida |
| `groups(membership, filter)` | `shared/constants.ts` | Grupos de interação do Rapier (`(membership << 16) \| filter`) |
| `computeDamage`, `damageAtDistance`, `explosionDamage`, `idealTtk` | `shared/weapons.ts` | Fórmulas puras de dano (detalhe em [[Damage System]]) |

## Cliente

| Função / classe | Arquivo | O que faz |
| --- | --- | --- |
| `startLoop(step, render)` | `client/core/loop.ts` | Laço de passo fixo + interpolação |
| `assign`, `clearSlot`, `mergeKeybinds`, `toBindings`, `keyLabel`, `bindRefusal` | `client/core/keybinds.ts` | Regras puras de teclas (testadas em `client/tests/keybinds.test.ts`) |
| `IS_MOBILE`, `IS_IOS`, `enterFullscreen`, `keepEscape`, `isPortrait` | `client/core/device.ts` | Detecção de dispositivo e tela cheia |
| `t(key, params)`, `pick(list)`, `getLang`, `setLang` | `client/ui/strings.ts` | Tradução com `{param}` e sorteio de item |
| `toonGradient()`, `toon()`, `mergeColoredParts(parts)`, `PALETTE` | `client/render/materials.ts` | Material toon e fusão de peças coloridas por vértice num único `BufferGeometry` (usado pelos NPCs de cenário e props) |
| `Spring` | `client/render/springs.ts` | Mola amortecida para as camadas procedurais da primeira pessoa |
| `fitText(...)` | `client/world/canvasText.ts` | Ajusta texto a uma placa em canvas |
| `worldUVs`, `boxProjectUVs`, `stairSteps`, `stairRun` | `client/world/mapBuilder.ts` | UVs em metros e dimensionamento de escadas |
| `distanceGain`, `voiceParams`, `Enclosure`, `BodySounds`, `skySpot` | `client/audio/spatial.ts` | Matemática de som espacial sem Web Audio (testada em `client/tests/spatial.test.ts`) |
| `pickSafeSpawn(spawns, threats, physics)` | `client/gameplay/spawnPicker.ts` | Escolha de spawn da seção 6 (usada online e contra bots) |
| `nearestHumiliable(items, feet, radius, time)` | `client/gameplay/targets.ts` | Corpo oprimível mais próximo |
| `groundBelow(world, p)` | `client/gameplay/corpse.ts` | Altura do chão sob um ponto |

## Pequenos helpers repetidos

Alguns helpers são redefinidos localmente em vez de importados (inferência: duplicação pequena e intencional):

- `angleDiff` (`client/ai/bot.ts`) e `lerpAngle` (`client/net/remote.ts`): normalização de ângulo para ±π.
- `nameplate(...)` em `client/ai/bot.ts` e em `client/net/remote.ts` (quase idênticos, mudando a cor), além de `namePlate` em `client/world/dog.ts`.
- `dist3`, `finite`, `vec` em `server/session.ts`; `vec3(v)` (arredonda a 3 casas para o protocolo) em `client/main.ts`.

Candidatos a consolidação: ver [[Technical Debt]].

## Código relacionado

- Arquivos listados nas tabelas acima.

Ver também: [[Modules]], [[Naming Conventions]].
