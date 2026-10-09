# Produção e homologação locais (Offensive Combat)

Roda o jogo no Docker deste PC e publica pelo Cloudflare Tunnel:

| Endereço | Pilha | Recebe |
|---|---|---|
| `https://offensive-combat.trybest.com.br` | `offensive-prd` | versão final (`alpha-0.1.0`, da `main`) |
| `https://games.trybest.com.br` | `offensive-prd` (serviço `portal`) | a lista de jogos da TryBest |
| `https://offensive-combat-hml.trybest.com.br` | `offensive-hml` (liga e desliga) | rc (`alpha-0.1.0.rc.001`, da `homolog`) ou, sem rc mais nova, a final |

```
internet → Cloudflare → cloudflared ─┬─ web:80 (nginx do jogo) ── jogo:8787 (Bun) ─┬─ banco  ┐ rede `interna`,
             (container)             └─ portal:80 (games.)                         └─ redis  ┘ sem internet
```

Quem sobe e cuida das pilhas é o **`OffensiveTunel.exe`** (bandeja do Windows), irmão do
`TrybestTunel.exe` da TryBest. O jogo nunca roda com o seu usuário do Windows, nenhuma porta é
publicada no host, e os volumes são externos (`offensive-prd-pgdata`, `-mapas`): nem
`docker compose down -v` apaga as contas.

## Uma vez só (no PC que vai rodar o jogo)

1. Docker Desktop (com *Start Docker Desktop when you sign in*), git e
   `winget install Cloudflare.cloudflared`. O clone deste repositório.
2. **Túnel e DNS** da produção (abre o navegador para autorizar a conta da Cloudflare):
   ```powershell
   powershell -ExecutionPolicy Bypass -File deploy\local\configurar-cloudflare.ps1
   ```
   Cria o túnel `offensive-combat` e aponta `offensive-combat.` e `games.` para ele. Se
   `games.trybest.com.br` apontava para o túnel da TryBest, passa a apontar para este.
3. **O .exe**: `deploy\local\gerar-icone.ps1` (só se o `offensive.ico` sumir), depois
   ```powershell
   powershell -ExecutionPolicy Bypass -File deploy\local\compilar.ps1
   copy deploy\local\tunel.example.ini deploy\local\tunel.ini   # e ajuste JOGO_DIR
   ```
4. **A primeira versão**: o workflow `release` cria `alpha-0.0.1` no primeiro push na `main`
   (sem nenhuma tag ainda). Sem tag, o .exe recusa subir.
5. `deploy\local\OffensiveTunel.exe` — e `--instalar` para subir junto com o login.

No primeiro uso o .exe gera `%USERPROFILE%\.offensive-prd\.env.prd` com senhas novas (banco,
Redis, admin do jogo = `ADMIN_EMAIL` do `tunel.ini`). SMTP e Discord ficam vazios nele: preencha
se quiser e-mail de recuperação e "Entrar com Discord".

**Homologação** (opcional): `configurar-cloudflare.ps1 -Homologacao` (túnel
`offensive-combat-hml`) e depois **Ligar homologação** na bandeja — na primeira vez ela sobe na versão
mais nova que aceita (rc ou, sem rc, a final).

## Versões

O workflow `.github/workflows/release.yml` cria a tag a cada push: `main` → final, `homolog` → rc.
O número sai do título dos commits (`fix:` sobe o último, `feat:` o do meio — `scripts/versao.py`,
o mesmo da TryBest; a fase está em `VERSAO_FASE`).

A cada 10 min o .exe olha as tags; versão nova vira balão e item na bandeja:

| Bandeja | O que faz |
|---|---|
| **Produção: alpha-0.1.0** | a versão no ar (clique abre o jogo) |
| **Atualizar produção para …** | build da tag (o jogo segue no ar) → backup do banco → sobe; o servidor aplica as migrations novas ao subir → confere o `/api/saude` |
| **Voltar produção para …** | backup → roda os `.down.sql` das migrations que a versão anterior não tinha, numa transação só → sobe a anterior |
| **Ligar / Desligar homologação** | a escolha fica gravada e vale nas próximas subidas |
| **Gerar chave de deploy…** | ver *Deploy remoto* |

