---
title: Validation
type: system
status: documented
area: security
source_paths:
  - server/http.ts
  - server/api.ts
  - server/app.ts
  - server/session.ts
  - server/accounts.ts
  - server/auth/password.ts
  - shared/protocol.ts
  - shared/account.ts
  - shared/appearance.ts
  - shared/progression.ts
  - server/migrations/001_contas.sql
  - client/ui/chat.ts
  - shared/arsenal.ts
  - client/net/remote.ts
tags:
  - game
  - security
  - validation
updated: 2026-10-07
---

# Validation

Validação de entrada em cada camada. As regras ficam, sempre que possível, em `shared/` para que **cliente (formulário) e servidor (autoridade)** usem a mesma função; o servidor nunca depende da validação do cliente.

## HTTP (`/api`)

| Item | Regra | Código |
|---|---|---|
| Rota | Só `MÉTODO caminho` cadastrados; resto → `404 nao_encontrado` | `server/api.ts` |
| Origem | POST/PATCH/PUT/DELETE exigem `Origin` igual ao `Host` ou em `ORIGENS_PERMITIDAS`; sem `Origin` → recusa (`403 origem_invalida`) | `originAllowed` |
| Corpo | ≤ **16 KiB** (`Content-Length` e contagem real em *stream*) → `413 corpo_grande_demais`; precisa ser **objeto JSON** → `400 json_invalido` | `readJson` |
| Cookie de sessão | ≤ 100 caracteres; hash SHA-256 casado no banco, não revogado, não vencido, conta não `deleted` | `authenticate` |
| E-mail | minúsculo, ≤ 254, formato `x@y.z` | `validEmail` |
| Senha | 8–128 caracteres; no login, só os primeiros 1024 são verificados | `validPassword`, `login` |
| Nome | `cleanName` (espaços colapsados) + `NAME_RULE`: 3–16, começa/termina com letra/número, meio com letras, números, espaço, `_`, `.`, `-` | `shared/account.ts` |
| Sexo | qualquer valor que não `f` vira `m` | `asSex` |
| Aparência | `sanitizeAppearance`: tudo fora do catálogo/paleta vira escolha válida | `shared/appearance.ts` |
| Arsenal | `sanitizeChoice(raw, xp)`: `primaria` em `PRIMARIES`, secundária em `SECONDARIES` e `faca` em `KNIVES`, todas liberadas (`weaponUnlocked`; senão voltam ao Rifle Padrão, à pistola e à faca de cozinha), só ids de melhorias **opcionais** conhecidas em `ligadas` (uma por grupo) e **comuns** conhecidas em `desligadas`; se alguma arma está trancada ou alguma melhoria ainda não foi liberada, a requisição inteira falha (`400 nivel_bloqueado`) | `setArsenal` |
| Tokens (ticket, redefinição) | ≤ 100 caracteres; procurados pelo SHA-256 | `server/app.ts`, `resetPassword` |
| Erros | sempre `{ erro: código }`; exceções inesperadas viram `500 erro_interno` sem detalhes | `handleApi` |

## WebSocket

| Item | Regra |
|---|---|
| Tamanho | `maxPayloadLength` 16 KiB |
| Formato | `JSON.parse` em try/catch; precisa ser objeto com `t` string; senão descartada |
| Taxa | token bucket 150 msg/s (excesso descartado) |
| Números | `finite()` e `vec()` (array de 3 finitos) antes de usar qualquer coordenada/tempo |
| Nome de sala | `sanitizeName(raw, 24)`: remove controles (U+0000–U+001F, U+007F) e `<` `>`, colapsa espaços |
| Mapa | `isMapId` ou `DEFAULT_MAP` |
| Chat | `sanitizeChat`: corta em 480 chars antes de processar, troca quebras/tabs por espaço, remove controles C0/C1, *zero-width* (exceto ZWJ, para emojis) e **overrides bidirecionais** (evita falsificar nome alheio), colapsa espaços, limita a **120 code points** |
| Prop | regex `^[a-z]{1,16}(:\d{1,3})?$` |
| Região de acerto | lista `HIT_REGIONS` |
| Arma do acerto (`w`) | `isGun` (os sete rifles e as sete secundárias); precisa ser a arma em mãos ou a guardada há < 1 s, e estar no loadout (`firedGun`): um rifle que não é o escolhido é ignorado |
| Golpe (`stab`) | alcance e intervalo da **faca do loadout** com as melhorias (`loadoutKnife`), + 1,5 m de folga |
| Escolha do Arsenal (`loadout`) | `equip` → `sanitizeChoice(raw, xp)`: melhorias não liberadas são descartadas e a secundária trancada (qualquer uma das seis com trava em pontos de pistola) vira a pistola (sem erro); o `Loadout` é resolvido no servidor (`loadoutOf`) |
| `Loadout` recebido pelo cliente (`playerLoadout`, `PlayerInfo.lo`) | `sanitizeLoadout` em `client/net/remote.ts`: ids desconhecidos descartados; serve só para desenhar, nunca para regras |
| Ids de itens/criaturas | precisam existir no mapa da sala |
| Pitch | limitado a ±1,6 rad; flags `| 0` |
| `rtt` | limitado a 0–9999 |

Regras de gameplay (cadência, distância, janelas) estão em [[Anti Cheat]].

## Saída / renderização

- Chat e nomes no chat são escritos com `textContent`, nunca HTML (`client/ui/chat.ts`; o comentário de `sanitizeChat` diz que `<3` continua aparecendo).
- Nomes nas placas dos jogadores são desenhados em `<canvas>` (`client/net/remote.ts`), sem HTML.

- Lista de salas (`client/ui/home.ts`): o esqueleto do item usa `innerHTML` só com números e textos próprios; o **nome da sala** (vindo de outro jogador) é escrito com `textContent`. Além disso, já chega sem `<` e `>` (`sanitizeName`).

> [!warning]
> Não foi feita auditoria de todos os usos de `innerHTML` do cliente; os pontos acima (chat, placas, lista de salas) foram conferidos.

## Arquivos estáticos

`staticFile()` decodifica o caminho, aplica `normalize`, remove `..` iniciais e **recusa qualquer caminho fora de `dist/`**; o que não existe recebe `index.html`.

## Banco

- Consultas parametrizadas em todo o código.
- Restrições no schema: `CHECK` de `status`, `sex`, `provider`, `weapon`, `type` de sanção, faixa do discriminador; `UNIQUE` de e-mail (citext), tag, identidade externa, hash de sessão.
- Corridas de cadastro (mesma tag ou e-mail) tratadas por código `23505`: refaz a tag ou devolve `409 email_em_uso`.

## Código relacionado

- `server/http.ts`, `server/api.ts`, `server/app.ts`, `server/session.ts`, `server/accounts.ts`, `server/auth/password.ts`.
- `shared/protocol.ts` (`sanitizeName`, `sanitizeChat`), `shared/account.ts`, `shared/appearance.ts`, `shared/progression.ts`.
- Ver também [[Remote Calls]], [[APIs]], [[Error Handling]], [[Security Overview]].
