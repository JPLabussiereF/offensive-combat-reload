---
title: Database
type: system
status: documented
area: data
source_paths:
  - server/db.ts
  - server/accounts.ts
  - server/jobs.ts
  - server/moderacao.ts
  - server/auth/sessions.ts
  - server/migrations/001_contas.sql
  - server/migrations/002_aparencia.sql
  - docker-compose.yml
  - server/config.ts
  - docs/DEPLOY.md
  - server/migrations/003_melhorias.sql
tags:
  - game
  - data
  - database
  - postgres
updated: 2026-10-06
---

# Database

## Tecnologia

- **PostgreSQL 18** (`postgres:18-alpine` no `docker-compose.yml`). O schema usa `uuidv7()` nativo (PG 18) como padrão de chave e a extensão `citext`.
- Driver `pg` (node-postgres), **pool de 10 conexões** (`createDb`). Erros de conexão ociosa são só logados.
- URL via `DATABASE_URL` (padrão de dev: banco local na porta 5442). Ver [[Configuration Reference]].
- Todo SQL sobre jogadores fica em `server/accounts.ts` (comentário do arquivo); sessões de login em `server/auth/sessions.ts`; sanções/papéis em `server/moderacao.ts`.
- Consultas **sempre parametrizadas** (`$1, $2...`). A única interpolação de string em SQL é o nome/datas de partição em `server/jobs.ts`, gerados pelo próprio código a partir da data.
- `transaction(db, fn)` — `BEGIN`/`COMMIT`/`ROLLBACK` com um cliente do pool.

## Tabelas (migrations `001_contas.sql` a `004_estatisticas_zumbi.sql`)

| Tabela | Chave | Colunas principais | Observações |
|---|---|---|---|
| `account` | `id uuid` (v7) | `email citext UNIQUE`, `email_verified_at`, `status` (CHECK), `locale` (`pt-BR`), `region`, `created_at`, `deletion_requested_at`, `deleted_at` | "A pessoa": estável, raramente atualizada |
| `password_credential` | `account_id` | `password_hash` (Argon2id), `updated_at` | Separada para que nenhuma consulta de conta carregue o hash |
| `auth_identity` | `id` | `account_id`, `provider` (CHECK `discord`), `provider_subject`, `linked_at` | UNIQUE (`provider`, `provider_subject`) e (`account_id`, `provider`) |
| `session` | `id` | `account_id`, `token_hash bytea UNIQUE`, `device_label`, `ip inet`, `created_at`, `last_used_at`, `expires_at`, `revoked_at` | Índice parcial `session_account_idx` onde não revogada |
| `player_profile` | `id` | `account_id`, `display_name`, `discriminator smallint` (1–9999), `sex` (`m`/`f`), `avatar_url`, `bio`, `name_changed_at`, `created_at`, `appearance jsonb` (002), `loadout jsonb` (003: a escolha do Arsenal, `ArsenalChoice`; `NULL` = ainda não escolheu) | Índice único `(lower(display_name), discriminator)` |
| `display_name_history` | `id` | `profile_id`, `display_name`, `discriminator`, `changed_at` | Índice `(profile_id, changed_at DESC)` |
| `player_stats` | `profile_id` | `level`, `xp bigint`, `mmr` (não usado), `matches_played`, `kills`, `deaths`, `headshots`, `groin_kills`, `knife_kills`, `backstabs`, `grenade_kills`, `humiliations`, `seconds_played bigint`, `updated_at` | "Linha quente" estreita, separada do perfil |
| `zombie_stats` | `profile_id` | `matches`, `wins`, `best_wave` (a maior onda alcançada), `waves` (ondas sobrevividas), `kills`, `headshots`, `groin_kills`, `knife_kills`, `grenade_kills`, `bosses`, `coveiro_kills`, `noiva_kills`, `prefeito_kills`, `downs`, `revives`, `deaths`, `coffin_rolls`, `updated_at` (004) | Totais do [[Zombie\|modo zumbi]], à parte de `player_stats`. Criada na primeira gravação (*upsert*), sem linha no cadastro |
| `weapon_progress` | (`profile_id`, `weapon`) | `xp bigint`, `equipped_level` (legado: só lido uma vez para derivar a escolha de contas antigas, `legacyChoice`) | `weapon` CHECK `rifle`/`pistola`/`smg`/`faca`/`granada` (003) |
| `session_participation` | `id` | `profile_id`, `session_name`, `joined_at`, `left_at`, `kills`, `deaths`, `score`, `humiliations`, `account_xp` | Uma linha por estadia numa sala ("a partida", já que as salas são FFA sem fim). Índice `(profile_id, joined_at DESC)` |
| `sanction` | `id` | `account_id`, `type` (CHECK `ban`, `chat_mute`, `ranked_ban`, `shadow_ban`), `reason`, `issued_by`, `starts_at`, `expires_at` (NULL = permanente), `revoked_at` | "Punições como histórico, nunca uma flag". Só `ban` e `chat_mute` são usados no código |
| `role` | `name` | `description` | Semeada com `admin` e `moderador` |
| `account_role` | (`account_id`, `role`) | `granted_by`, `granted_at` | Gerenciada pelo console `tools/admin.ts`; nenhuma rota consulta papéis para autorizar |
| `auth_event` | `id identity` | `account_id`, `type`, `detail`, `ip`, `user_agent`, `created_at` | **Particionada por mês** (`RANGE created_at`), partição `auth_event_default` como rede de segurança |
| `schema_migrations` | `name` | `applied_at` | Criada por `migrate()` ([[Data Migrations]]) |

