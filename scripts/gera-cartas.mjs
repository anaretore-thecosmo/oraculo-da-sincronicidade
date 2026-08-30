// =====================================================================
// GERA OS DERIVADOS DAS CARTAS — PNG original → WebP que o site serve
//
// Rodar (na bancada, uma vez; os WebP vão versionados para o git):
//   node scripts/gera-cartas.mjs --originais "artes-originais/Oráculo da Sincronicidade"
//   node scripts/gera-cartas.mjs --originais "..." --forcar   (refaz tudo)
//
// Por que existe, e por que os originais não vão para o site:
//   As 114 artes são PNG de 1024×1536, entre 1,2 MB e 3,7 MB cada — 320 MB
//   no total. Uma leitura de 9 cartas baixaria ~27 MB no celular de quem
//   visita. Em WebP 600×900 a mesma leitura fica na casa de 2 MB.
//
//   Os PNG são canônicos e NÃO são tocados por este script: ele só lê.
//   O mestre continua sendo o Drive; a pasta artes-originais/ é cópia de
//   trabalho e está no .gitignore.
//
// Por que 600×900:
//   A carta aparece no site em 160×240 pontos. Numa tela retina de 3x isso
//   dá 480×720. 600×900 cobre com folga e mantém o 2:3 exato do original,
//   sem corte e sem distorção.
//
// Por que ffmpeg e não uma biblioteca:
//   Já existe nesta máquina. Instalar dependência de imagem no projeto
//   engordaria o `npm ci` de todo deploy para um trabalho que se faz uma
//   vez só — e os derivados vão versionados, então a VPS nunca precisa
//   converter nada.
// =====================================================================

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MANIFESTO = path.join(RAIZ, 'public', 'cartas', 'cartas.json');
const DESTINO = path.join(RAIZ, 'public', 'cartas');

const LARGURA = 600;
const ALTURA = 900;
const QUALIDADE = 82;

const args = process.argv.slice(2);
const forcar = args.includes('--forcar');
const i = args.indexOf('--originais');
const ORIGINAIS = i >= 0 ? args[i + 1] : null;

if (!ORIGINAIS) {
  console.error('\nFalta dizer onde estão os originais:\n  node scripts/gera-cartas.mjs --originais "<pasta>"\n');
  process.exit(1);
}

const base = path.isAbsolute(ORIGINAIS) ? ORIGINAIS : path.join(RAIZ, ORIGINAIS);
if (!fs.existsSync(base)) {
  console.error(`\nPasta de originais não encontrada: ${base}\n`);
  process.exit(1);
}

const { cartas } = JSON.parse(fs.readFileSync(MANIFESTO, 'utf8'));
fs.mkdirSync(DESTINO, { recursive: true });

const problemas = [];
let feitos = 0;
let pulados = 0;
let bytes = 0;

console.log(`\nGerando ${cartas.length} derivados em ${LARGURA}×${ALTURA}, qualidade ${QUALIDADE}.\n`);

for (const carta of cartas) {
  const origem = path.join(base, ...carta.origem.split('/'));
  const alvo = path.join(DESTINO, `${carta.id}.webp`);

  if (!fs.existsSync(origem)) {
    problemas.push(`${carta.id} (${carta.nome}): original ausente — ${carta.origem}`);
    continue;
  }

  // Confere a proporção ANTES de converter. Uma arte fora do 2:3 sairia
  // esticada, e esticada é o tipo de defeito que ninguém vê no thumbnail
  // e todo mundo vê na carta aberta.
  const dim = execFileSync('ffprobe', [
    '-v', 'error', '-select_streams', 'v:0',
    '-show_entries', 'stream=width,height', '-of', 'csv=p=0', origem,
  ]).toString().trim();
  const [larg, alt] = dim.split(',').map(Number);
  if (Math.abs(larg / alt - LARGURA / ALTURA) > 0.001) {
    problemas.push(`${carta.id} (${carta.nome}): proporção ${larg}×${alt}, esperado 2:3 — não converti`);
    continue;
  }

  if (!forcar && fs.existsSync(alvo) && fs.statSync(alvo).mtimeMs >= fs.statSync(origem).mtimeMs) {
    pulados++;
    bytes += fs.statSync(alvo).size;
    continue;
  }

  // Escreve em arquivo temporário e só então renomeia. Sem isto, uma
  // execução interrompida no meio deixa um .webp pela metade — e o
  // "já existe, pulo" da execução seguinte adota o defeito como pronto.
  // Aconteceu em 30/08 com maior-16 (A Torre): arquivo truncado, contagem
  // dizendo 114, e só a conferência por dentro denunciou.
  const temp = `${alvo}.tmp`;
  try {
    execFileSync('ffmpeg', [
      '-y', '-loglevel', 'error',
      '-i', origem,
      '-vf', `scale=${LARGURA}:${ALTURA}:flags=lanczos`,
      '-c:v', 'libwebp', '-quality', String(QUALIDADE), '-compression_level', '6',
      '-f', 'webp', temp,
    ]);
    // Confere o que saiu antes de aceitar: ffprobe tem que ler o arquivo
    // e devolver exatamente a dimensão pedida.
    const conf = execFileSync('ffprobe', [
      '-v', 'error', '-select_streams', 'v:0',
      '-show_entries', 'stream=width,height', '-of', 'csv=p=0', temp,
    ]).toString().trim();
    if (conf !== `${LARGURA},${ALTURA}`) throw new Error(`saiu ${conf}`);
    fs.renameSync(temp, alvo);
  } catch (err) {
    try { fs.unlinkSync(temp); } catch { /* já não existe */ }
    problemas.push(`${carta.id} (${carta.nome}): a conversão falhou — ${err.message.split('\n')[0]}`);
    continue;
  }

  const tam = fs.statSync(alvo).size;
  bytes += tam;
  feitos++;
  process.stdout.write(`  ${carta.id.padEnd(20)} ${carta.nome.padEnd(22)} ${(tam / 1024).toFixed(0).padStart(4)} KB\n`);
}

console.log('');
if (problemas.length) {
  console.error(`${problemas.length} problema(s):`);
  for (const p of problemas) console.error(`  - ${p}`);
  console.error('');
  process.exit(1);
}

console.log(
  `Prontos: ${feitos} gerados, ${pulados} já existiam. ` +
    `Baralho inteiro: ${(bytes / 1024 / 1024).toFixed(1)} MB ` +
    `(média ${(bytes / cartas.length / 1024).toFixed(0)} KB por carta).\n`
);
