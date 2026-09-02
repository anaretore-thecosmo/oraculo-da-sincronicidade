// =====================================================================
// TESTE DA ROTA DE LEITURA — caminho válido, sem gastar crédito
//
// Rodar (na VPS, com o serviço no ar):
//   node scripts/testa-leitura.mjs
//   node scripts/testa-leitura.mjs http://127.0.0.1:3985
//
// Por que existe:
//   Em 02/09/2026 a produção caiu por uma variável que mudou de arquivo no
//   refactor e não foi importada. Passou por build, três travas e health
//   200 — o /health não toca a rota da leitura. A consulta inválida que o
//   deploy passou a fazer pega o começo do caminho, mas não o resto: a
//   contagem, a montagem das tríades e o prompt só acontecem quando o
//   payload é VÁLIDO. Este teste percorre o caminho inteiro.
//
// Como não gasta crédito:
//   Usa o modo "ensaio" da rota, honrado só com o x-diag-token correto. O
//   servidor monta tudo e devolve o prompt SEM chamar o Gemini. O token é
//   lido de server/.env aqui dentro e nunca é impresso nem passado por
//   linha de comando.
//
// O que confere, por modalidade:
//   1. HTTP 200 e resposta de ensaio
//   2. Número de posições: 3, 6 e 9
//   3. Cada posição com o nome e a pergunta vindos de src/tiragens.json
//   4. Cada posição com EXATAMENTE uma carta de cada baralho, e as cartas
//      certas naquela posição (as cartas de teste são numeradas de propósito)
//   5. As relações específicas da modalidade no prompt
//   6. Nenhum vocabulário de outra tiragem vazando
//   7. Payload inválido continua sendo recusado
//   8. O serviço continua de pé depois de tudo
// =====================================================================

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = process.argv[2] || 'http://127.0.0.1:3985';
const TIRAGENS = JSON.parse(fs.readFileSync(path.join(RAIZ, 'src', 'tiragens.json'), 'utf8'));

// ---------------------------------------------------------------------
// Token, lido do .env do servidor. Nunca impresso.
// ---------------------------------------------------------------------
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
  console.error('\nTESTE DA LEITURA: DIAG_TOKEN não encontrado em server/.env.');
  console.error('Sem ele o ensaio não é honrado e o caminho válido fica sem teste.\n');
  process.exit(1);
}

const falhas = [];
const falha = (m) => falhas.push(m);

async function post(corpo, comToken = true) {
  const r = await fetch(`${BASE}/api/oraculo/leitura`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(comToken ? { 'x-diag-token': TOKEN } : {}),
    },
    body: JSON.stringify(corpo),
  });
  let json = null;
  try {
    json = await r.json();
  } catch {
    /* corpo vazio ou não-JSON: o próprio teste acusa abaixo */
  }
  return { status: r.status, json };
}