⚠️ **Voltar apaga do banco o que só existe nas migrations desfeitas** (o backup de antes guarda
tudo, em `%USERPROFILE%\.offensive-prd\backups\`). Toda migration nova precisa do seu
`.down.sql` em `server/migrations/`: sem ele o Voltar recusa, sem mexer em nada.

## Deploy remoto (CI/CD)

Os devs atualizam ou voltam produção e homologação **sem acesso a este PC**:

1. Na bandeja, **Gerar chave de deploy…** — a chave (`ocdeploy_…`) aparece uma vez e vai para a
   área de transferência; o `.env` guarda só o hash (`DEPLOY_KEY_HASH`). Gerar outra invalida a
   anterior.
2. No GitHub do repositório: *Settings → Secrets and variables → Actions* → segredo `DEPLOY_KEY`.
3. O dev roda **Actions → deploy → Run workflow** (ambiente, ação, versão opcional). O job pede e
   acompanha até o fim.

Ou direto pela API (a mesma que o workflow usa):

```bash
# pedir (versao null = a mais nova para atualizar, a anterior para voltar)
curl -X POST https://offensive-combat.trybest.com.br/api/deploy \
  -H "X-Deploy-Key: $DEPLOY_KEY" -H 'Content-Type: application/json' \
  -d '{"ambiente":"prd","acao":"atualizar","versao":null}'
# acompanhar: pendente → em_andamento → concluido | falhou | revertido
curl https://offensive-combat.trybest.com.br/api/deploy/<id> -H "X-Deploy-Key: $DEPLOY_KEY"
# versões no ar, disponíveis e histórico
curl https://offensive-combat.trybest.com.br/api/deploy -H "X-Deploy-Key: $DEPLOY_KEY"
```

Como funciona: a rota (`server/deploy.ts`) só **enfileira** o pedido no Redis da pilha — o jogo
nunca fala com o Docker. O .exe lê a fila a cada ~15 s, executa o mesmo Atualizar/Voltar da
bandeja e escreve o andamento no pedido. Regras:

- `prd` só recebe versão final; `hml` recebe rc e, sem rc mais nova, final. Atualizar só para versão mais nova; para trás é `voltar`.
- **Atualizar pela API que não responde a versão nova no `/api/saude` volta sozinho** (status
  `revertido`).
- Deploy de `hml` com a homologação desligada liga ela antes.
- As duas pilhas recebem pedidos para os dois ambientes: com a produção quebrada, peça o `voltar`
  dela pela API da homologação (`entrada: hml` no workflow).
- 10 chaves erradas de um IP em 15 min bloqueiam esse IP até a janela acabar.
- ⚠️ O Redis do jogo não persiste (ADR "Redis efêmero"): reiniciar o container `redis` perde a
  fila e o andamento dos pedidos. Uma operação em curso termina normalmente.

## Operação

```powershell
# a partir de deploy\local, com o mesmo ambiente que o .exe usa:
$env:PRD_DIR = "$env:USERPROFILE\.offensive-prd"
$env:JOGO_CONTEXT = "$env:PRD_DIR\fonte\jogo"
$env:VERSAO = "alpha-0.1.0"          # a versão no ar (historico.json)
$c = "docker compose -f docker-compose.prd.yml --env-file $env:PRD_DIR\.env.prd"

iex "$c ps"                                   # estado
iex "$c logs -f jogo"                         # log do servidor
iex "$c exec banco psql -U oc oc"             # psql no banco de PRODUÇÃO
iex "$c exec jogo bun build/admin.js banir 'Nome#1234' 'motivo' 7d"   # moderação
```

**Logs:** `deploy\local\logs\` — `stack.log` (containers), `compose-up.log` (build e subida),
`operacoes.log` (atualizar, voltar, backup), `tunel.log` (o próprio .exe).

**Restaurar um backup** (à mão, com o `jogo` parado):

```powershell
docker cp $env:USERPROFILE\.offensive-prd\backups\<arquivo>.dump offensive-prd-banco-1:/tmp/r.dump
docker exec offensive-prd-banco-1 pg_restore -U oc -d oc --clean --if-exists /tmp/r.dump
```
