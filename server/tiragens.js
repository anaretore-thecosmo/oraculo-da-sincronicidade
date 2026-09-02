// =====================================================================
// TIRAGENS — leitura da definição canônica e montagem do que a
// Sacerdotisa recebe.
//
// Mora em módulo próprio, e não dentro do server.js, por um motivo
// prático: assim dá para conferir o prompt de cada tiragem sem subir o
// servidor, sem chave do Gemini e sem gastar crédito de ninguém.
// Ver scripts/mostra-prompt.mjs.
//
// A definição em si é src/tiragens.json — a MESMA que o front usa.
// Nome de casa, número de posições e relações não se escrevem aqui.
// =====================================================================

const TIRAGENS = require('../src/tiragens.json');

const TIRAGEM_POR_ID = new Map(TIRAGENS.tiragens.map((t) => [t.id, t]));

// Aliases legados: identificador antigo que ainda pode chegar de um
// navegador com a aba aberta desde antes do deploy. Entra, é normalizado
// para o canônico e não sai daqui. Nenhuma leitura nova o utiliza.
const ALIAS_LEGADO = new Map();
for (const t of TIRAGENS.tiragens) {
  for (const velho of t.aliases || []) ALIAS_LEGADO.set(velho, t.id);
}

const IDS_ACEITOS = [...TIRAGEM_POR_ID.keys(), ...ALIAS_LEGADO.keys()];

// ---------------------------------------------------------------------
// Monta o que a Sacerdotisa recebe.
//
// Antes daqui saíam três listas soltas — "Arcanos Maiores: A, B, C" —
// sem dizer QUAIS cartas formam cada tríade. A IA vinha emparelhando por
// ordem, por conta própria, e ninguém tinha como saber se acertava.
// Agora cada posição chega fechada, com o nome e a pergunta da casa.
// ---------------------------------------------------------------------
function montaTriades(tiragem, d) {
  return tiragem.casas
    .map((casa, i) => {
      const pergunta = casa.pergunta ? `\n   Pergunta da casa: ${casa.pergunta}` : '';
      const local = casa.local ? `\n   Local: ${casa.local}` : '';
      return (
        `Posição ${casa.n} — ${casa.nome}${pergunta}${local}\n` +
        `   Arcano Maior (arquetípico): ${d.arcanosMaiores[i]}\n` +
        `   Arcano Menor (psicológico/comportamental): ${d.arcanosMenores[i]}\n` +
        `   Baralho Cigano (concreto/prático): ${d.baralhoCigano[i]}`
      );
    })
    .join('\n\n');
}

function montaRelacoes(tiragem) {
  if (!tiragem.relacoes || tiragem.relacoes.length === 0) return '';
  const nome = (n) => {
    const c = tiragem.casas.find((x) => x.n === n);
    return c ? `${n} (${c.nome})` : String(n);
  };
  const linhas = tiragem.relacoes
    .map((r) => `- ${r.nome}: ${r.posicoes.map(nome).join(' → ')}. ${r.funcao}`)
    .join('\n');
  const extras = [tiragem.notaCantos, tiragem.notaTendencia].filter(Boolean).join(' ');
  return `\nRelações estruturais desta tiragem:\n${linhas}${extras ? `\n${extras}` : ''}`;
}

function montaOrdem(tiragem) {
  return tiragem.ordemInterpretacao
    .map((passo, i) => {
      const posicoes = passo.posicoes.length ? ` (${passo.posicoes.join(', ')})` : '';
      return `${i + 1}. ${passo.titulo}${posicoes}`;
    })
    .join('\n');
}

function montaInstrucoes(tiragem) {
  return (
    `Tiragem: ${tiragem.titulo}, ${tiragem.posicoes} posições, ${tiragem.posicoes * 3} cartas físicas.\n` +
    `Objetivo: ${tiragem.objetivo}\n` +
    `${TIRAGENS.regraEstrutural}\n` +
    montaRelacoes(tiragem) +
    `\nOrdem de interpretação, nesta sequência:\n${montaOrdem(tiragem)}\n` +
    `Não repita a mesma interpretação em seções diferentes só porque uma carta participa de mais de um eixo: ` +
    `quando ela reaparecer, diga o que MUDA de sentido naquele novo eixo.`
  );
}

function montaMensagem(tiragem, d, profundidadeTexto) {
  return `Sou a Sacerdotisa Visionária. Realize o Diagnóstico da Sincronicidade.

${montaInstrucoes(tiragem)}

TRÍADES, POSIÇÃO POR POSIÇÃO:

${montaTriades(tiragem, d)}

Profundidade: ${profundidadeTexto}.
Pergunta: ${d.pergunta}.`;
}

module.exports = {
  TIRAGENS,
  TIRAGEM_POR_ID,
  ALIAS_LEGADO,
  IDS_ACEITOS,
  montaTriades,
  montaInstrucoes,
  montaMensagem,
};
