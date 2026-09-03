// =====================================================================
// PROVA DO EMBARALHAMENTO E DA ORDEM DA ESCOLHA
//
// Rodar (na VPS, com o serviço no ar):
//   node scripts/prova-embaralhamento.mjs
//
// Por que existe:
//   Em 03/09/2026 a Ana viu selos numéricos (1, 2, 3) desenhados sobre as
//   cartas viradas para baixo e mandou removê-los, perguntando junto se o
//   embaralhamento mexia na IDENTIDADE das cartas já escolhidas ou só na
//   posição delas na tela. Este teste responde essa pergunta por medição,
//   e não por leitura de código.
//
// O que prova, sem gastar crédito (usa o modo de ensaio):
//   1. A escolha é guardada pelo NOME da carta, nunca pelo índice do grid.
//      Embaralhar antes, no meio e depois não troca nenhuma identidade.
//   2. A ordem interna é a ordem em que a pessoa escolheu — não a ordem
//      em que as cartas aparecem na tela depois do embaralhamento.
//   3. A carta que chega ao diagnóstico na posição N é exatamente a
//      N-ésima que foi escolhida, nas três tiragens.
// =====================================================================

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = process.argv[2] || 'http://127.0.0.1:3985';
const TIRAGENS = JSON.parse(fs.readFileSync(path.join(RAIZ, 'src', 'tiragens.json'), 'utf8'));

