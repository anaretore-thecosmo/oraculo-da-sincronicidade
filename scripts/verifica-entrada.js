// =====================================================================
// TRAVA DE BUILD — protege o index.html de entrada
// =====================================================================
// Destino: /var/www/oraculo/scripts/verifica-entrada.js
// Ligado em package.json como:  "prebuild": "node scripts/verifica-entrada.js"
//
// Por que isto existe:
//   Em algum deploy antigo, o dist/index.html foi copiado por cima do
//   index.html da raiz. O arquivo de entrada do Vite passou a apontar
//   para um bundle JÁ COMPILADO em vez de /src/main.tsx. A partir dali,
//   TODO build virou build falso: o Vite copiava o bundle velho e
//   ignorava o src/ inteiro. Sem erro, sem aviso, por meses.
//
//   Descoberto em 16/08/2026, quando um build "bem-sucedido" transformou
//   4 módulos em vez de 2233 e o código novo não entrou no ar.
//
// O que esta trava faz:
//   Aborta o build se o index.html não apontar para /src/main.tsx, ou se
//   ele contiver referência a assets compilados. Falhar o build é barato.
//   Descobrir meses depois que nenhum deploy valeu é caro.
// =====================================================================

// O package.json do front tem "type": "module", então isto é ESM.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const aquiDir = path.dirname(fileURLToPath(import.meta.url));
const arquivo = path.resolve(aquiDir, '..', 'index.html');

function morrer(motivo, comoConsertar) {
  console.error('\n\x1b[31mBUILD ABORTADO\x1b[0m\n');
  console.error(`  Problema: ${motivo}`);
  console.error(`  Arquivo:  ${arquivo}\n`);
  console.error(`  Conserto: ${comoConsertar}\n`);
  process.exit(1);
}

if (!fs.existsSync(arquivo)) {
  morrer(
    'index.html não existe na raiz do projeto.',
    'git checkout -- index.html'
  );
}

const html = fs.readFileSync(arquivo, 'utf8');

if (!html.includes('/src/main.tsx')) {
  morrer(
    'index.html não aponta para /src/main.tsx. O Vite não vai compilar o src/.',
    'git checkout -- index.html   (isso restaura a versão correta do repositório)'
  );
}

if (/src="\/assets\/index-[^"]+\.js"/.test(html)) {
  morrer(
    'index.html referencia um bundle já compilado em /assets/. É a marca de um dist/index.html copiado por cima da raiz.',
    'git checkout -- index.html'
  );
}

console.log('Entrada do build conferida: index.html aponta para /src/main.tsx.');
