---
title: APIs
type: service
status: documented
area: backend
source_paths:
  - server/config.ts
  - server/deploy.ts
  - server/api.ts
  - server/route.ts
  - server/mapRoutes.ts
  - server/gestao.ts
  - server/roles.ts
  - server/glb.ts
  - server/app.ts
  - server/http.ts
  - server/auth/password.ts
  - server/auth/discord.ts
  - server/auth/sessions.ts
  - shared/account.ts
  - client/net/api.ts
  - deploy/nginx/docker.conf
  - server/accounts.ts
  - shared/progression.ts
  - shared/pets.ts
tags:
  - backend
  - api
  - http
updated: 2026-10-08
---

# APIs

A API HTTP do jogo vive sob `/api/` e é atendida pelo próprio servidor do jogo (`handleApi` em `server/api.ts`). Não há versionamento de rota (`/v1`) nem documentação OpenAPI.

## Convenções

| Aspecto | Regra (código confirmado) |
| --- | --- |
| Formato | JSON de entrada e saída; respostas com `cache-control: no-store`, menos as que nunca mudam (versões de mapa e modelos GLB: `public, max-age=31536000, immutable`). |
| Erros | Corpo `{ "erro": "<código>" }` (+ campos extras, ex.: `ate` na suspensão). Códigos em `ApiErrorCode` (`shared/account.ts`). Erro inesperado → `500 { erro: "erro_interno" }`. |
| Roteamento | Mapa `"MÉTODO /caminho"` → handler; um segmento `:nome` casa qualquer segmento e chega em `ctx.params` (a rota exata ganha da com parâmetros). Rota desconhecida → `404 nao_encontrado`. Rotas em `server/api.ts` (contas), `server/mapRoutes.ts` (mapas) e `server/gestao.ts` (gerenciamento); o contexto comum (`Ctx`, `requireSession`, `reply`) em `server/route.ts`. |
| Origem | Métodos `POST/PATCH/PUT/DELETE` exigem `Origin` do mesmo host ou listado em `ORIGENS_PERMITIDAS`; senão `403 origem_invalida` (proteção CSRF). **Exceção:** `/api/deploy` (`isDeployPath`), que se autentica pela chave `X-Deploy-Key`, não pelo cookie, e é chamado por scripts sem `Origin`. |
| Corpo | `readJson(req, max)`: **16 KiB** por padrão, **2 MiB** para os dados de um mapa; acima disso `413 corpo_grande_demais`; JSON que não é objeto → `400 json_invalido`. Corpo binário (modelo GLB) por `readBinary(req, max)`. |
| Papéis | Rotas da equipe leem os papéis do banco a cada pedido (`requireRole`, `server/roles.ts`); sem o papel → `403 sem_permissao`. |
| Sessão | Cookie `oc_sessao` (HttpOnly). Rotas autenticadas usam `requireSession`, que também renova a validade e recusa contas banidas (`403 conta_suspensa`). |
| Log | O servidor **nunca** registra a requisição (pode ter senha/cookie); só `[api] MÉTODO caminho: mensagem`. |

## Rotas

