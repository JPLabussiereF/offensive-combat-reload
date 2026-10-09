"""Calcula a próxima versão do Offensive Combat a partir das tags e dos commits.

Cópia do ``scripts/versao.py`` da TryBest (TB-44), que versiona três
repositórios juntos; aqui roda com um só (``--repo .``). A regra é a mesma.

Formato das tags:

- final: ``<fase>-MAJOR.MINOR.PATCH`` (``alpha-0.0.2``); sem fase (``VERSAO_FASE``
  vazio), sem prefixo (``1.0.0``).
- rc: ``<versão final alvo>.rc.NNN`` (``alpha-0.1.0.rc.003``), três dígitos, um
  contador por versão alvo que ``develop`` e ``homolog`` compartilham.

Incremento, pela linha de assunto de cada commit (Conventional Commits, com a
chave do Jira opcional na frente — ``TB-44: feat: ...``):

- ``tipo!:`` ou rodapé ``BREAKING CHANGE:`` sobe o primeiro número — mas, em
  alpha/beta (MAJOR = 0), sobe o do meio: o primeiro só sai do zero na 1.0.0;
- ``feat:`` sobe o do meio;
- qualquer outro commit sobe o último — inclusive os que não seguem o padrão.
  Push na ``main`` sempre gera versão; o mínimo é uma correção.

⚠️ Só biblioteca padrão: o workflow ``release.yml`` roda isto com o ``python3`` do
runner, sem instalar o projeto.

Uso::

    python scripts/versao.py proxima --branch main --fase-arquivo VERSAO_FASE --repo .
    python scripts/versao.py numerica alpha-0.1.0.rc.002     # -> 0.1.0

``proxima`` imprime a tag a criar, ou nada quando o HEAD do repositório já
tem uma tag do tipo pedido (o push repetido não gera versão nova).
"""

from __future__ import annotations

import argparse
import re
import subprocess
import sys
from collections.abc import Iterable, Sequence
from dataclasses import dataclass
from pathlib import Path

FASES = ("alpha", "beta", "")
"""Fases aceitas em ``VERSAO_FASE``, nesta ordem. Vazio = a partir de 1.0.0."""

BRANCH_FINAL = "main"
BRANCHES_RC = ("develop", "homolog")

PATCH, MINOR, MAJOR = 0, 1, 2

_FINAL = re.compile(r"^(?:(?P<fase>[a-z]+)-)?(?P<x>\d+)\.(?P<y>\d+)\.(?P<z>\d+)$")
_RC = re.compile(r"^(?P<alvo>.+)\.rc\.(?P<n>\d{3})$")
# Assunto do commit: chave do Jira opcional, tipo, escopo opcional, `!` opcional.
_ASSUNTO = re.compile(
    r"^(?:[A-Z][A-Z0-9]+-\d+:\s*)?(?P<tipo>[a-z]+)(?:\([^)]*\))?(?P<quebra>!)?:\s"
)
_RODAPE_QUEBRA = re.compile(r"^BREAKING[ -]CHANGE:", re.M)


class VersaoError(Exception):
    """Estado que não permite calcular a versão — o workflow deve parar."""


@dataclass(frozen=True, order=True)
class Numero:
    major: int
    minor: int
    patch: int

    def __str__(self) -> str:
        return f"{self.major}.{self.minor}.{self.patch}"

    def subir(self, nivel: int) -> Numero:
        if nivel == MAJOR:
            return Numero(self.major + 1, 0, 0)
        if nivel == MINOR:
            return Numero(self.major, self.minor + 1, 0)
        return Numero(self.major, self.minor, self.patch + 1)


def ler_final(tag: str) -> tuple[str, Numero] | None:
    """``alpha-0.1.0`` → ``("alpha", 0.1.0)``; ``1.2.3`` → ``("", 1.2.3)``; rc → None."""
    m = _FINAL.match(tag.strip())
    if not m:
        return None
    fase = m.group("fase") or ""
    if fase not in FASES:
        return None
    return fase, Numero(int(m.group("x")), int(m.group("y")), int(m.group("z")))


def ler_rc(tag: str) -> tuple[str, int] | None:
    """``alpha-0.1.0.rc.002`` → ``("alpha-0.1.0", 2)``."""
    m = _RC.match(tag.strip())
    if not m or ler_final(m.group("alvo")) is None:
        return None
    return m.group("alvo"), int(m.group("n"))


def numerica(tag: str) -> str:
    """Só a parte numérica: ``alpha-0.1.0.rc.002`` → ``0.1.0``.

    É o que vai no ``X-App-Version`` (comparado com ``MIN_APP_VERSION``) e no
    ``version`` do app nas lojas, que não aceitam texto.
    """
    rc = ler_rc(tag)
    final = ler_final(rc[0] if rc else tag)
    if final is None:
        raise VersaoError(f"tag fora do formato de versão: {tag!r}")
    return str(final[1])


def nome_final(fase: str, numero: Numero) -> str:
    return f"{fase}-{numero}" if fase else str(numero)


def ultima_final(tags: Iterable[str]) -> str | None:
    """A maior versão final pelo número (a fase não entra na ordem)."""
    finais = [(lida[1], t) for t in tags if (lida := ler_final(t))]
    return max(finais)[1] if finais else None


def nivel_do_commit(mensagem: str) -> int:
    linhas = mensagem.strip().splitlines()
    assunto = linhas[0] if linhas else ""
    m = _ASSUNTO.match(assunto)
    if (m and m.group("quebra")) or _RODAPE_QUEBRA.search(mensagem):
        return MAJOR
    if m and m.group("tipo") == "feat":
        return MINOR
    return PATCH


