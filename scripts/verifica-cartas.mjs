// =====================================================================
// TRAVA DAS CARTAS — o baralho está inteiro e cada carta é a sua?
//
// Rodar:
//   node scripts/verifica-cartas.mjs                     (confere manifesto + derivados)
//   node scripts/verifica-cartas.mjs --originais "C:\...\Oraculo-Cartas"
//   node scripts/verifica-cartas.mjs --sem-derivados     (antes de gerar os WebP)
//
// Irmã da trava scripts/verifica-entrada.mjs. Aquela impede subir build
// falso; esta impede subir baralho incompleto ou carta trocada.
//
// Por que ela existe:
//   As artes e o código chamam as mesmas cartas por nomes diferentes em
//   seis casos (O Pendurado × O Enforcado, As Flores × O Buquê, e quatro
//   singular × plural no cigano). Casar por semelhança de texto acertaria
//   quase sempre — e "quase sempre", num baralho, é uma leitura errada na
//   mão de quem confiou. Por isso o vínculo é explícito no manifesto, e
//   esta trava confere o que o manifesto afirma.
//
// O que ela confere:
//   1. 114 cartas, nem uma a mais nem uma a menos
//   2. 22 maiores, 36 ciganas, 14 por naipe
//   3. Nenhum id repetido
//   4. Nenhum arquivo de origem usado por duas cartas
//   5. Todo nome do manifesto existe, igualzinho, nas listas de App.tsx —
//      e toda carta de App.tsx está no manifesto (os dois sentidos)
//   6. Com --originais: todo arquivo de origem existe, e nenhum PNG das
//      pastas de arte ficou órfão
//   7. Sem --sem-derivados: os 114 WebP existem em public/cartas/
//
// Detalhe que já quebrou projeto sério: acento tem duas grafias possíveis
// em Unicode (á = um caractere, ou "a" + acento separado). O nome parece
// idêntico na tela e não bate na comparação. Tudo aqui é normalizado para
// NFC antes de comparar.
// =====================================================================

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MANIFESTO = path.join(RAIZ, 'src', 'cartas.json');
const APP_TSX = path.join(RAIZ, 'src', 'App.tsx');

const args = process.argv.slice(2);
const semDerivados = args.includes('--sem-derivados');
const iOriginais = args.indexOf('--originais');
const dirOriginais = iOriginais >= 0 ? args[iOriginais + 1] : null;

const N = (s) => String(s).normalize('NFC');

const erros = [];
const avisos = [];
const erro = (m) => erros.push(m);

// ---------------------------------------------------------------------
// Manifesto
// ---------------------------------------------------------------------
if (!fs.existsSync(MANIFESTO)) {
  console.error(`\nTRAVA DAS CARTAS: manifesto não encontrado em ${MANIFESTO}\n`);
  process.exit(1);
}
const manifesto = JSON.parse(fs.readFileSync(MANIFESTO, 'utf8'));
const cartas = manifesto.cartas ?? [];

// 1 e 2 — contagens
const ESPERADO = {
  total: 114,
  maiores: 22,
  cigano: 36,
  naipes: { paus: 14, copas: 14, espadas: 14, ouros: 14 },
};

if (cartas.length !== ESPERADO.total) {
  erro(`o manifesto tem ${cartas.length} cartas; o baralho tem ${ESPERADO.total}`);
}

const conta = (fn) => cartas.filter(fn).length;
const nMaiores = conta((c) => c.baralho === 'maiores');
const nCigano = conta((c) => c.baralho === 'cigano');
if (nMaiores !== ESPERADO.maiores) erro(`arcanos maiores: ${nMaiores}, esperado ${ESPERADO.maiores}`);
if (nCigano !== ESPERADO.cigano) erro(`baralho cigano: ${nCigano}, esperado ${ESPERADO.cigano}`);
for (const [naipe, qtd] of Object.entries(ESPERADO.naipes)) {
  const n = conta((c) => c.baralho === 'menores' && c.naipe === naipe);
  if (n !== qtd) erro(`naipe de ${naipe}: ${n}, esperado ${qtd}`);
}

// 3 e 4 — repetições
const vistos = new Map();
for (const c of cartas) {
  if (vistos.has(c.id)) erro(`id repetido: ${c.id}`);
  vistos.set(c.id, c);
}
const origens = new Map();
for (const c of cartas) {
  const chave = N(c.origem);
  if (origens.has(chave)) {
    erro(`mesmo arquivo em duas cartas: "${c.origem}" serve ${origens.get(chave)} e ${c.id}`);
  }
  origens.set(chave, c.id);
}