| Método e caminho | Sessão? | O que faz | Respostas principais |
| --- | --- | --- | --- |
| `GET /api/sessoes` | não | Lista pública das salas abertas (`SessionInfo[]`, mesma ordem do lobby), sem cache. Respondida direto em `server/app.ts`, onde as salas vivem. A tela inicial a usa para mostrar quantas salas cada mapa tem antes de conectar. | 200 |
| `GET /api/me` | sim | Dados resumidos da conta (tag `Nome#1234`, data de exclusão, `papeis` da equipe, etc.). | 200, 401 |
| `GET /api/auth/provedores` | não | `{ discord: boolean }` — se o botão do Discord deve aparecer para o endereço atual. | 200 |
| `POST /api/auth/cadastro` | não | Cria conta por e-mail/senha/nome e já abre sessão. | 201 + Set-Cookie; 400 `email_invalido`/`senha_invalida`/`nome_invalido`; 409 `email_em_uso`; 429 |
| `POST /api/auth/entrar` | não | Login por e-mail/senha. | 204 + Set-Cookie; 401 `credenciais_invalidas`; 403 `conta_suspensa`; 429 |
| `GET /api/auth/discord[?vincular=1]` | opcional | Redireciona ao Discord (OAuth + PKCE). | 302 |
| `GET /api/auth/discord/retorno` | — | Retorno do Discord: login, cadastro ou vínculo. | 302 para `/`, `/#escolher-nome`, `/#perfil` ou `/#erro=<código>` |
| `POST /api/auth/sair` | opcional | Revoga a sessão e derruba conexões de jogo da conta. | 204 + cookie apagado |
| `POST /api/auth/recuperar` | não | Pede link de redefinição (sempre a mesma resposta). | 204 |
| `POST /api/auth/redefinir` | não | Troca a senha com o token do link. | 204; 400 `token_invalido`/`senha_invalida` |
| `DELETE /api/auth/identidade/discord` | sim | Desvincula o Discord. | 204; 404; 409 `unica_forma_de_entrar` |
| `GET /api/perfil` | sim | Perfil completo (nível, totais, `armas` com `{xp, nivel}` por arma, `arsenal` com a escolha do Arsenal, participações, aparência). | 200 |
| `PATCH /api/perfil` | sim | Muda `nome`, `sexo`, `aparencia`, `arsenal` (`ArsenalChoice {primaria, secundaria, faca, ligadas, desligadas}`: o rifle, a secundária, a faca, as melhorias opcionais ligadas e as comuns desligadas), `destaque` (id de figurinha colada, ou `null`) e/ou `titulo` (id de página com o título ganho, ou `null`). Ver [[Achievements]]. E `pet` (PF-29: `{ id, pvp, pve, cfg }`, o pet levado, os interruptores e o nome, a pelagem e a coleira de cada pet), conferido por `sanitizePet` como a aparência (pelagem, coleira e nome inválidos caem num valor válido; nenhum pet exige o pacote de apoio agora), mas um `pet.id` que não é pet nenhum é recusado (P36). Ver [[Pets]]. | 200 com o perfil; 400 `nome_invalido`; 400 `pet_invalido` (espécie de pet desconhecida); 429 `cooldown_nome` (+ `liberaEm`); 409 `nome_esgotado`; 400 `nivel_bloqueado` (melhoria ainda não liberada, ou rifle, secundária ou faca trancados na escolha); 400 `figurinha_bloqueada` (figurinha não colada ou título não ganho) |
| `POST /api/ws-ticket` | sim | Emite ticket de uso único (30 s) para abrir o WebSocket. | 200 `{ ticket }`; 403 `conta_em_exclusao` |
| `DELETE /api/conta` | sim | Pede exclusão (30 dias de carência); revoga as outras sessões e derruba o jogo. | 204 |
| `POST /api/conta/cancelar-exclusao` | sim | Cancela a exclusão. | 204 |

Detalhes de cada fluxo de conta: [[Authentication]]. Regras de nome, aparência e escolha do Arsenal: [[Player Data]], [[Character Customization]] e [[Progression]].

### Mapas (PF-6, `server/mapRoutes.ts`)

Equipe = admin ou moderador. Ver [[World Structure]] e [[ADR - Sessões sob demanda por versão do mapa]].

