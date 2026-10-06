---
title: Data Migrations
type: system
status: documented
area: data
source_paths:
  - server/db.ts
  - server/migrations/001_contas.sql
  - server/migrations/001_contas.down.sql
  - server/migrations/002_aparencia.sql
  - server/migrations/002_aparencia.down.sql
  - server/app.ts
  - tools/admin.ts
  - shared/appearance.ts
  - client/core/settings.ts
  - client/ui/home.ts
  - server/migrations/003_melhorias.sql
  - server/migrations/003_melhorias.down.sql
  - shared/progression.ts
  - server/accounts.ts
  - server/tests/arsenal.test.ts
tags:
  - game
  - data
  - migrations
updated: 2026-10-06
---

# Data Migrations

## Migrations do banco

### Mecanismo (`migrate()` em `server/db.ts`)

1. Cria `schema_migrations (name, applied_at)` se não existir.
2. Lista os arquivos `server/migrations/*.sql` que casam com `^\d+_.+\.sql$` e **não** terminam em `.down.sql`, em ordem alfabética.
3. Para cada arquivo ainda não registrado: executa o SQL e insere o nome em `schema_migrations`, **na mesma transação**.
4. Loga `[banco] migration aplicada: <arquivo>`.

Quando roda:
- **Toda vez que o servidor sobe** (`startServer` → `await migrate(db)`), antes de aceitar conexões.
- No console de administração (`tools/admin.ts` chama `migrate` antes de qualquer comando).
- Nos testes (o servidor de teste sobe sobre um banco `oc_teste` recriado).

O caminho resolve para `<repo>/server/migrations` tanto em dev (`server/db.ts`) quanto no build (`build/server.js`), então a pasta precisa existir ao lado do build no deploy.

### Rollback

Os arquivos `.down.sql` são **rollbacks manuais** (não executados pelo código): `psql -f server/migrations/001_contas.down.sql`. Cada um também apaga sua linha de `schema_migrations`. O `003_melhorias.down.sql` remove a coluna `loadout`, as linhas de `pistola`/`smg` e volta o CHECK, mas **não** desfaz o aumento de XP.

### Migrations existentes

| Arquivo | Conteúdo |
|---|---|
| `001_contas.sql` | Extensão `citext`; tabelas `account`, `password_credential`, `auth_identity`, `session`, `player_profile`, `display_name_history`, `player_stats`, `weapon_progress`, `session_participation`, `sanction`, `role` (com `admin` e `moderador`), `account_role`, `auth_event` (particionada) e índices |
| `002_aparencia.sql` | `ALTER TABLE player_profile ADD COLUMN appearance jsonb` |
| `003_melhorias.sql` | Progressão por melhorias e armas secundárias ([[ADR - Progressão por melhorias de arma]]): o CHECK de `weapon_progress.weapon` passa a aceitar `pistola` e `smg`; insere as linhas dessas armas para os perfis existentes; `ALTER TABLE player_profile ADD COLUMN loadout jsonb` (a escolha do Arsenal); **sobe o XP** de rifle, faca e granada para o limiar do nível novo equivalente ao antigo, para ninguém perder o que tinha (rifle e faca 2→2, 3–4→3, 5–6→4, 7→5; granada 2→2, 3→3; ex.: rifle com ≥ 5500 → 7000). A coluna `equipped_level` fica, só para leitura |

Schema detalhado em [[Database]].

### Partições criadas em tempo de execução

As partições mensais de `auth_event` não são migrations: `server/jobs.ts` cria as do mês atual e dos dois seguintes ao iniciar e a cada 24 h. Linhas de um mês sem partição caem em `auth_event_default`.

## Migração de dados na leitura (versionamento de JSON)

A aparência (`player_profile.appearance`, jsonb) tem campo de versão `v`. `sanitizeAppearance` (`shared/appearance.ts`) converte **na leitura e na escrita**:
- versão 1 (6 `roupas` fixas, uma cor cada) → versão 2 (`itens` por slot do catálogo);
- versão 2 salva antes do rosto (`rosto`) → recebe o rosto padrão;
- qualquer valor inválido → escolha válida padrão.

Não há migration SQL para isso: o dado antigo continua no banco até a próxima gravação. Coberto por `server/tests/appearance.test.ts`. Ver [[Character Customization]].

A escolha do Arsenal (`player_profile.loadout`) também é convertida na leitura: `NULL` (conta de antes das melhorias) vira a escolha mais parecida com o antigo `equipped_level` de cada arma (`legacyChoice` em `shared/progression.ts`: rifle 5–7 → luneta ligada; granada 2 → mina, 3 → Dose Dupla; desde a PF-8 a faca antiga não é mais convertida: todos começam no Rifle Padrão e na faca de cozinha), e todo valor lido ou gravado passa por `sanitizeChoice` contra os níveis. Uma escolha com o frango ou o sabre ligados como forma (de antes da PF-8) vira essa faca se os pontos de faca a liberam. Coberto por `server/tests/arsenal.test.ts` (que também confere os limiares da migração 003, fixados nos valores da época dela).

## Migração de dados locais (navegador)

- `oc.settings.v1`: versão no nome da chave. Ao carregar, os padrões são mesclados com o salvo; as **teclas** são mescladas ação por ação para que ações adicionadas depois recebam seu padrão.
- Chaves da era pré-contas (`oc.name`, `oc.sex`, `oc.profile`) são **apagadas** ao abrir a home: nome, corpo e progressão passaram a viver na conta (comentário cita "Resposta P5").

## Riscos

- Não há verificação de checksum: editar uma migration já aplicada não tem efeito nem aviso.
- Migrations rodam em todo início do servidor; com várias instâncias subindo juntas, poderiam competir (não há lock explícito). Hoje há uma instância.

> [!warning]
> O segundo risco é inferência a partir do código de `migrate()`; não há deploy com várias instâncias documentado.

## Código relacionado

- `server/db.ts` — `migrate`, `transaction`.
- `server/migrations/*.sql`.
- `server/jobs.ts` — `ensureAuditPartitions`.
- `shared/appearance.ts` — `sanitizeAppearance`.
- `shared/progression.ts` — `legacyChoice`, `sanitizeChoice`; `server/accounts.ts` — `weapons` (lê a escolha ou deriva a antiga).
- `client/core/settings.ts`, `client/ui/home.ts`.
- Ver também [[Build Pipeline]], [[Data Architecture]].