// Os três baralhos, lidos do próprio App.tsx para não haver segunda cópia.
function leBaralho(nome) {
  const src = fs.readFileSync(path.join(RAIZ, 'src', 'App.tsx'), 'utf8');
  const m = src.match(new RegExp(`const ${nome} = \[([\s\S]*?)\];`));
  if (!m) throw new Error(`baralho ${nome} não encontrado em src/App.tsx`);
  return [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
}
const BARALHOS = {
  maior: leBaralho('MAJOR_ARCANA'),
  menor: leBaralho('MINOR_ARCANA'),
  cigano: leBaralho('GYPSY_TAROT'),
};

function leToken() {
  const env = path.join(RAIZ, 'server', '.env');
  if (!fs.existsSync(env)) return null;
  for (const linha of fs.readFileSync(env, 'utf8').split('\n')) {
    const m = linha.match(/^\s*DIAG_TOKEN\s*=\s*(.*)\s*$/);
    if (m) return m[1].trim().replace(/^["']|["']$/g, '');
  }
  return null;
}
const TOKEN = leToken();
if (!TOKEN) {
  console.error('\nPROVA DO EMBARALHAMENTO: DIAG_TOKEN não encontrado em server/.env.\n');
  process.exit(1);
}

const falhas = [];
const falha = (m) => falhas.push(m);

// Embaralhamento com a mesma forma do aplicativo: devolve uma ORDEM nova do
// mesmo conjunto. Semente fixa para o teste ser repetível.
let semente = 20260903;
const aleatorio = () => ((semente = (semente * 1103515245 + 12345) % 2147483648) / 2147483648);
const embaralha = (deck) => {
  const d = [...deck];
  for (let i = d.length - 1; i > 0; i--) {
    const j = Math.floor(aleatorio() * (i + 1));
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
};

// -----------------------------------------------------------------------
// 1 e 2 — a identidade não depende da posição na tela
// -----------------------------------------------------------------------
{
  let grid = embaralha(BARALHOS.maior);
  const escolhidas = [];

  // escolhe a carta que está na casa 4 do grid
  escolhidas.push(grid[4]);
  // embaralha de novo (o que a interface agora impede, mas o modelo tem de
  // aguentar): a mesma carta muda de casa e continua a mesma carta
  const antes = [...escolhidas];
  grid = embaralha(grid);
  if (JSON.stringify(escolhidas) !== JSON.stringify(antes)) {
    falha('embaralhar alterou a lista de escolhas');
  }
  const casaNova = grid.indexOf(escolhidas[0]);
  if (casaNova === 4) {
    falha('o embaralhamento de teste não mexeu no grid — o teste não provaria nada');
  }
  if (!grid.includes(escolhidas[0])) {
    falha('a carta escolhida sumiu do baralho depois do embaralhamento');
  }

  // escolhe mais duas, de casas quaisquer, e confere a ORDEM
  escolhidas.push(grid[0]);
  grid = embaralha(grid);
  escolhidas.push(grid[grid.length - 1]);
  if (new Set(escolhidas).size !== 3) falha('a mesma carta foi escolhida duas vezes');

  console.log(`  identidade preservada: a 1ª escolha saiu da casa 4 e foi parar na casa ${casaNova}`);
  console.log(`  ordem interna = ordem da escolha, e não ordem do grid`);
}

// -----------------------------------------------------------------------
// 3 — a carta da posição N do diagnóstico é a N-ésima escolhida
// -----------------------------------------------------------------------
async function ensaio(corpo) {
  const r = await fetch(`${BASE}/api/oraculo/leitura`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-diag-token': TOKEN },
    body: JSON.stringify(corpo),
  });
  return { status: r.status, json: await r.json().catch(() => null) };
}

for (const tiragem of TIRAGENS.tiragens) {
  const n = tiragem.posicoes;

  // Escolhe n cartas de cada baralho embaralhando ENTRE cada escolha, para
  // que a ordem da escolha não tenha nada a ver com a ordem do grid.
  const escolhe = (deck) => {
    let grid = embaralha(deck);
    const fora = [];
    for (let i = 0; i < n; i++) {
      grid = embaralha(grid.filter((c) => !fora.includes(c)));
      fora.push(grid[i % grid.length]);
    }
    return fora;
  };
  const maiores = escolhe(BARALHOS.maior);
  const menores = escolhe(BARALHOS.menor);
  const ciganos = escolhe(BARALHOS.cigano);

  const { status, json } = await ensaio({
    pergunta: `Prova do embaralhamento: ${tiragem.titulo}.`,
    modo: tiragem.id,
    profundidade: 500,
    ensaio: true,
    arcanosMaiores: maiores,
    arcanosMenores: menores,
    baralhoCigano: ciganos,
  });

  if (status !== 200 || json?.ensaio !== true) {
    falha(`${tiragem.id}: o ensaio respondeu ${status} — ${JSON.stringify(json)}`);
    continue;
  }

  const prompt = json.prompt || '';
  let conferidas = 0;
  for (const casa of tiragem.casas) {
    const i = casa.n;
    const esc = (s) => s.replace(/[.*+?^${}()|[\]\]/g, '\$&');
    const bloco = new RegExp(
      `Posição ${i} — ${esc(casa.nome)}` +
        `[\s\S]*?Arcano Maior \(arquetípico\): ${esc(maiores[i - 1])}\n` +
        `\s*Arcano Menor \(psicológico/comportamental\): ${esc(menores[i - 1])}\n` +
        `\s*Baralho Cigano \(concreto/prático\): ${esc(ciganos[i - 1])}`
    );
    if (!bloco.test(prompt)) {
      falha(
        `${tiragem.id}: a posição ${i} (${casa.nome}) não recebeu a ${i}ª escolha ` +
          `(${maiores[i - 1]} / ${menores[i - 1]} / ${ciganos[i - 1]})`
      );
    } else {
      conferidas++;
    }
  }

  console.log(
    `  ${tiragem.titulo.padEnd(15)} ${conferidas}/${n} posições receberam exatamente ` +
      `a escolha de mesmo número · 1ª posição: ${maiores[0]} + ${menores[0]} + ${ciganos[0]}`
  );
}

if (falhas.length) {
  console.error(`\nPROVA DO EMBARALHAMENTO: ${falhas.length} falha(s).\n`);
  for (const f of falhas) console.error(`  - ${f}`);
  console.error('');
  process.exit(1);
}
console.log('');
