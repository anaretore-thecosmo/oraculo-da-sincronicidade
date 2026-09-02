// =====================================================================
// MOSTRA O PROMPT — o que a Sacerdotisa recebe, por tiragem
//
// Rodar:  node scripts/mostra-prompt.mjs cruz-cigana-6
//         node scripts/mostra-prompt.mjs            (as três)
//
// Usa o MESMO módulo que o servidor usa em produção (server/tiragens.js).
// Não sobe servidor, não precisa de chave do Gemini e não gasta crédito
// de ninguém — serve para conferir por dentro o que antes só dava para
// ver pagando uma leitura.
//
// As cartas aqui são de mentira, e de propósito: são "MAIOR-1", "MENOR-1",
// "CIGANO-1"... justamente para ficar óbvio, olhando o texto, qual carta
// caiu em qual posição.
// =====================================================================

import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(RAIZ, 'server', 'tiragens.js'));
const { TIRAGEM_POR_ID, montaMensagem } = require(path.join(RAIZ, 'server', 'tiragens.js'));

const pedido = process.argv[2];
const alvos = pedido ? [pedido] : [...TIRAGEM_POR_ID.keys()];

for (const id of alvos) {
  const tiragem = TIRAGEM_POR_ID.get(id);
  if (!tiragem) {
    console.error(`\nTiragem desconhecida: ${id}\n`);
    process.exit(1);
  }

  const n = tiragem.posicoes;
  const cartas = (prefixo) => Array.from({ length: n }, (_, i) => `${prefixo}-${i + 1}`);

  const mensagem = montaMensagem(
    tiragem,
    {
      pergunta: 'PERGUNTA DA CONSULENTE',
      arcanosMaiores: cartas('MAIOR'),
      arcanosMenores: cartas('MENOR'),
      baralhoCigano: cartas('CIGANO'),
    },
    'equilibrada'
  );

  console.log('\n' + '='.repeat(72));
  console.log(`${tiragem.titulo}  —  id ${tiragem.id}  —  ${n} posições, ${n * 3} cartas`);
  console.log('='.repeat(72));
  console.log(mensagem);
}
console.log('');