| Método e caminho | Quem | O que faz | Respostas principais |
| --- | --- | --- | --- |
| `GET /api/mapas?tipo=oficial\|comunidade&q=&autor=&ordem=jogados\|recentes&pagina=&ocultos=1` | todos | Lista os mapas visíveis (nem ocultos nem apagados; com `ocultos=1`, a equipe também vê os ocultos, e para os outros o parâmetro é ignorado: P34), 20 por página, com busca por nome ou autor (nome ou tag). Cada item é um `MapaResumo` (com `pode`: o que quem pergunta pode fazer, e `meu`: se foi quem pergunta que o fez). | 200 `{ mapas, pagina, mais }` |
| `GET /api/mapas/:id` | todos | Um mapa. Oculto: só o autor e a equipe o veem. | 200; 404 `nao_encontrado` / `mapa_oculto` |
| `GET /api/mapas/:id/versoes` | todos | As versões salvas (`VersaoMapa`: número, data, quem salvou, chamadas e triângulos, qual é a atual). | 200 |
| `GET /api/mapas/:id/versoes/:v` | todos | Os dados (`MapData`) de uma versão: imutável, com cache longo. | 200; 404 |
| `POST /api/mapas` | conta | `{ tipo, dados }`: cria o mapa com a versão 1. `oficial` só a equipe. | 201 `{ id, versao, drawCalls, triangulos }`; 403 `sem_permissao`; 400 `mapa_invalido` (+ `erros`) ou `orcamento_excedido` (+ `drawCalls`, `triangulos`, `limite`, `excedeu`) |
| `PUT /api/mapas/:id` | autor (comunidade) ou equipe | `{ dados, baseVersao }`: salva uma versão nova. | 200 `{ id, versao, ... }`; 409 `versao_desatualizada` (+ `atual`); 403; 400 |
| `POST /api/mapas/:id/restaurar` | autor ou equipe | `{ versao }`: volta a jogar uma versão antiga (só troca a versão atual). | 200; 404 |
| `POST` / `DELETE /api/mapas/:id/ocultar` | equipe | Oculta (`{ motivo? }`) ou mostra de novo. Os 4 oficiais originais (`rua`, `jardim`, `halloween`, `cemiterio`) não são ocultados (P45: `403 mapa_protegido`). | 204 |
| `DELETE /api/mapas/:id` | autor ou equipe | Apaga (exclusão lógica). Os 4 oficiais originais não são apagados por ninguém (P44: `403 mapa_protegido`); oficiais criados depois, sim. | 204 |
| `POST /api/mapas/:id/duplicar` | conta | Cópia da versão atual como mapa da comunidade da conta (`copiaDe`), chamada "Nome (cópia)" (P38). | 201 `{ id, versao: 1 }` |
| `POST /api/mapas/:id/jogadas` | todos | Uma partida offline (treino, bots): conta uma jogada por conta (ou IP) e mapa por hora (Redis). | 204 |
| `POST /api/mapas/arquivos?nome=` | conta | O modelo GLB no corpo (`model/gltf-binary`, até 10 MB): validado (`server/glb.ts`) e guardado pelo SHA-256 em `MAPAS_DIR`. Limite de envios por hora e cota por conta. | 201 `{ sha256, url, bytes, triangulos, primitivas }`; 413 `arquivo_grande_demais` / `cota_excedida`; 400 `glb_invalido` (+ `motivo`); 429 `muitas_tentativas` |
| `GET /api/mapas/arquivos/:sha256.glb` | todos | O modelo (`model/gltf-binary`, `nosniff`, cache longo). | 200; 404 |

### Gerenciamento (PF-6, `server/gestao.ts`)

Admin e moderador, com as regras de `shared/roles.ts`. Ver [[Moderation]].

| Método e caminho | O que faz |
| --- | --- |
| `GET /api/gestao/contas?q=&pagina=` | Busca contas por nome ou tag. |
| `GET /api/gestao/contas/:id` | Detalhes e `permissoes` de quem pergunta. |
| `PATCH /api/gestao/contas/:id` | `{ nome?, sexo?, aparencia?, xp?, armas? }` (nome sem o tempo de espera; a espera do jogador recomeça a partir da troca: P35). |
| `POST /api/gestao/contas/:id/sancoes` | `{ tipo: banimento \| silencio, motivo, duracao }`. |
| `DELETE /api/gestao/contas/:id/sancoes/:tipo` | Revoga as sanções ativas do tipo. |
| `PUT` / `DELETE /api/gestao/contas/:id/papeis/:papel` | Concede / tira um papel. |

### Deploy remoto e saúde (`server/deploy.ts`)

Quem executa o deploy é um programa de bandeja no Windows que roda a pilha Docker: ele lê a fila no Redis do jogo (`redis-cli`, a cada ~15 s), faz backup, build e troca das imagens e escreve o andamento de volta no Redis. As rotas só validam, autenticam e enfileiram/leem JSON; **nunca** falam com o Docker nem com o host. Chaves do Redis em [[Cache]].