def proxima_final(ultima: str, mensagens: Sequence[str], fase: str) -> str:
    """Próxima versão final a partir da última e dos commits desde ela."""
    if fase not in FASES:
        raise VersaoError(f"fase desconhecida em VERSAO_FASE: {fase!r} (use alpha, beta ou vazio)")
    lida = ler_final(ultima)
    if lida is None:
        raise VersaoError(f"última versão fora do formato: {ultima!r}")
    fase_anterior, numero = lida
    if FASES.index(fase) < FASES.index(fase_anterior):
        raise VersaoError(
            f"VERSAO_FASE={fase or '(vazio)'} volta atrás da última versão {ultima} "
            "— a fase só anda para frente (alpha → beta → sem prefixo)"
        )
    if not fase and numero.major == 0:
        # Saída da fase beta: a primeira versão sem prefixo é sempre a 1.0.0.
        return nome_final(fase, Numero(1, 0, 0))
    nivel = max((nivel_do_commit(m) for m in mensagens), default=PATCH)
    if nivel == MAJOR and numero.major == 0:
        # Convenção semver para 0.x (decisão do Gregory, TB-44): a quebra
        # sobe o do meio; o primeiro número só sai do zero na 1.0.0.
        nivel = MINOR
    return nome_final(fase, numero.subir(nivel))


def proxima_rc(alvo: str, tags: Iterable[str]) -> str:
    """``alvo.rc.NNN`` com NNN = maior rc já existente para o mesmo alvo + 1."""
    usados = [rc[1] for t in tags if (rc := ler_rc(t)) and rc[0] == alvo]
    n = max(usados, default=0) + 1
    if n > 999:
        raise VersaoError(f"contador de rc esgotado para {alvo}")
    return f"{alvo}.rc.{n:03d}"


def calcular(
    branch: str,
    fase: str,
    tags: Iterable[str],
    mensagens: Sequence[str],
    heads_ja_marcados: bool,
) -> str | None:
    """Regra inteira, sem git: devolve a tag a criar ou None (nada a fazer)."""
    tags = list(tags)
    if branch != BRANCH_FINAL and branch not in BRANCHES_RC:
        raise VersaoError(f"branch sem versão: {branch!r}")
    if heads_ja_marcados:
        return None
    ultima = ultima_final(tags)
    if ultima is None:
        raise VersaoError(
            "nenhuma versão final encontrada — crie a tag inicial (alpha-0.0.1) "
            "no repositório antes do primeiro release"
        )
    alvo = proxima_final(ultima, mensagens, fase)
    if branch == BRANCH_FINAL:
        return alvo
    return proxima_rc(alvo, tags)


# ── Leitura do git ──────────────────────────────────────────────────────────


def _git(repo: Path, *args: str) -> str:
    resultado = subprocess.run(  # noqa: S603 — argumentos fixos, sem shell
        ["git", "-C", str(repo), *args],  # noqa: S607 — git do PATH do runner
        check=True,
        capture_output=True,
        text=True,
        encoding="utf-8",
    )
    return resultado.stdout


def tags_do_repo(repo: Path) -> list[str]:
    return _git(repo, "tag", "--list").split()


def mensagens_desde(repo: Path, tag: str) -> list[str]:
    """Mensagens dos commits alcançáveis pelo HEAD e não pela tag."""
    if tag not in tags_do_repo(repo):
        raise VersaoError(f"{repo}: falta a tag {tag} — a versão precisa existir em todos")
    saida = _git(repo, "log", "--format=%B%x1e", "HEAD", "--not", tag)
    return [m.strip() for m in saida.split("\x1e") if m.strip()]


def head_marcado(repo: Path, branch: str) -> bool:
    """O HEAD já tem uma tag do tipo que esta branch gera?"""
    no_head = _git(repo, "tag", "--points-at", "HEAD").split()
    if branch == BRANCH_FINAL:
        return any(ler_final(t) for t in no_head)
    return any(ler_rc(t) for t in no_head)


def proxima_dos_repos(branch: str, fase: str, repos: Sequence[Path]) -> str | None:
    tags: set[str] = set()
    for r in repos:
        tags.update(tags_do_repo(r))
    ja_marcados = all(head_marcado(r, branch) for r in repos)
    ultima = ultima_final(tags)
    mensagens: list[str] = []
    if ultima is not None and not ja_marcados:
        for r in repos:
            mensagens.extend(mensagens_desde(r, ultima))
    return calcular(branch, fase, tags, mensagens, ja_marcados)


def ler_fase(arquivo: Path) -> str:
    return arquivo.read_text(encoding="utf-8").strip()


def main(argv: Sequence[str] | None = None) -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    sub = parser.add_subparsers(dest="comando", required=True)
    p = sub.add_parser("proxima", help="tag a criar para o HEAD da branch")
    p.add_argument("--branch", required=True)
    p.add_argument("--fase-arquivo", type=Path, required=True)
    p.add_argument("--repo", type=Path, action="append", required=True)
    n = sub.add_parser("numerica", help="só MAJOR.MINOR.PATCH da tag")
    n.add_argument("tag")
    args = parser.parse_args(argv)

    try:
        if args.comando == "numerica":
            print(numerica(args.tag))
            return 0
        tag = proxima_dos_repos(args.branch, ler_fase(args.fase_arquivo), args.repo)
    except VersaoError as e:
        print(f"erro: {e}", file=sys.stderr)
        return 1
    print(tag or "")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