// ---------------------------------------------------------------------
// 5 — o manifesto e o código falam dos mesmos nomes
// ---------------------------------------------------------------------
function listaDoApp(nomeDaConstante) {
  const fonte = fs.readFileSync(APP_TSX, 'utf8');
  const m = fonte.match(new RegExp(`const\\s+${nomeDaConstante}\\s*=\\s*\\[([\\s\\S]*?)\\]`));
  if (!m) {
    erro(`não achei a lista ${nomeDaConstante} em src/App.tsx — o código mudou de forma`);
    return [];
  }
  return [...m[1].matchAll(/"([^"]+)"/g)].map((x) => N(x[1]));
}

const noCodigo = new Set([
  ...listaDoApp('MAJOR_ARCANA'),
  ...listaDoApp('MINOR_ARCANA'),
  ...listaDoApp('GYPSY_TAROT'),
]);

// O cigano e os maiores compartilham nomes (A Torre, A Estrela, O Sol, A Lua),
// então a conferência é por conjunto, não por contagem de nomes distintos.
const noManifesto = new Set(cartas.map((c) => N(c.nome)));

for (const nome of noManifesto) {
  if (!noCodigo.has(nome)) erro(`o manifesto tem "${nome}", que não existe em App.tsx`);
}
for (const nome of noCodigo) {
  if (!noManifesto.has(nome)) erro(`App.tsx tem "${nome}", que não está no manifesto`);
}

// ---------------------------------------------------------------------
// 6 — os originais (só quando o caminho é informado)
// ---------------------------------------------------------------------
if (dirOriginais) {
  if (!fs.existsSync(dirOriginais)) {
    erro(`pasta de originais não encontrada: ${dirOriginais}`);
  } else {
    const usados = new Set();
    for (const c of cartas) {
      const alvo = path.join(dirOriginais, ...c.origem.split('/'));
      if (fs.existsSync(alvo)) {
        usados.add(N(path.resolve(alvo)));
      } else {
        erro(`arte ausente para ${c.id} (${c.nome}): ${c.origem}`);
      }
    }

    // órfãos: PNG dentro das pastas de arte que nenhuma carta reivindica
    const pastas = [...new Set(cartas.map((c) => c.origem.split('/').slice(0, -1).join('/')))];
    for (const p of pastas) {
      const abs = path.join(dirOriginais, ...p.split('/'));
      if (!fs.existsSync(abs)) continue;
      for (const arq of fs.readdirSync(abs)) {
        if (!/\.png$/i.test(arq)) continue;
        const cheio = N(path.resolve(path.join(abs, arq)));
        if (!usados.has(cheio)) avisos.push(`arquivo órfão, nenhuma carta o usa: ${p}/${arq}`);
      }
    }
  }
}

// ---------------------------------------------------------------------
// 7 — os derivados que o site serve
// ---------------------------------------------------------------------
if (!semDerivados) {
  const dirWeb = path.join(RAIZ, 'public', 'cartas');
  for (const c of cartas) {
    const face = path.join(dirWeb, `${c.id}.webp`);
    if (!fs.existsSync(face)) erro(`derivado ausente: cartas/${c.id}.webp (${c.nome})`);
  }
}

// ---------------------------------------------------------------------
// Resultado
// ---------------------------------------------------------------------
console.log('');
if (avisos.length) {
  console.log('Avisos:');
  for (const a of avisos) console.log(`  - ${a}`);
  console.log('');
}

if (erros.length) {
  console.error(`TRAVA DAS CARTAS: ${erros.length} problema(s).\n`);
  for (const e of erros) console.error(`  - ${e}`);
  console.error('\nO baralho não sobe incompleto nem com carta trocada.\n');
  process.exit(1);
}

console.log(
  `Baralho conferido: ${cartas.length} cartas — ` +
    `${nMaiores} maiores, ${nCigano} ciganas, ` +
    Object.keys(ESPERADO.naipes)
      .map((n) => `${conta((c) => c.naipe === n)} de ${n}`)
      .join(', ') +
    '.'
);
console.log(
  dirOriginais
    ? 'Originais conferidos um a um, sem ausência e sem órfão.'
    : 'Manifesto conferido contra App.tsx. (Sem --originais: as artes não foram olhadas nesta execução.)'
);
console.log('');
