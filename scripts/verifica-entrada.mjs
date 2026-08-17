// =====================================================================
// TRAVA DE BUILD — protege o index.html de entrada (projetos Vite)
// =====================================================================
// Destino: <projeto>/scripts/verifica-entrada.mjs
// Ligado no package.json:  "prebuild": "node scripts/verifica-entrada.mjs"
//
// Extensão .mjs de propósito: funciona tanto em projeto com
// "type": "module" quanto sem, sem precisar conferir cada package.json.
//
// Por que isto existe:
//   No Oráculo da Sincronicidade, o dist/index.html foi copiado por cima
//   do index.html da raiz em algum deploy manual. O arquivo de ENTRADA do
//   Vite passou a apontar para um bundle JÁ COMPILADO. A partir dali todo
//   build virou build falso: o Vite copiava o bundle velho e ignorava o
//   código-fonte inteiro. Sem erro, sem aviso, exit code 0, de março a
//   agosto de 2026. Toda alteração era feita, buildada, deployada, e nada
//   mudava no ar.
//
// O que esta trava faz:
//   Aborta o build se o index.html não tiver uma entrada de código-fonte,
//   ou se referenciar um bundle compilado. Falhar o build é barato.
//   Descobrir meses depois que nenhum deploy valeu é caro.
//
// Não presume /src/main.tsx: aceita qualquer entrada de fonte
// (/index.tsx, /src/main.ts, ./main.jsx e afins), porque os projetos da
// casa usam convenções diferentes e ambas são legítimas.
// =====================================================================

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const aquiDir = path.dirname(fileURLToPath(import.meta.url));
const arquivo = path.resolve(aquiDir, '..', 'index.html');

function morrer(motivo) {
  console.error('\n\x1b[31mBUILD ABORTADO\x1b[0m\n');
  console.error(`  Problema: ${motivo}`);
  console.error(`  Arquivo:  ${arquivo}\n`);
  console.error('  Conserto: git checkout -- index.html');
  console.error('            (restaura a versão correta do repositório)\n');
  console.error('  Contexto: o index.html da raiz é a ENTRADA do Vite, não um');
  console.error('            resultado. Se ele foi sobrescrito por um');
  console.error('            dist/index.html, todo build vira build falso.\n');
  process.exit(1);
}

if (!fs.existsSync(arquivo)) {
  morrer('index.html não existe na raiz do projeto.');
}

const html = fs.readFileSync(arquivo, 'utf8');

// Marca registrada do dist/index.html: referência a bundle com hash.
if (/src=["'][^"']*\/assets\/[^"']*-[A-Za-z0-9_-]{6,}\.js["']/.test(html)) {
  morrer('index.html referencia um bundle já compilado em /assets/. É a marca de um dist/index.html copiado por cima da raiz.');
}

// Precisa ter ao menos uma entrada de código-fonte.
const temEntradaFonte = /<script[^>]+src=["'][^"']+\.(tsx|ts|jsx|js)["']/i.test(html)
  && !/src=["']https?:\/\//i.test(
       (html.match(/<script[^>]+src=["'][^"']+\.(tsx|ts|jsx|js)["'][^>]*>/gi) || [])
         .filter((t) => !/\/assets\//.test(t))
         .join('\n')
     );

if (!temEntradaFonte) {
  morrer('index.html não tem entrada de código-fonte (nenhum <script src="...tsx|ts|jsx|js"> local). O Vite não vai compilar o projeto.');
}

console.log('Entrada do build conferida: index.html aponta para o código-fonte.');
