// =====================================================================
// TRAVA DAS TIRAGENS — a definição é coerente, e é a única fonte?
//
// Rodar:  node scripts/verifica-tiragens.mjs      (roda sozinha no prebuild)
//
// Terceira irmã de verifica-entrada.mjs e verifica-cartas.mjs.
//
// Por que ela existe:
//   Até 31/08/2026 a mesma informação vivia em dois lugares que não se
//   conheciam: a tela dizia "Posição 1" e o servidor dizia "as 6 posições
//   da Cruz Cigana". Nenhum dos dois sabia o nome das casas, porque nome
//   nenhum tinha sido escrito — nem no código, nem no primeiro commit do
//   projeto, nem na documentação, nem no Drive. Agora existe uma fonte só,
//   src/tiragens.json, e esta trava garante que ela continue sendo uma.
//
// O que ela confere:
//   1. Cada tiragem tem casas na quantidade que declara
//   2. Os números das casas são 1..N, sem buraco e sem repetição
//   3. Toda casa tem nome, e nome não se repete dentro da tiragem
//   4. Geometria e relações só citam posições que existem
//   5. Ordem de revelação cobre todas as posições, uma vez cada
//   6. Nenhum alias legado colide com id canônico de outra tiragem
//   7. O front e o servidor DERIVAM do arquivo — nenhum nome de casa
//      escrito à mão em App.tsx ou server.js
//   8. Nenhuma referência viva à Cruz Celta fora do alias documentado
// =====================================================================

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEF = path.join(RAIZ, 'src', 'tiragens.json');
const APP = path.join(RAIZ, 'src', 'App.tsx');
const SRV = path.join(RAIZ, 'server', 'server.js');

const erros = [];
const erro = (m) => erros.push(m);

if (!fs.existsSync(DEF)) {
  console.error(`\nTRAVA DAS TIRAGENS: definição não encontrada em ${DEF}\n`);
  process.exit(1);
}

const { tiragens } = JSON.parse(fs.readFileSync(DEF, 'utf8'));

if (!Array.isArray(tiragens) || tiragens.length === 0) {
  erro('a definição não tem tiragem nenhuma');
}

const idsCanonicos = new Set(tiragens.map((t) => t.id));

for (const t of tiragens) {
  const onde = `${t.id}`;

  // 1 — contagem
  if (!Array.isArray(t.casas) || t.casas.length !== t.posicoes) {
    erro(`${onde}: declara ${t.posicoes} posições e tem ${t.casas?.length ?? 0} casas`);
    continue;
  }

  // 2 — numeração 1..N
  const numeros = t.casas.map((c) => c.n);
  const esperados = Array.from({ length: t.posicoes }, (_, i) => i + 1);
  if (numeros.join(',') !== esperados.join(',')) {
    erro(`${onde}: as casas deveriam ser numeradas ${esperados.join(', ')} e são ${numeros.join(', ')}`);
  }

  // 3 — nomes
  const nomes = new Set();
  for (const c of t.casas) {
    if (!c.nome || !c.nome.trim()) erro(`${onde}: a casa ${c.n} está sem nome`);
    if (nomes.has(c.nome)) erro(`${onde}: o nome "${c.nome}" aparece em duas casas`);
    nomes.add(c.nome);
  }

  const existe = (n) => numeros.includes(n);

  // 4 — geometria e relações citam posições reais
  for (const linha of t.geometria?.linhas ?? []) {
    for (const n of linha) {
      if (n !== null && !existe(n)) erro(`${onde}: a geometria cita a posição ${n}, que não existe`);
    }
  }
  const naGeometria = (t.geometria?.linhas ?? []).flat().filter((n) => n !== null);
  for (const n of numeros) {
    if (!naGeometria.includes(n)) erro(`${onde}: a posição ${n} não aparece na geometria`);
  }
  for (const r of t.relacoes ?? []) {
    if (!r.nome || !r.funcao) erro(`${onde}: a relação "${r.nome ?? '?'}" está sem nome ou sem função`);
    for (const n of r.posicoes ?? []) {
      if (!existe(n)) erro(`${onde}: a relação "${r.nome}" cita a posição ${n}, que não existe`);
    }
  }
  for (const passo of t.ordemInterpretacao ?? []) {
    for (const n of passo.posicoes ?? []) {
      if (!existe(n)) erro(`${onde}: a ordem de interpretação cita a posição ${n}, que não existe`);
    }
  }

  // 5 — ordem de revelação cobre tudo, uma vez cada
  const rev = [...(t.ordemRevelacao ?? [])].sort((a, b) => a - b);
  if (rev.join(',') !== esperados.join(',')) {
    erro(`${onde}: a ordem de revelação deveria cobrir ${esperados.join(', ')} e cobre ${rev.join(', ')}`);
  }

  // 6 — alias não pode colidir com id canônico
  for (const a of t.aliases ?? []) {
    if (idsCanonicos.has(a)) erro(`${onde}: o alias legado "${a}" é id canônico de outra tiragem`);
  }
}

