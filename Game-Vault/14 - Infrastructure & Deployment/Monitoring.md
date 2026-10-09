---
title: Monitoring
type: infrastructure
status: partial
area: infrastructure
source_paths:
  - Dockerfile
  - server/api.ts
  - docker-compose.yml
  - tools/offensive.ts
  - client/main.ts
  - client/render/quality.ts
  - server/index.ts
  - package.json
tags:
  - infra
  - monitoramento
updated: 2026-10-08
---

# Monitoring

## Monitoramento de produção — não existe

Não existe no código atual (verificado em `package.json` — sem bibliotecas de métricas/APM/telemetria —, em `server/` — nenhum endpoint de métricas; o único de saúde é `GET /api/saude`, abaixo — e em `docker-compose.yml`). Não há Prometheus, Grafana, Sentry, alertas, uptime check externo ou painel de jogadores online.

Ver [[Problem - Sem monitoramento nem métricas de servidor]].

## O que existe no lugar

| Recurso | Onde | O que mostra |
| --- | --- | --- |
| Healthcheck do Postgres | `docker-compose.yml` (`pg_isready` a cada 2 s, 30 tentativas) | O `jogo` só sobe com o banco saudável. Não há healthcheck para `jogo`, `web` ou `redis`. |
| `GET /api/saude` | `server/api.ts` | `{ status: "ok", version }` com a versão da imagem (`APP_VERSION`, `dev` sem ela), sem auth e sem cache. Usado pelo programa de deploy para conferir a versão depois de cada troca; não toca banco nem Redis. Ver [[APIs]]. |
| `restart: unless-stopped` | todos os serviços do compose | Reinício automático se o processo cair. |
| `Restart=on-failure` | `deploy/offensive-combat.service` | Idem no systemd. |
| Teste de prontidão | `tools/offensive.ts` → `gameAnswers()` | Após subir, espera `GET /api/me` responder **401** pelo nginx (sinal de que nginx + jogo + banco respondem). Só na subida. |
| `offensive status` | `tools/offensive.ts` | `docker compose ps` + endereços. |
| Logs | stdout/stderr | Ver [[Logging]]. |
| Auditoria de autenticação | tabela `auth_event` | Eventos de login, bloqueio, banimento etc. — consultável por SQL, sem painel. Ver [[Moderation]]. |

## Monitoramento no cliente (depuração)

O overlay **F3** (`client/main.ts`) é a principal ferramenta de observação, atualizado a 15 Hz:

- FPS (média exponencial), draw calls, triângulos;
- GPU detectada e aviso `⚠ SOFTWARE` (renderização sem placa de vídeo, `client/render/quality.ts`);
- ms de simulação por tick, ms de render por frame, tempo de montagem do mapa (meshes e colisores);
- qualidade, pixel ratio, sombras;
- online: número de jogadores, ping (RTT suavizado) e atraso de interpolação.

Em dev, `window.__oc.perf()` devolve os tempos de boot (`physics`, `map`, `firstFrame`), `mapBuildMs`, estatísticas do mapa, médias de CPU/render, draw calls e triângulos. Ver [[Performance Overview]].

## Código relacionado

- `docker-compose.yml`, `deploy/offensive-combat.service`, `tools/offensive.ts`
- `client/main.ts` (overlay e `__oc`), `client/render/quality.ts`
