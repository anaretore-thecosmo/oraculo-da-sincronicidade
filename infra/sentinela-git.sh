#!/usr/bin/env bash
# =====================================================================
# SENTINELA DE DIVERGÊNCIA — o Oráculo no ar é o Oráculo do GitHub?
#
# Roda NA VPS, uma vez por dia, pelo cron:
#
#     10 8 * * * /usr/bin/bash /var/www/oraculo/infra/sentinela-git.sh >> /var/log/oraculo-sentinela.log 2>&1
#
# Por que ela existe, e por que não basta o deploy.sh:
#   O deploy.sh recusa deploy sujo. Ele não impede que alguém EDITE um
#   arquivo na VPS e simplesmente não faça deploy — foi assim que 70
#   linhas viveram 10 dias fora do git, funcionando, sem ninguém notar.
#   O deploy é a porta; a sentinela é quem olha.
#
# O que ela olha (quatro perguntas):
#   1. Tem arquivo alterado que o git não conhece?
#   2. Tem commit aqui que o GitHub não tem?
#   3. Tem commit no GitHub que aqui não tem? (alguém empurrou e ninguém subiu)
#   4. O dist/ é mais velho que o último commit que mexeu no front?
#      (código novo no repositório, build velho no ar)
#
# Sai com código 0 se está tudo alinhado, 1 se divergiu.
#
# ATENÇÃO — o que ela AINDA NÃO faz:
#   Ela NÃO avisa a Ana. Hoje ela só escreve no log e sai com erro.
#   Ligar o aviso no mesmo canal da sentinela de backup é item do
#   roadmap, e até isso existir a sentinela depende de alguém ler o log.
#   Está escrito aqui porque documentação não promete o que não existe.
# =====================================================================

set -uo pipefail   # sem -e: a sentinela precisa terminar as 4 perguntas
                   # mesmo quando a primeira já achou problema.

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$RAIZ" || exit 1

AGORA="$(date '+%Y-%m-%d %H:%M:%S')"
PROBLEMAS=0

grita() {
  echo "[$AGORA] DIVERGE: $*"
  PROBLEMAS=$((PROBLEMAS + 1))
}

git fetch --quiet origin 2>/dev/null

# 1 — mudança não commitada na produção
SUJO="$(git status --porcelain)"
if [[ -n "$SUJO" ]]; then
  grita "existe arquivo alterado na VPS que o git não conhece:"
  echo "$SUJO" | sed 's/^/           /'
fi

# 2 — commit local que o GitHub não tem
ADIANTE="$(git rev-list --count origin/main..HEAD 2>/dev/null || echo 0)"
if [[ "$ADIANTE" != "0" ]]; then
  grita "$ADIANTE commit(s) existem só nesta VPS. Se ela morrer, morrem junto."
fi

# 3 — commit no GitHub que a VPS não subiu
ATRAS="$(git rev-list --count HEAD..origin/main 2>/dev/null || echo 0)"
if [[ "$ATRAS" != "0" ]]; then
  grita "$ATRAS commit(s) no GitHub ainda não estão no ar. Falta rodar infra/deploy.sh."
fi

# 4 — build velho para código novo
#     Compara o dist/index.html com a data do último commit que tocou no
#     front (src/, index.html, vite.config.ts, package.json).
if [[ -f dist/index.html ]]; then
  DIST_TS="$(stat -c %Y dist/index.html)"
  COMMIT_TS="$(git log -1 --format=%ct -- src index.html vite.config.ts package.json 2>/dev/null || echo 0)"
  if [[ "$COMMIT_TS" -gt "$DIST_TS" ]]; then
    grita "o front foi alterado em $(date -d "@$COMMIT_TS" '+%d/%m %H:%M') mas o dist/ é de $(date -d "@$DIST_TS" '+%d/%m %H:%M'). O que está no ar é build velho."
  fi
else
  grita "dist/index.html não existe — o nginx está servindo o quê?"
fi

if [[ "$PROBLEMAS" -eq 0 ]]; then
  echo "[$AGORA] alinhado: $(git rev-parse --short HEAD) igual ao GitHub, dist mais novo que o código."
  exit 0
fi

echo "[$AGORA] $PROBLEMAS divergência(s). Conserto em https://github.com/anaretore-thecosmo/oraculo-da-sincronicidade"
exit 1