// ---------------------------------------------------------------------
// 7 — front e servidor derivam, não copiam
// ---------------------------------------------------------------------
const app = fs.readFileSync(APP, 'utf8');
const srv = fs.readFileSync(SRV, 'utf8');
const MOD = path.join(RAIZ, 'server', 'tiragens.js');
const mod = fs.existsSync(MOD) ? fs.readFileSync(MOD, 'utf8') : '';

if (!app.includes("from './tiragens.json'")) erro('src/App.tsx não importa a definição das tiragens');
if (!mod.includes("require('../src/tiragens.json')")) erro('server/tiragens.js não carrega a definição das tiragens');
if (!srv.includes("require('./tiragens')")) erro('server/server.js não usa server/tiragens.js');

// Nome de casa escrito à mão em qualquer uma das duas camadas: é o
// começo exato da divergência que esta trava existe para impedir.
//
// Comentário não conta — explicar por que a regra existe, citando um
// nome de casa como exemplo, é o oposto de burlá-la.
const semComentario = (fonte) =>
  fonte
    .split('\n')
    .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
    .join('\n');

const appCodigo = semComentario(app);
const srvCodigo = semComentario(srv);
const modCodigo = semComentario(mod);

for (const t of tiragens) {
  for (const c of t.casas) {
    const alvo = `'${c.nome}'`;
    const alvoDuplo = `"${c.nome}"`;
    for (const [arquivo, fonte] of [
      ['src/App.tsx', appCodigo],
      ['server/server.js', srvCodigo],
      ['server/tiragens.js', modCodigo],
    ]) {
      if (fonte.includes(alvo) || fonte.includes(alvoDuplo)) {
        erro(`${arquivo} escreve "${c.nome}" à mão — esse nome deve vir de src/tiragens.json`);
      }
    }
  }
}

// ---------------------------------------------------------------------
// 8 — nenhuma Cruz Celta viva
// ---------------------------------------------------------------------
const aliasesDeclarados = new Set(tiragens.flatMap((t) => t.aliases ?? []));
for (const [arquivo, fonte] of [
  ['src/App.tsx', app],
  ['server/server.js', srv],
  ['server/tiragens.js', mod],
]) {
  for (const linha of fonte.split('\n')) {
    if (!/celtic/i.test(linha)) continue;
    const ehComentario = /^\s*(\/\/|\*|\/\*)/.test(linha);
    // O alias legado só pode viver na definição (src/tiragens.json), que é
    // onde ele está declarado e documentado. Nenhuma das camadas de código
    // pode citar a Cruz Celta fora de comentário.
    if (!ehComentario) {
      erro(`${arquivo}: ainda existe referência ativa a Cruz Celta — "${linha.trim().slice(0, 80)}"`);
    }
  }
}

// ---------------------------------------------------------------------
console.log('');
if (erros.length) {
  console.error(`TRAVA DAS TIRAGENS: ${erros.length} problema(s).\n`);
  for (const e of erros) console.error(`  - ${e}`);
  console.error('');
  process.exit(1);
}

console.log(
  'Tiragens conferidas: ' +
    tiragens.map((t) => `${t.titulo} (${t.posicoes} posições, ${t.posicoes * 3} cartas)`).join(' · ') +
    '.'
);
console.log('Front e servidor derivam da mesma definição; nenhum nome de casa escrito à mão.\n');
