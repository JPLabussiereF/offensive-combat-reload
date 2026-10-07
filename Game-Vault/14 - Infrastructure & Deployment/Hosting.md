---
title: Hosting
type: infrastructure
status: documented
area: infrastructure
source_paths:
  - docs/DEPLOY.md
  - deploy/nginx/docker.conf
  - deploy/nginx/offensive-combat.conf
  - deploy/offensive-combat.service
  - docker-compose.yml
  - tools/offensive.ts
  - server/http.ts
tags:
  - infra
  - hosting
  - nginx
updated: 2026-10-06
---

# Hosting

O modelo de hospedagem é **auto-hospedado**: um jogador sobe a pilha no próprio PC ou numa VPS e passa um endereço para os amigos.

## Comando `offensive` (`tools/offensive.ts`)

| Subcomando | Ação |
| --- | --- |
| `subir` (padrão) | Garante Docker rodando (abre o Docker Desktop com `docker desktop start --timeout 180`), `docker compose up -d --build`, espera até 60 s o jogo responder `401` em `GET /api/me` **através do nginx**, imprime os endereços IPv4 (ignorando adaptadores de WSL/Docker/VM). |
| `parar` | `docker compose down` (mantém o volume do banco). |
| `logs` | `docker compose logs -f jogo`. |
| `status` | `docker compose ps` + endereços. |
| `firewall` | Só Windows: cria a regra "Offensive Combat" (TCP, porta `PORTA`) via UAC. |

## Formas de os jogadores chegarem (de `docs/DEPLOY.md`)

| Opção | Como | HTTPS? | Observações |
| --- | --- | --- | --- |
| A) Radmin VPN | `http://<IP 26.x.x.x>:8080` | Não (túnel do Radmin é cifrado) | Discord geralmente indisponível (URL `http` não-localhost). |
| B) Cloudflare Tunnel | `cloudflared tunnel --url http://localhost:8080` | Sim (`https://*.trycloudflare.com`) | Funciona com CGNAT; endereço muda a cada reinício. |
| C) Porta no roteador | redirecionar TCP 8080 + firewall | Não | Não funciona com CGNAT; expõe o PC. |
| D) VPS | `PORTA=80 docker compose up -d --build` ou systemd + nginx + certbot | Opcional (certbot) | Endereço fixo, 24 h. |

## O nginx (`deploy/nginx/*.conf`)

Os dois arquivos têm as mesmas regras; mudam o `upstream` (`jogo:8787` no Docker, `127.0.0.1:8787` sem Docker) e o `root`.

| Local | Regra |
| --- | --- |
| `= /ws` | Proxy WebSocket (`Upgrade`/`Connection`), `proxy_buffering off`, timeouts de 1 h, **máx. 6 conexões por IP** (`limit_conn oc_conn 6`). |
| `/api/` | Proxy com `Cache-Control: no-store`, `limit_req` ~40 r/s por IP (rajada 40). |
| `^~ /api/mapas` | Mapas (PF-6): `client_max_body_size 2m`; o `Cache-Control` do servidor passa (versões imutáveis com cache longo). **Sem barra no fim**: com `/api/mapas/`, o nginx respondia a lista (`/api/mapas?...`) com 301 para `/api/mapas/` em vez de repassá-la, e o jogo mostrava "Servidor fora do ar" (corrigido em 2026-10-07). |
| `^~ /api/mapas/arquivos` | Modelos GLB: `client_max_body_size 11m` (o servidor recusa acima de 10 MB). O `^~` impede que a regra de `*.glb` sirva do disco. |
| `~ ^/api/auth/(entrar\|cadastro\|recuperar\|redefinir)$` | Limite extra de **10 r/min por IP** (rajada 10). |
| `/assets/` | Cache de 1 ano, `immutable` (arquivos com hash). |
| `*.glb`, `*.ktx2` | Tipos `model/gltf-binary` e `image/ktx2`, cache 1 h. |
| `/` | `Cache-Control: no-cache` + fallback para `index.html` (nova versão chega no próximo recarregamento). |
| Geral | `gzip` nível 5 para CSS, JS, JSON, WASM, glTF, SVG; `client_max_body_size 64k`; `server_tokens off`. |

Cabeçalhos repassados: `Host` (com porta, `$http_host`), `X-Forwarded-For` e `X-Forwarded-Proto` (respeitando o que um túnel já mandou). O servidor usa isso para checar `Origin`, marcar o cookie `Secure` em HTTPS e descobrir o IP real (ver [[Authentication]]).

## Segurança da hospedagem

- Só o nginx é exposto; o servidor do jogo fica na rede interna (Docker) ou em `127.0.0.1` (systemd).
- Banco e Redis publicados só em `127.0.0.1`.
- `PG_SENHA` deve ser trocada antes de expor o servidor (o default é de desenvolvimento). Ver [[Configuration Reference]] e [[Sensitive Data]].
- systemd: `User=www-data`, `NoNewPrivileges=true`. Docker: `USER bun`.

## Backup

```bash
docker compose exec banco pg_dump -U oc oc > backup-oc.sql
docker compose exec -T banco psql -U oc oc < backup-oc.sql
```

`docker compose down -v` **apaga todas as contas** (remove o volume `oc-pg`). Não há backup automático.

## Código relacionado

- `deploy/nginx/docker.conf`, `deploy/nginx/offensive-combat.conf`, `deploy/offensive-combat.service`
- `docker-compose.yml`, `Dockerfile`, `tools/offensive.ts`
- `docs/DEPLOY.md`
