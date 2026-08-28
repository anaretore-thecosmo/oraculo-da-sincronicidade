#!/usr/bin/env bash
# =====================================================================
# DEPLOY DO ORÁCULO — com guarda, verificação e volta
#
# Roda NA VPS, de dentro de /var/www/oraculo:
#
#     bash infra/deploy.sh
#
# Por que isto existe:
#   Em 17/08/2026, 70 linhas do server.js foram escritas direto na VPS e
#   ficaram 10 dias fora do git. Não foi descuido: a pasta de produção
#   ERA o repositório de trabalho, e editar ali é o caminho mais curto.
#   Este script inverte isso — ele RECUSA deploy quando a produção tem
#   qualquer coisa que o GitHub não tenha visto.
#
# A regra que ele impõe:
#   O servidor nunca é origem de código. Só destino.
#
# O que ele faz, em ordem:
#   1. Recusa se houver mudança não commitada  → você editou na VPS
#   2. Recusa se houver commit não empurrado    → o GitHub não tem
#   3. git pull --ff-only                       → nunca cria merge aqui
#   4. npm ci nos dois pacotes (front e server) → versão travada no lock
#   5. npm run build                            → passa pela trava de entrada
#   6. Confere que o dist saiu de verdade
#   7. pm2 reload + health, com VOLTA automática se o health falhar
#
# O que ele NÃO faz:
#   Não toca em .env, não toca em server/data/creditos.json, não instala
#   nada no sistema. Esses arquivos só existem aqui e são de propósito.
# =====================================================================

set -Eeuo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$RAIZ"

HEALTH="https://oraculo.portalthecosmo.com/api/oraculo/health"
APP="oraculo-api"

vermelho() { printf '\033[31m%s\033[0m\n' "$*"; }
verde()    { printf '\033[32m%s\033[0m\n' "$*"; }
passo()    { printf '\n\033[1m→ %s\033[0m\n' "$*"; }

recusa() {
  vermelho "DEPLOY RECUSADO"
  vermelho "$1"
  echo
  echo "$2"
  exit 1
}

# ---------------------------------------------------------------------
# 1 e 2 — as duas guardas. Nada acontece antes delas passarem.
# ---------------------------------------------------------------------
passo "Conferindo se a produção está limpa"

SUJO="$(git status --porcelain)"
if [[ -n "$SUJO" ]]; then
  recusa "Existe mudança nesta pasta que o git não conhece:
$SUJO" \
"Alguém editou direto na VPS. Duas saídas honestas:

  a) A mudança presta — traga para o git AGORA, aqui mesmo:
       git add -A && git commit -m 'descreve o que mudou' && git push

  b) A mudança é lixo de teste — apague, com consciência:
       git checkout -- .   (perde as alterações; não tem volta)

Depois rode o deploy de novo."
fi

git fetch --quiet origin

if [[ -n "$(git rev-list origin/main..HEAD)" ]]; then
  recusa "Existe commit aqui que o GitHub não tem." \
"Empurre antes, senão a VPS vira a única cópia do seu trabalho:
       git push origin main"
fi

verde "Produção limpa e alinhada com o GitHub."

# ---------------------------------------------------------------------
# Ponto de retorno. Guardado ANTES de qualquer mudança.
# ---------------------------------------------------------------------
ANTES="$(git rev-parse HEAD)"
echo "Ponto de retorno: $ANTES"

voltar() {
  vermelho "Deu errado. Voltando para $ANTES."
  git reset --hard "$ANTES" --quiet
  npm ci --silent
  npm run build --silent || true
  pm2 reload "$APP" --update-env >/dev/null
  vermelho "Voltou. O ar está como estava antes deste deploy — confira:"
  vermelho "  curl -s $HEALTH"
}

# ---------------------------------------------------------------------
# 3 — pull. --ff-only de propósito: se divergiu, o script para em vez
#     de inventar um merge dentro da produção.
# ---------------------------------------------------------------------
passo "Buscando a versão nova"
git pull --ff-only origin main

DEPOIS="$(git rev-parse HEAD)"
if [[ "$ANTES" == "$DEPOIS" ]]; then
  echo "Nada novo no GitHub. Rebuildando mesmo assim para garantir que o"
  echo "que está no ar corresponde ao que está no código."
else
  git --no-pager log --oneline "$ANTES..$DEPOIS"
fi

# A partir daqui, qualquer erro volta para trás.
trap voltar ERR

# ---------------------------------------------------------------------
# 4 e 5 — dependências travadas e build.
#     npm ci, nunca npm install: ci obedece o package-lock.json. install
#     pode subir versão sozinho e quebrar produção sem ninguém ter pedido.
# ---------------------------------------------------------------------
passo "Instalando dependências do front (npm ci)"
npm ci --silent

passo "Instalando dependências do server (npm ci)"
( cd server && npm ci --omit=dev --silent )

passo "Buildando o front"
# O prebuild roda scripts/verifica-entrada.mjs e aborta se o index.html
# da raiz tiver sido sobrescrito por um bundle já compilado — a armadilha
# que deixou o site cinco meses aceitando deploy que não mudava nada.
npm run build

# ---------------------------------------------------------------------
# 6 — verificação do build POR DENTRO, não por exit code.
# ---------------------------------------------------------------------
passo "Conferindo o que o build produziu"
[[ -f dist/index.html ]] || { echo "dist/index.html não existe"; false; }
grep -q 'assets/' dist/index.html || { echo "dist/index.html não referencia assets/ — build suspeito"; false; }
echo "dist/index.html: $(stat -c '%y' dist/index.html)"
echo "arquivos em dist/assets: $(ls dist/assets 2>/dev/null | wc -l)"

# ---------------------------------------------------------------------
# 7 — reload e health de verdade.
#     reload em vez de restart: o server.js sabe encerrar com graça
#     (SIGTERM grava o ledger de créditos e drena a requisição em voo).
# ---------------------------------------------------------------------
passo "Recarregando o serviço"
pm2 reload "$APP" --update-env

passo "Conferindo se o Oráculo respondeu"
OK=""
for tentativa in 1 2 3 4 5 6; do
  sleep 3
  CODIGO="$(curl -s -m 15 -o /tmp/oraculo-health.$$ -w '%{http_code}' "$HEALTH" || true)"
  if [[ "$CODIGO" == "200" ]]; then OK="sim"; break; fi
  echo "tentativa $tentativa: $CODIGO"
done

if [[ -z "$OK" ]]; then
  rm -f /tmp/oraculo-health.$$
  echo "O health não voltou 200 em 6 tentativas."
  false
fi

echo "resposta: $(cat /tmp/oraculo-health.$$)"
rm -f /tmp/oraculo-health.$$

trap - ERR
echo
verde "DEPLOY OK — $(git rev-parse --short HEAD) no ar, health 200."
verde "Este verde veio de uma medição de agora: curl no domínio público."
