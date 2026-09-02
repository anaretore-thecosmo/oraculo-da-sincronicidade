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

# ---------------------------------------------------------------------
# 0. BOOTSTRAP — o script roda a partir de uma copia sua, nao do arquivo
#    do repositorio.
#
#    Motivo: o bash le o script conforme executa. Quando o proprio deploy
#    faz git pull e o deploy.sh muda no meio do caminho, o arquivo debaixo
#    do interpretador troca de conteudo. Em 02/09/2026 isso engoliu um
#    trecho inteiro: a versao nova so passou a valer no deploy seguinte.
#
#    Rodando de uma copia, o arquivo em execucao nunca muda. E logo depois
#    do pull o script compara a copia com a versao nova do repositorio e,
#    se mudou, recarrega a nova UMA VEZ — com trava explicita.
# ---------------------------------------------------------------------
if [[ -z "${ORACULO_DEPLOY_COPIA:-}" ]]; then
  _raiz="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
  _copia="$(mktemp /tmp/deploy-oraculo.XXXXXXXX.sh)"
  cat "${BASH_SOURCE[0]}" > "$_copia"
  ORACULO_DEPLOY_COPIA="$_copia" ORACULO_DEPLOY_RAIZ="$_raiz" exec bash "$_copia" "$@"
fi

RAIZ="$ORACULO_DEPLOY_RAIZ"
trap 'rm -f "$ORACULO_DEPLOY_COPIA"' EXIT

# A copia da execucao anterior, quando houve recarga, morre aqui.
if [[ -n "${ORACULO_DEPLOY_COPIA_VELHA:-}" ]]; then
  rm -f "$ORACULO_DEPLOY_COPIA_VELHA"
  unset ORACULO_DEPLOY_COPIA_VELHA
fi

cd "$RAIZ"

# Impressao digital do deploy que esta rodando AGORA. E por ela que se
# prova, olhando o log, qual versao do script executou.
SHA_DESTE_SCRIPT="$(sha256sum "$ORACULO_DEPLOY_COPIA" | cut -c1-12)"
echo "deploy.sh em execucao: $SHA_DESTE_SCRIPT${ORACULO_DEPLOY_REEXEC:+  (recarregado nesta mesma execucao)}"

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
# Se este processo e uma recarga, o ponto de retorno e o do processo que
# comecou o deploy — nunca o commit que acabou de entrar. Sem isso, uma
# falha depois da recarga voltaria para a versao nova, que e justamente a
# que se quer desfazer.
ANTES="${ORACULO_DEPLOY_PONTO_RETORNO:-$(git rev-parse HEAD)}"
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

# ---------------------------------------------------------------------
# 3b — o deploy.sh mudou neste pull? Entao a versao nova vale JA, e nao
#      no proximo deploy. Uma vez so: ORACULO_DEPLOY_REEXEC e a trava.
# ---------------------------------------------------------------------
SHA_NO_REPO="$(sha256sum infra/deploy.sh | cut -c1-12)"
if [[ "$SHA_NO_REPO" != "$SHA_DESTE_SCRIPT" ]]; then
  if [[ -n "${ORACULO_DEPLOY_REEXEC:-}" ]]; then
    vermelho "O deploy.sh mudou de novo depois de ja ter sido recarregado uma vez."
    vermelho "Isso nao deveria acontecer. Parando antes de tocar em producao."
    exit 1
  fi
  passo "O deploy.sh mudou neste pull ($SHA_DESTE_SCRIPT -> $SHA_NO_REPO). Recarregando, uma vez so."
  _nova="$(mktemp /tmp/deploy-oraculo.XXXXXXXX.sh)"
  cat infra/deploy.sh > "$_nova"
  ORACULO_DEPLOY_COPIA="$_nova"   ORACULO_DEPLOY_COPIA_VELHA="$ORACULO_DEPLOY_COPIA"   ORACULO_DEPLOY_RAIZ="$RAIZ"   ORACULO_DEPLOY_REEXEC=1   ORACULO_DEPLOY_PONTO_RETORNO="$ANTES"   exec bash "$_nova" "$@"
fi

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

# ---------------------------------------------------------------------
# 7b — o contrato da leitura responde?
#
#     Em 02/09/2026 um deploy passou por tudo — build, tres travas, health
#     200 — com o servico quebrado: uma variavel que mudou de arquivo no
#     refactor e nao foi importada. O /health nao toca o caminho da
#     leitura, entao nao viu nada.
#
#     Este teste manda uma consulta DELIBERADAMENTE invalida (contagem de
#     cartas errada) para cada tiragem e exige a recusa em JSON. Nao chama
#     a IA, nao gasta credito de ninguem, e percorre schema, alias,
#     normalizacao e a checagem de contagem — que e onde o erro estava.
# ---------------------------------------------------------------------
passo "Testando a rota de leitura pelo caminho valido, nas tres tiragens"
# Percorre schema, alias, normalizacao, contagem, definicao das posicoes,
# formacao das triades e montagem do prompt — e para no instante anterior
# ao Gemini. Nao gasta credito. Ver scripts/testa-leitura.mjs.
node scripts/testa-leitura.mjs

trap - ERR
echo
verde "DEPLOY OK — $(git rev-parse --short HEAD) no ar, health 200."
verde "Este verde veio de uma medição de agora: curl no domínio público."