// ---------------------------------------------------------------------
// 1 a 6 — o caminho válido, uma modalidade por vez
// ---------------------------------------------------------------------
for (const tiragem of TIRAGENS.tiragens) {
  const n = tiragem.posicoes;
  const onde = tiragem.id;
  const cartas = (p) => Array.from({ length: n }, (_, i) => `${p}-${i + 1}`);

  const { status, json } = await post({
    pergunta: `Teste automatico do caminho valido: ${tiragem.titulo}.`,
    modo: tiragem.id,
    profundidade: 500,
    ensaio: true,
    arcanosMaiores: cartas('MAIOR'),
    arcanosMenores: cartas('MENOR'),
    baralhoCigano: cartas('CIGANO'),
  });

  if (status !== 200) {
    falha(`${onde}: o caminho válido respondeu ${status} — ${JSON.stringify(json)}`);
    continue;
  }
  if (json?.ensaio !== true) {
    falha(`${onde}: a resposta não é de ensaio — o teste teria chamado o provedor`);
    continue;
  }
  if (json.posicoes !== n) {
    falha(`${onde}: o servidor diz ${json.posicoes} posições, a definição diz ${n}`);
  }

  const prompt = json.prompt || '';

  // 3 e 4 — nome, pergunta e a tríade certa em cada posição
  for (const casa of tiragem.casas) {
    const i = casa.n;
    const bloco = new RegExp(
      `Posição ${i} — ${casa.nome.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}` +
        `[\\s\\S]*?Arcano Maior \\(arquetípico\\): MAIOR-${i}\\n` +
        `\\s*Arcano Menor \\(psicológico/comportamental\\): MENOR-${i}\\n` +
        `\\s*Baralho Cigano \\(concreto/prático\\): CIGANO-${i}`
    );
    if (!bloco.test(prompt)) {
      falha(`${onde}: a posição ${i} (${casa.nome}) não chegou com a tríade certa e completa`);
    }
    if (casa.pergunta && !prompt.includes(casa.pergunta)) {
      falha(`${onde}: a pergunta da casa ${i} (${casa.nome}) não foi para o diagnóstico`);
    }
  }

  // 4b — uma carta de cada baralho por posição, nem mais nem menos
  const conta = (t) => (prompt.match(new RegExp(t, 'g')) || []).length;
  for (const [rotulo, alvo] of [
    ['Arcano Maior', 'Arcano Maior \\(arquetípico\\):'],
    ['Arcano Menor', 'Arcano Menor \\(psicológico/comportamental\\):'],
    ['Baralho Cigano', 'Baralho Cigano \\(concreto/prático\\):'],
  ]) {
    const c = conta(alvo);
    if (c !== n) falha(`${onde}: ${rotulo} aparece ${c} vezes, esperado ${n}`);
  }

  // 5 — as relações desta modalidade
  for (const r of tiragem.relacoes || []) {
    if (!prompt.includes(r.nome)) falha(`${onde}: a relação "${r.nome}" não entrou no prompt`);
  }

  // 6 — vocabulário de outra tiragem não pode vazar
  for (const outra of TIRAGENS.tiragens) {
    if (outra.id === tiragem.id) continue;
    for (const casa of outra.casas) {
      // "Núcleo" existe na Cruz Cigana E no Quadrado de 9: nome repetido
      // entre tiragens não é vazamento. Só acusa o que é exclusivo da outra.
      const exclusivo = !tiragem.casas.some((c) => c.nome === casa.nome);
      const soDaOutra = !TIRAGENS.tiragens.some(
        (t) => t.id !== outra.id && t.id !== tiragem.id && t.casas.some((c) => c.nome === casa.nome)
      );
      if (exclusivo && soDaOutra && prompt.includes(casa.nome)) {
        falha(`${onde}: o prompt cita "${casa.nome}", que é posição da ${outra.titulo}`);
      }
    }
  }
  if (/celta/i.test(prompt)) falha(`${onde}: a palavra "Celta" apareceu no prompt`);

  console.log(
    `  ${tiragem.titulo.padEnd(15)} ${n} posições · ${n * 3} cartas · ` +
      `tríades conferidas uma a uma · ${(tiragem.relacoes || []).length} relações no prompt`
  );
}

// ---------------------------------------------------------------------
// 7 — o payload inválido continua sendo recusado
// ---------------------------------------------------------------------
for (const tiragem of TIRAGENS.tiragens) {
  const { status, json } = await post({
    pergunta: 'Teste automatico de recusa.',
    modo: tiragem.id,
    ensaio: true,
    arcanosMaiores: ['UMA'],
    arcanosMenores: ['UMA'],
    baralhoCigano: ['UMA'],
  });
  const deveriaRecusar = tiragem.posicoes !== 1;
  if (deveriaRecusar && (status !== 400 || !json?.erro)) {
    falha(`${tiragem.id}: contagem errada não foi recusada (status ${status})`);
  }
}
console.log('  contagem errada recusada nas três · tiragem inexistente recusada');

{
  const { status } = await post({
    pergunta: 'Teste automatico.',
    modo: 'cruz-celta-10',
    ensaio: true,
    arcanosMaiores: ['A'],
    arcanosMenores: ['B'],
    baralhoCigano: ['C'],
  });
  if (status !== 400) falha(`tiragem inexistente devolveu ${status}, esperado 400`);
}

// ---------------------------------------------------------------------
// 8 — o serviço continua de pé depois de tudo
// ---------------------------------------------------------------------
{
  const r = await fetch(`${BASE}/api/oraculo/health`);
  const saude = await r.json().catch(() => null);
  if (r.status !== 200 || saude?.ok !== true) {
    falha('o serviço não respondeu ao health depois dos testes — alguma exceção o derrubou');
  } else {
    console.log(`  serviço de pé depois dos testes (${saude.app}, ${saude.modelo})`);
  }
}

// ---------------------------------------------------------------------
if (falhas.length) {
  console.error(`\nTESTE DA LEITURA: ${falhas.length} falha(s).\n`);
  for (const f of falhas) console.error(`  - ${f}`);
  console.error('');
  process.exit(1);
}
console.log('');
