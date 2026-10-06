---
title: Feature Flags
type: configuration
status: documented
area: liveops
source_paths:
  - package.json
  - server/config.ts
  - server/app.ts
  - server/auth/discord.ts
  - server/email.ts
  - client/core/device.ts
  - client/main.ts
  - client/dev/characterLab.ts
tags:
  - liveops
  - feature-flags
updated: 2026-10-05
---

# Feature Flags

## Sistema de feature flags — não existe

Não existe no código atual (verificado em `package.json` — sem biblioteca de flags —, `server/config.ts` e busca por "flag"/"feature" em `client/`, `shared/` e `server/`; a constante `FLAG` em `shared/protocol.ts` é um campo de bits de animação, não feature flag).

## O que funciona como "liga/desliga"

| Mecanismo | Tipo | Efeito | Onde |
| --- | --- | --- | --- |
| Discord configurado | variável de ambiente | Botão "Entrar com Discord" aparece só se id, segredo e URL de retorno do endereço atual estiverem configurados | `server/auth/discord.ts` |
| SMTP configurado | variável de ambiente | Envia e-mail real; senão, link vai para o log | `server/email.ts` |
| `jobs: false` | opção de `startServer` | Desliga as tarefas diárias (usado nos testes) | `server/app.ts` |
| `import.meta.env.DEV` | build | Expõe `window.__oc` só em desenvolvimento | `client/main.ts` |
| `?mobile=1` / `?mobile=0` | parâmetro de URL | Força modo toque ou PC | `client/core/device.ts` |
| `?mapa=/maps/<arquivo>.glb` | parâmetro de URL | Carrega um mapa glTF | `client/main.ts` |
| `?audit=1`, `?items=...` | parâmetro de URL (lab) | Modos do laboratório de personagens | `client/dev/characterLab.ts` |
| Configurações do jogador | `localStorage` | Qualidade, som, teclas, assistência de mira... (preferências, não flags) | `client/core/settings.ts`, ver [[Settings]] |

## Código relacionado

- `server/config.ts`, `server/auth/discord.ts`, `server/email.ts`, `server/app.ts`
- `client/core/device.ts`, `client/main.ts`, `client/dev/characterLab.ts`

Ver também: [[Configuration Reference]], [[Configurable Content]].