Todas as FKs para `account`/`player_profile` usam `ON DELETE CASCADE` (na prática contas não são apagadas, são anonimizadas).

## Escritas importantes

| Operação | Tabelas | Transação |
|---|---|---|
| Cadastro (`createAccount`) | account, password_credential/auth_identity, player_profile, display_name_history, player_stats, weapon_progress ×5 (uma por arma de `PROG_WEAPONS`) | sim; até 3 tentativas em violação de unicidade da tag |
| Login / renovação | session (INSERT; `last_used_at`/`expires_at` no máx. 1×/hora) | não |
| Troca de nome | player_profile (`FOR UPDATE`), display_name_history, auth_event | sim |
| Gravação de progresso | player_stats, zombie_stats (upsert, só se houve zumbi), weapon_progress (upsert do XP), player_profile.loadout (escolha do Arsenal), session_participation | sim ([[Save System]]) |
| Anonimização | account, password_credential, auth_identity, session, player_profile, display_name_history, auth_event | sim, por conta |
| Auditoria (`audit`) | auth_event | não aguardada; falha só vai para o log |

## Jobs (`server/jobs.ts`)

Ao iniciar e a cada 24 h (`scheduleJobs`, desligado nos testes):
1. `ensureAuditPartitions` — cria as partições `auth_event_YYYYMM` do mês atual e dos próximos dois.
2. `anonymizeExpired` — anonimiza contas em `pending_deletion` há mais de 30 dias.

## Operação

- **Exposição**: no Docker, o banco publica só em `127.0.0.1:${PG_PORTA:-5442}` (desenvolvimento e backup). Senha por `PG_SENHA` (padrão `oc`, trocar antes de expor — `docs/DEPLOY.md`).
- **Backup/restauração**: `pg_dump`/`psql` via `docker compose exec banco` (`docs/DEPLOY.md`). Dados no volume `oc-pg`; `docker compose down -v` apaga tudo.
- **Testes**: banco `oc_teste` recriado a cada execução (`server/tests/preload.ts`, `DATABASE_URL_TESTE`). Ver [[Integration Tests]].

## Código relacionado

- `server/db.ts` — `createDb`, `migrate`, `transaction`.
- `server/accounts.ts`, `server/auth/*.ts`, `server/moderacao.ts`, `server/jobs.ts`.
- `server/migrations/*.sql`.
- Ver também [[Data Architecture]], [[Player Data]], [[Backend Overview]], [[Sensitive Data]].
