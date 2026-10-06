---
title: APIs
type: service
status: documented
area: backend
source_paths:
  - server/api.ts
  - server/http.ts
  - server/auth/password.ts
  - server/auth/discord.ts
  - server/auth/sessions.ts
  - shared/account.ts
  - client/net/api.ts
  - deploy/nginx/docker.conf
tags:
  - backend
  - api
  - http
updated: 2026-10-05
---

# APIs

A API HTTP do jogo vive sob `/api/` e é atendida pelo próprio servidor do jogo (`handleApi` em `server/api.ts`). Não há versionamento de rota (`/v1`) nem documentação OpenAPI.

## Convenções

| Aspecto | Regra (código confirmado) |
| --- | --- |
| Formato | JSON de entrada e saída; respostas com `cache-control: no-store`. |
| Erros | Corpo `{ "erro": "<código>" }` (+ campos extras, ex.: `ate` na suspensão). Códigos em `ApiErrorCode` (`shared/account.ts`). Erro inesperado → `500 { erro: "erro_interno" }`. |
| Roteamento | Mapa `"MÉTODO /caminho"` → handler. Rota desconhecida → `404 nao_encontrado`. |
| Origem | Métodos `POST/PATCH/PUT/DELETE` exigem `Origin` do mesmo host ou listado em `ORIGENS_PERMITIDAS`; senão `403 origem_invalida` (proteção CSRF). |
| Corpo | Máximo de **16 KiB** (`readJson`): acima disso `413 corpo_grande_demais`; JSON que não é objeto → `400 json_invalido`. |
| Sessão | Cookie `oc_sessao` (HttpOnly). Rotas autenticadas usam `requireSession`, que também renova a validade e recusa contas banidas (`403 conta_suspensa`). |
| Log | O servidor **nunca** registra a requisição (pode ter senha/cookie); só `[api] MÉTODO caminho: mensagem`. |

## Rotas

| Método e caminho | Sessão? | O que faz | Respostas principais |
| --- | --- | --- | --- |
| `GET /api/me` | sim | Dados resumidos da conta (tag `Nome#1234`, data de exclusão, etc.). | 200, 401 |
| `GET /api/auth/provedores` | não | `{ discord: boolean }` — se o botão do Discord deve aparecer para o endereço atual. | 200 |
| `POST /api/auth/cadastro` | não | Cria conta por e-mail/senha/nome e já abre sessão. | 201 + Set-Cookie; 400 `email_invalido`/`senha_invalida`/`nome_invalido`; 409 `email_em_uso`; 429 |
| `POST /api/auth/entrar` | não | Login por e-mail/senha. | 204 + Set-Cookie; 401 `credenciais_invalidas`; 403 `conta_suspensa`; 429 |
| `GET /api/auth/discord[?vincular=1]` | opcional | Redireciona ao Discord (OAuth + PKCE). | 302 |
| `GET /api/auth/discord/retorno` | — | Retorno do Discord: login, cadastro ou vínculo. | 302 para `/`, `/#escolher-nome`, `/#perfil` ou `/#erro=<código>` |
| `POST /api/auth/sair` | opcional | Revoga a sessão e derruba conexões de jogo da conta. | 204 + cookie apagado |
| `POST /api/auth/recuperar` | não | Pede link de redefinição (sempre a mesma resposta). | 204 |
| `POST /api/auth/redefinir` | não | Troca a senha com o token do link. | 204; 400 `token_invalido`/`senha_invalida` |
| `DELETE /api/auth/identidade/discord` | sim | Desvincula o Discord. | 204; 404; 409 `unica_forma_de_entrar` |
| `GET /api/perfil` | sim | Perfil completo (nível, totais, armas, participações, aparência). | 200 |
| `PATCH /api/perfil` | sim | Muda `nome`, `sexo`, `aparencia` e/ou `equipado`. | 200 com o perfil; 400 `nome_invalido`; 429 `cooldown_nome` (+ `liberaEm`); 409 `nome_esgotado`; 400 `nivel_bloqueado` |
| `POST /api/ws-ticket` | sim | Emite ticket de uso único (30 s) para abrir o WebSocket. | 200 `{ ticket }`; 403 `conta_em_exclusao` |
| `DELETE /api/conta` | sim | Pede exclusão (30 dias de carência); revoga as outras sessões e derruba o jogo. | 204 |
| `POST /api/conta/cancelar-exclusao` | sim | Cancela a exclusão. | 204 |

Detalhes de cada fluxo de conta: [[Authentication]]. Regras de nome, aparência e equipamento: [[Player Data]], [[Character Customization]] e [[Progression]].

## Limites de taxa

Há duas camadas:

1. **nginx** (`deploy/nginx/*.conf`): ~40 req/s por IP com rajada em `/api/`, e **10 req/min** por IP em `entrar`, `cadastro`, `recuperar` e `redefinir` — ver [[Hosting]].
2. **Servidor** (Redis, `server/auth/password.ts`): 5 tentativas por minuto por IP em cadastro/login/recuperação; bloqueio da conta após 10 falhas seguidas por 15 min; 3 e-mails de recuperação por hora por conta.

## Cliente

O cliente chama a API por `api()` em `client/net/api.ts`, sempre na **mesma origem** (`credentials: 'same-origin'`). Falha de rede, resposta não-JSON ou 5xx do proxy do Vite viram o código `offline` (o menu mostra "Servidor fora do ar").

## Código relacionado

- `server/api.ts` — tabela de rotas e `handleApi`.
- `server/http.ts` — `readJson`, `json`, `redirect`, `cookie`, `clientIp`, `originAllowed`.
- `server/auth/*.ts` — handlers de autenticação.
- `shared/account.ts` — `ApiErrorCode`, validações de nome/e-mail/senha.
- `client/net/api.ts` — cliente da API.

Ver também: [[Remote Calls]] (mensagens WebSocket), [[Validation]], [[Trust Boundaries]].