| Método e caminho | Auth | O que faz | Respostas principais |
| --- | --- | --- | --- |
| `GET /api/saude` | não | Saúde com a versão da imagem: `{ status: "ok", version: APP_VERSION ?? "dev" }`, `no-store`. O programa confere a versão depois de cada troca. | 200 |
| `POST /api/deploy` | chave | `{ ambiente: prd\|hml, acao: atualizar\|voltar, versao?: tag\|null }`. Tag: `^(?:(alpha\|beta)-)?\d{1,4}\.\d{1,4}\.\d{1,4}(?:\.rc\.\d{3})?$` (máx. 40). prd só versão final; hml aceita `.rc.` e final (sem rc mais nova, roda a da produção). Cria o pedido (id uuid4 em hex, `status: pendente`, `criado_em` ISO UTC, `origem_ip`, `mensagem`, `de`, `para`, `iniciado_em`, `terminado_em`), guarda por 30 dias e põe o id no fim da fila. | 202 com o pedido; 422 `ambiente_invalido`/`acao_invalida`/`versao_invalida`/`versao_incompativel`; 429 `fila_cheia` (≥ 20 na fila); 400 `json_invalido` |
| `GET /api/deploy/:id` | chave | O pedido como está no Redis (o programa atualiza `status`: `pendente`, `em_andamento`, `concluido`, `falhou`, `revertido`). | 200; 404 (id fora de `^[0-9a-f]{32}$` ou inexistente) |
| `GET /api/deploy` | chave | O `deploy:estado` escrito pelo programa (versões, disponível e histórico de prd e hml), sem validar; `{ estado: null }` se não houver. | 200 |

Chave: `X-Deploy-Key: ocdeploy_<64 hex>`. O servidor só conhece o SHA-256 dela (`DEPLOY_KEY_HASH`, ver [[Configuration Reference]]) e compara os digests em tempo constante (`timingSafeEqual`). Sem `DEPLOY_KEY_HASH` as três rotas respondem **404** (como se não existissem). Chave ausente ou errada → `401 nao_autorizado` e conta uma falha para o IP (`clientIp`); com **10 falhas em 15 min** o IP recebe `429 muitas_tentativas` até a janela acabar, mesmo com a chave certa. Nem a chave nem o hash vão para o log. Não usam sessão.

## Limites de taxa

Há duas camadas:

1. **nginx** (`deploy/nginx/*.conf`): ~40 req/s por IP com rajada em `/api/`, e **10 req/min** por IP em `entrar`, `cadastro`, `recuperar` e `redefinir` — ver [[Hosting]].
2. **Servidor** (Redis, `server/auth/password.ts`): 5 tentativas por minuto por IP em cadastro/login/recuperação; bloqueio da conta após 10 falhas seguidas por 15 min; 3 e-mails de recuperação por hora por conta.

## Cliente

O cliente chama a API por `api()` (`GET`, `POST`, `PUT`, `PATCH`, `DELETE`) e `apiBinary()` (corpo em bytes, para o GLB) em `client/net/api.ts`, sempre na **mesma origem** (`credentials: 'same-origin'`). Falha de rede, resposta não-JSON ou 5xx do proxy do Vite viram o código `offline` (o menu mostra "Servidor fora do ar").

## Código relacionado

- `server/api.ts` — rotas de conta, roteador com parâmetros e `handleApi`; `server/route.ts` — `Ctx`, `requireSession`, `optionalSession`, `reply`.
- `server/mapRoutes.ts`, `server/gestao.ts`, `server/roles.ts`, `server/glb.ts`, `server/deploy.ts` (deploy remoto).
- `server/http.ts` — `readJson`, `readBinary`, `json`, `redirect`, `cookie`, `clientIp`, `originAllowed`.
- `server/auth/*.ts` — handlers de autenticação.
- `shared/account.ts` — `ApiErrorCode`, validações de nome/e-mail/senha.
- `client/net/api.ts` — cliente da API.

Ver também: [[Remote Calls]] (mensagens WebSocket), [[Validation]], [[Trust Boundaries]].
