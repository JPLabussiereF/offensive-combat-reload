---
title: Security Overview
type: architecture
status: documented
area: security
source_paths:
  - shared/roles.ts
  - server/glb.ts
  - server/app.ts
  - server/api.ts
  - server/http.ts
  - server/auth/sessions.ts
  - server/auth/password.ts
  - server/auth/discord.ts
  - server/session.ts
  - server/moderacao.ts
  - shared/protocol.ts
  - deploy/nginx/docker.conf
  - deploy/nginx/offensive-combat.conf
  - docker-compose.yml
  - server/tests/auth.test.ts
  - server/tests/game.test.ts
tags:
  - game
  - security
updated: 2026-10-06
---

# Security Overview

## Visão geral

A segurança do Offensive Combat se apoia em quatro ideias, todas confirmadas no código:

1. **O navegador nunca guarda um token legível**: a sessão é um cookie `HttpOnly` opaco (o servidor faz papel de BFF) e o WebSocket abre com um **ticket de uso único de 30 s**. Ver [[Authentication]] e [[ADR - Ticket de uso único para o WebSocket]].
2. **O servidor é a autoridade das regras** e valida cada relatório do cliente ([[Anti Cheat]]). Movimento ainda é confiado ([[ADR - Movimento confiado ao cliente]]).
3. **Mesma origem**: toda requisição que muda estado e todo handshake WebSocket exigem `Origin` do próprio site (ou de `ORIGENS_PERMITIDAS`) — proteção contra CSRF e *cross-site WebSocket hijacking*.
4. **Defesa em camadas contra abuso**: limites no nginx, no Redis (por IP e por conta) e no servidor do jogo (token bucket, chat). Ver [[Anti Exploit]].

## Mapa de controles

| Ameaça | Controle | Nota |
|---|---|---|
| Roubo de sessão por XSS | Cookie `HttpOnly; SameSite=Lax` (+ `Secure` em HTTPS); nada em `localStorage`; chat e nomes renderizados com `textContent` | [[Sensitive Data]], [[Validation]] |
| CSRF / WS hijacking | Checagem de `Origin` em POST/PATCH/PUT/DELETE e no `/ws` | [[Trust Boundaries]] |
| Vazamento de token em log | Ticket de uso único (GETDEL); tokens guardados como SHA-256; a API nunca loga a requisição | [[Sensitive Data]] |
| Força bruta de senha | 5 tentativas/min por IP; bloqueio da conta por 15 min após 10 falhas; nginx 10 req/min nas rotas de auth | [[Anti Exploit]] |
| Enumeração de e-mails | Mesma resposta e tempo para e-mail inexistente e senha errada; redefinição sempre responde igual | [[Authentication]] |
| Senhas vazadas do banco | Argon2id (19 MiB, 2 passadas) | [[Sensitive Data]] |
| Flood no WebSocket | 150 msg/s por conexão; 16 KiB por mensagem; nginx 6 conexões/IP | [[Anti Exploit]] |
| Spam / abuso no chat | Sanitização, 4 de rajada + 1/1,5 s, silêncio por conta | [[Chat]], [[Moderation]] |
| Trapaça de gameplay | Validação de acertos, cadência, distância, itens, respawn | [[Anti Cheat]] |
| Conta banida continuar jogando | Banimento revoga sessões e fecha a conexão na hora via Redis | [[Moderation]] |
| Moderador agindo sobre admin, escalada de papel | Regras puras de `shared/roles.ts`, papéis lidos do banco a cada pedido, auditoria com `actor_id`, matriz de testes | [[ADR - Papéis da equipe conferidos no servidor]] |
| Upload de GLB malicioso | Cabeçalho glTF 2 e parse com `@gltf-transform/core`; nada fora do arquivo (sem URI externa); só extensões que o carregador aceita (sem Draco); textura até 2048 px; até 2000 nós; até 10 MB; nome pelo SHA-256; limite de envios e cota por conta; servido com `Content-Type: model/gltf-binary` e `nosniff` (`server/glb.ts`) | [[Anti Exploit]] |
| Mapa que trava o servidor ou aponta para fora | Dados validados (`validateMapData`); modelos só do jogo (`/models/`) ou enviados (`/api/mapas/arquivos/<sha256>.glb`); montagem e orçamento numa thread com limite de tempo (`server/mapWorker.ts`) | [[APIs]] |
| Path traversal nos estáticos | `normalize` + verificação de prefixo `dist/` | [[Validation]] |
| Exposição de serviços internos | Só nginx publicado; jogo em rede interna; Postgres/Redis em `127.0.0.1` | [[Trust Boundaries]] |
| Privacidade (LGPD) | Exclusão com carência de 30 dias e anonimização | [[Sensitive Data]] |

## Limitações conhecidas

- Gameplay: posição, região do acerto e posição de explosão de granada com pavio são confiadas ([[Problem - Lacunas de validação de gameplay online]]).
- Não foram encontrados cabeçalhos `Content-Security-Policy`, `X-Frame-Options`, `Strict-Transport-Security` ou `Referrer-Policy` no nginx nem no servidor (busca em `deploy/`, `server/`, `index.html`, `vite.config.ts`).
- O console `tools/admin.ts` age com acesso direto ao banco e ao Redis e grava `by = null`; pela API, a equipe é identificada.
- A montagem de um mapa ao salvar pode levar segundos com peças caras (por exemplo esferas com muitos segmentos); a thread tem limite de 120 s e é reiniciada, mas não há fila por conta nem limite de salvamentos por hora.
- O HTTPS depende da infraestrutura (certbot no nginx ou túnel Cloudflare); o servidor confia em `X-Forwarded-Proto` para marcar o cookie como `Secure`. Ver [[Hosting]].
- Não há verificação de e-mail no cadastro; o e-mail só é marcado como verificado ao usar um link de redefinição.

## Testes de segurança existentes

`server/tests/auth.test.ts`, `server/tests/game.test.ts`, `server/tests/management.test.ts` (matriz de papéis) e `server/tests/maps.test.ts` (permissões de mapas, GLB grande, quebrado, com URI externa ou extensão recusada) cobrem: atributos do cookie, erro igual para senha errada e e-mail inexistente, limite por IP (6ª tentativa), bloqueio após 10 falhas, logout revoga, cookie forjado recusado, origem estranha recusada, redefinição de senha de uso único que derruba sessões, ticket de uso único / expiração / origem / GET comum, sem sessão sem ticket, nome vindo da conta, conexão nova derruba a antiga, logout e banimento encerram a partida, chat sanitizado, flood de chat e silêncio em partida. Ver [[Testing Overview]].

## Notas desta área

[[Trust Boundaries]] · [[Validation]] · [[Anti Exploit]] · [[Sensitive Data]] · (gameplay) [[Anti Cheat]]

## Código relacionado

- `server/http.ts` (`originAllowed`, `clientIp`, `cookie`, `readJson`), `server/api.ts`, `server/app.ts`, `server/auth/*.ts`, `server/session.ts`, `server/moderacao.ts`, `shared/protocol.ts` (sanitizadores), `deploy/nginx/*.conf`.
