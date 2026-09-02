// =====================================================================
// ORACULO-API — serviço da borda do Oráculo da Sincronicidade
// =====================================================================
// Destino na VPS: /var/www/oraculo-api/server.js
// Porta: 3985 (verificada livre em 16/08/2026)
// Processo: PM2, nome "oraculo-api"
//
// O que ele resolve:
//   - a chave do Gemini sai do navegador da visitante e passa a viver aqui
//   - o prompt do sistema sai do bundle público e passa a viver aqui
//   - limite de uso por IP, para a cota não ser drenada por bot
//   - log com motivo do erro, para falha nunca mais ser silenciosa
//
// Dependências:
//   npm i express cors dotenv zod express-rate-limit @google/genai
// =====================================================================

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const { z } = require('zod');
const { GoogleGenAI } = require('@google/genai');

const { SYSTEM_INSTRUCTION, VOZ_INSTRUCAO_EXTRA } = require('./prompt');

// ---------------------------------------------------------------------
// 1. Validação de ambiente — fail fast
//    Se faltar chave, o app NÃO sobe. Melhor não subir do que subir quebrado.
// ---------------------------------------------------------------------
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production']).default('production'),
  PORT: z.coerce.number().int().positive().default(3985),
  GEMINI_API_KEY: z.string().min(20, 'GEMINI_API_KEY ausente ou curta demais'),
  GEMINI_MODEL: z.string().default('gemini-3.5-flash'),
  GEMINI_TTS_MODEL: z.string().default('gemini-2.5-flash-preview-tts'),
  GEMINI_IMAGE_MODEL: z.string().default('gemini-2.5-flash-image'),
  GEMINI_VOZ_MODEL: z.string().default('gemini-2.5-flash-native-audio-latest'),
  ALLOWED_ORIGIN: z.string().url().default('https://oraculo.portalthecosmo.com'),
  LEITURAS_POR_MINUTO: z.coerce.number().int().positive().default(10),
  LEITURAS_GRATIS: z.coerce.number().int().min(0).default(5),
  LINK_COMPRA: z.string().default(''),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  console.error('\nORACULO-API não subiu. Ambiente inválido:\n');
  parsed.error.errors.forEach((e) => console.error(`  - ${e.path.join('.')}: ${e.message}`));
  console.error('\nCorrija o .env e tente de novo.\n');
  process.exit(1);
}
const env = parsed.data;

// ---------------------------------------------------------------------
// 2. Log estruturado mínimo, sem dependência extra
// ---------------------------------------------------------------------
function log(nivel, evento, dados = {}) {
  console.log(JSON.stringify({
    ts: new Date().toISOString(),
    nivel,
    app: 'oraculo-api',
    evento,
    ...dados,
  }));
}

// ---------------------------------------------------------------------
// 3. App
// ---------------------------------------------------------------------
const app = express();
app.set('trust proxy', 1); // está atrás do Nginx, precisa do IP real
app.use(express.json({ limit: '64kb' }));
app.use(cors({ origin: env.ALLOWED_ORIGIN, methods: ['GET', 'POST'] }));

const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });

// ---------------------------------------------------------------------
// 3b. Retry para picos de demanda do Gemini
//     503 UNAVAILABLE e 429 do lado do Google são temporários e passam em
//     segundos. Sem retry, um soluço de dois segundos vira "em manutenção"
//     na tela de quem estava consultando. Só repete o que vale repetir:
//     404 de modelo inexistente e 401 de chave inválida não melhoram com
//     insistência, então falham na hora.
// ---------------------------------------------------------------------
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

async function comRetry(fn, rotulo, tentativas = 3) {
  let ultimoErro;
  for (let i = 1; i <= tentativas; i++) {
    try {
      return await fn();
    } catch (err) {
      ultimoErro = err;
      const status = err.status ?? (String(err.message).match(/"code":\s*(\d+)/)?.[1] | 0);
      const vaiPassar = status === 503 || status === 429 || status === 500;
      if (!vaiPassar || i === tentativas) throw err;
      const pausa = i * 1500;
      log('aviso', 'retry', { rotulo, tentativa: i, status, pausa_ms: pausa });
      await espera(pausa);
    }
  }
  throw ultimoErro;
}

// ---------------------------------------------------------------------
// 3c. Créditos de leitura gratuita
//     Cada pessoa tem LEITURAS_GRATIS leituras por conta da casa. Depois
//     disso, o oráculo pede a passagem.
//
//     A contagem é por IP e mora NO SERVIDOR, em disco. Contador no
//     navegador seria apagado com um Ctrl+Shift+Del, e aí não seria
//     limite nenhum: seria enfeite.
//
//     Limitações conhecidas, assumidas de propósito:
//       - quem troca de rede ganha 5 leituras novas
//       - quem divide a rede (escritório, faculdade) divide as 5
//     Resolver isso de verdade exige identificar a pessoa, com e-mail ou
//     conta, e isso é a próxima fase. Para segurar o custo hoje, o IP
//     resolve, e resolve sem pedir nada de ninguém.
//
//     Só desconta quando a leitura foi ENTREGUE. Falha nossa não gasta
//     crédito de quem veio consultar.
// ---------------------------------------------------------------------
const fs = require('fs');
const path = require('path');

const ARQUIVO_CREDITOS = path.join(__dirname, 'data', 'creditos.json');
let creditos = {};

try {
  fs.mkdirSync(path.dirname(ARQUIVO_CREDITOS), { recursive: true });
  if (fs.existsSync(ARQUIVO_CREDITOS)) {
    creditos = JSON.parse(fs.readFileSync(ARQUIVO_CREDITOS, 'utf8'));
  }
} catch (err) {
  log('erro', 'creditos_nao_carregaram', { msg: err.message });
}

let gravacaoPendente = null;
function gravarCreditos() {
  // Agrupa gravações: muitas leituras seguidas não viram muitas escritas.
  if (gravacaoPendente) return;
  gravacaoPendente = setTimeout(() => {
    gravacaoPendente = null;
    try {
      const temp = `${ARQUIVO_CREDITOS}.tmp`;
      fs.writeFileSync(temp, JSON.stringify(creditos));
      fs.renameSync(temp, ARQUIVO_CREDITOS); // troca atômica, nunca fica pela metade
    } catch (err) {
      log('erro', 'creditos_nao_gravaram', { msg: err.message });
    }
  }, 2000);
}

const identifica = (req) => req.ip || 'desconhecido';

function usadas(req) {
  return creditos[identifica(req)]?.usadas || 0;
}

function restantes(req) {
  return Math.max(0, env.LEITURAS_GRATIS - usadas(req));
}

function consumirCredito(req) {
  const id = identifica(req);
  const atual = creditos[id] || { usadas: 0, primeira: new Date().toISOString() };
  atual.usadas += 1;
  atual.ultima = new Date().toISOString();
  creditos[id] = atual;
  gravarCreditos();
}

function exigirCredito(req, res, next) {
  if (restantes(req) > 0) return next();

  log('info', 'creditos_esgotados', { usadas: usadas(req) });
  return res.status(402).json({
    erro: 'Suas leituras gratuitas se completaram.',
    creditosEsgotados: true,
    gratisTotal: env.LEITURAS_GRATIS,
    linkCompra: env.LINK_COMPRA || null,
  });
}

// ---------------------------------------------------------------------
// 4. Rate-limit — segunda camada, o Nginx é a primeira
// ---------------------------------------------------------------------
const limiteLeitura = rateLimit({
  windowMs: 60 * 1000,
  max: env.LEITURAS_POR_MINUTO,
  standardHeaders: true,
  legacyHeaders: false,
  message: { erro: 'O oráculo pede uma pausa. Tente novamente em um minuto.' },
});

// ---------------------------------------------------------------------
// 5. Contrato de entrada
// ---------------------------------------------------------------------
// As tiragens vêm do MESMO arquivo que o front usa, por server/tiragens.js.
// Nome de casa, número de posições e relações não se escrevem aqui: até
// 31/08/2026 este trecho dizia apenas "as 6 posições da Cruz Cigana", sem
// nome nem função, e a tela dizia "Posição 1" — dois lugares falando da
// mesma coisa sem se conhecer. Agora só existe uma fonte.
const {
  TIRAGEM_POR_ID,
  ALIAS_LEGADO,
  IDS_ACEITOS,
  montaMensagem,
} = require('./tiragens');

const leituraSchema = z.object({
  pergunta: z.string().min(3).max(2000),
  modo: z
    .string()
    .refine((v) => IDS_ACEITOS.includes(v), { message: 'tiragem desconhecida' })
    .transform((v) => ALIAS_LEGADO.get(v) ?? v),
  profundidade: z.coerce.number().int().min(0).max(1000).default(500),
  arcanosMaiores: z.array(z.string()).min(1).max(9),
  arcanosMenores: z.array(z.string()).min(1).max(9),
  baralhoCigano: z.array(z.string()).min(1).max(9),
});





// ---------------------------------------------------------------------
// 6. Healthcheck
// ---------------------------------------------------------------------
app.get('/api/oraculo/health', (req, res) => {
  res.json({ ok: true, app: 'oraculo-api', modelo: env.GEMINI_MODEL });
});

// ---------------------------------------------------------------------
// 6b. Quantas leituras ainda restam para quem está perguntando
// ---------------------------------------------------------------------
app.get('/api/oraculo/creditos', (req, res) => {
  res.json({
    restantes: restantes(req),
    total: env.LEITURAS_GRATIS,
    linkCompra: env.LINK_COMPRA || null,
  });
});

// ---------------------------------------------------------------------
// 7. Diagnóstico do modelo
//    Use uma vez, depois do deploy, para confirmar qual modelo a chave
//    realmente atende. Não invente nome de modelo: pergunte para a API.
//    Proteja com token para não expor publicamente.
// ---------------------------------------------------------------------
app.get('/api/oraculo/modelos', async (req, res) => {
  if (req.get('x-diag-token') !== process.env.DIAG_TOKEN) {
    return res.status(404).end();
  }
  try {
    const lista = [];
    for await (const m of await ai.models.list()) lista.push(m.name);
    res.json({ modelos: lista });
  } catch (err) {
    log('erro', 'listar_modelos_falhou', { msg: err.message });
    res.status(502).json({ erro: 'não foi possível listar os modelos' });
  }
});

// ---------------------------------------------------------------------
// 8. A leitura
// ---------------------------------------------------------------------
app.post('/api/oraculo/leitura', limiteLeitura, exigirCredito, async (req, res) => {
  const inicio = Date.now();
  const entrada = leituraSchema.safeParse(req.body);

  if (!entrada.success) {
    log('aviso', 'entrada_invalida', { erros: entrada.error.errors });
    return res.status(400).json({ erro: 'Os dados da consulta chegaram incompletos.' });
  }

  const d = entrada.data;

  // A contagem tem que fechar com a tiragem escolhida: uma carta de cada
  // sistema por posição, nem mais nem menos. Sem isto, uma Cruz Cigana
  // com 5 arcanos maiores entraria calada e a sexta tríade sairia sem
  // Arcano Maior — a IA preencheria o buraco sem avisar ninguém.
  const tiragemEscolhida = TIRAGEM_POR_ID.get(d.modo);
  const contagens = [d.arcanosMaiores.length, d.arcanosMenores.length, d.baralhoCigano.length];
  if (contagens.some((n) => n !== tiragemEscolhida.posicoes)) {
    log('aviso', 'contagem_nao_bate', {
      modo: d.modo,
      esperado: tiragemEscolhida.posicoes,
      recebido: contagens,
    });
    return res.status(400).json({
      erro: `A ${tiragemEscolhida.titulo} pede ${tiragemEscolhida.posicoes} cartas de cada baralho.`,
    });
  }

  const profundidadeTexto = d.profundidade < 300
    ? 'direta e prática'
    : d.profundidade > 700
      ? 'profunda, espiritual e cármica'
      : 'equilibrada';

  // A tiragem já foi validada acima: existe e as três listas têm
  // exatamente uma carta por posição.
  const tiragem = TIRAGEM_POR_ID.get(d.modo);

  const mensagem = montaMensagem(tiragem, d, profundidadeTexto);

  try {
    const resposta = await comRetry(() => ai.models.generateContent({
      model: env.GEMINI_MODEL,
      contents: mensagem,
      config: { systemInstruction: SYSTEM_INSTRUCTION },
    }), 'leitura');

    const texto = resposta.text;
    if (!texto) {
      log('erro', 'resposta_vazia', { modo: d.modo });
      return res.status(502).json({ erro: 'O oráculo silenciou. Tente novamente.' });
    }

    consumirCredito(req);
    log('info', 'leitura_entregue', { modo: d.modo, ms: Date.now() - inicio, restantes: restantes(req) });
    return res.json({ leitura: texto, creditosRestantes: restantes(req) });

  } catch (err) {
    // Aqui está a diferença central: o erro tem nome, tem log e chega na tela.
    log('erro', 'leitura_falhou', {
      modo: d.modo,
      ms: Date.now() - inicio,
      msg: err.message,
      status: err.status ?? null,
    });

    const m = String(err.message || '');
    if (m.includes('API key') || m.includes('API_KEY') || err.status === 401 || err.status === 403) {
      return res.status(500).json({ erro: 'O oráculo está temporariamente indisponível.' });
    }
    if (m.includes('model') || err.status === 404) {
      return res.status(502).json({ erro: 'O oráculo está em manutenção. Tente mais tarde.' });
    }
    if (err.status === 429) {
      return res.status(429).json({ erro: 'O oráculo pede uma pausa. Tente em alguns minutos.' });
    }
    return res.status(502).json({ erro: 'Não foi possível completar a leitura agora.' });
  }
});

// ---------------------------------------------------------------------
// 9. Narração da leitura (TTS)
//    Devolve áudio PCM 16-bit em base64, que é o que o front já sabe tocar.
// ---------------------------------------------------------------------
const narracaoSchema = z.object({ texto: z.string().min(10).max(20000) });

app.post('/api/oraculo/narracao', limiteLeitura, async (req, res) => {
  const entrada = narracaoSchema.safeParse(req.body);
  if (!entrada.success) return res.status(400).json({ erro: 'Texto para narrar não chegou.' });

  // Dois passos, e a ordem importa.
  //
  // O modelo de voz FALA o que recebe: ele não reescreve. Mandar para ele
  // "converta a leitura abaixo em versão narrada" fazia com que às vezes
  // ele respondesse em TEXTO, e o endpoint devolvia 502 sem áudio nenhum.
  // Intermitente, porque dependia de o modelo interpretar a instrução como
  // ordem ou como conteúdo a ser lido.
  //
  // Agora: o modelo de texto faz o roteiro, o modelo de voz só narra.
  const roteiroPrompt = `Você é uma Mentora Espiritual firme, segura e visionária.

Converta a leitura abaixo em uma versão falada, pronta para ser narrada em voz alta.

Diretrizes obrigatórias:
- Linguagem natural, fluida e magnética.
- Frases levemente mais curtas do que no texto escrito.
- Tom seguro, calmo e confiante.
- Não use emojis, não use listas, não use marcação.
- Não mencione nomes de seções.
- Narrativa contínua, do começo ao fim.

Encerre exatamente com:
"O que se revelou aqui é maior do que coincidência. É sincronicidade. Mas sincronicidade só prospera quando há coragem. Faça a sua parte com clareza e decisão, e o Universo sustenta o movimento. Você já viu o que precisava ver. Agora avance. Que assim seja."

Responda APENAS com o texto a ser narrado, sem comentários seus.

Leitura:
${entrada.data.texto}`;

  try {
    const roteiro = await comRetry(() => ai.models.generateContent({
      model: env.GEMINI_MODEL,
      contents: roteiroPrompt,
    }), 'narracao-roteiro');

    const falar = roteiro.text;
    if (!falar) {
      log('erro', 'narracao_sem_roteiro');
      return res.status(502).json({ erro: 'A narração não pôde ser gerada agora.' });
    }

    // Agora sim: só o texto, sem instrução nenhuma junto.
    const r = await comRetry(() => ai.models.generateContent({
      model: env.GEMINI_TTS_MODEL,
      contents: [{ parts: [{ text: falar }] }],
      config: {
        responseModalities: ['AUDIO'],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } },
      },
    }), 'narracao-audio');

    const audio = r.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!audio) {
      // Registra o que veio no lugar do áudio. Sem isso, o diagnóstico
      // deste caso levou mais tempo do que devia.
      const parte = r.candidates?.[0]?.content?.parts?.[0];
      log('erro', 'narracao_sem_audio', {
        veio_texto: parte?.text ? parte.text.slice(0, 200) : null,
        finishReason: r.candidates?.[0]?.finishReason ?? null,
      });
      return res.status(502).json({ erro: 'A narração não pôde ser gerada agora.' });
    }
    log('info', 'narracao_entregue', { bytes: audio.length });
    return res.json({ audio });
  } catch (err) {
    log('erro', 'narracao_falhou', { msg: err.message, status: err.status ?? null });
    return res.status(502).json({ erro: 'A narração não pôde ser gerada agora.' });
  }
});

// ---------------------------------------------------------------------
// 10. Imagem simbólica da leitura
// ---------------------------------------------------------------------
const imagemSchema = z.object({ texto: z.string().min(10).max(20000) });

app.post('/api/oraculo/imagem', limiteLeitura, async (req, res) => {
  const entrada = imagemSchema.safeParse(req.body);
  if (!entrada.success) return res.status(400).json({ erro: 'Texto da leitura não chegou.' });

  try {
    const temas = await comRetry(() => ai.models.generateContent({
      model: env.GEMINI_MODEL,
      contents: `Analise esta leitura de tarot e identifique as 3 cores vibrantes predominantes e os 2 símbolos arquetípicos centrais que representam essa energia. Responda apenas com as cores e símbolos: ${entrada.data.texto}`,
    }), 'imagem-temas');

    const paleta = temas.text || 'Ouro, Índigo, Violeta. Luz e Estrela.';

    const r = await comRetry(() => ai.models.generateContent({
      model: env.GEMINI_IMAGE_MODEL,
      contents: {
        parts: [{
          text: `Create a cinematic symbolic spiritual image representing the vibrational frequency revealed in this tarot reading.

Visual Themes & Palette:
${paleta}

Visual direction:
- Contemporary mystical aesthetic
- Poetic realism
- VIBRANT AND SATURATED COLORS reflecting the identified palette
- Atmospheric depth and cinematic lighting
- Cinematic composition
- Powerful spiritual symbolism
- No text, no watermark
- Vertical format (9:16)
- High detail, premium modern spiritual artwork

The image must feel:
- Visionary and Sacred
- Empowering and Vibrant
- Like destiny materializing in full color

Avoid:
- Traditional tarot card borders
- Text overlays
- Low saturation or dull colors`,
        }],
      },
      config: { imageConfig: { aspectRatio: '9:16' } },
    }), 'imagem');

    const partes = r.candidates?.[0]?.content?.parts || [];
    const img = partes.find((p) => p.inlineData)?.inlineData?.data;
    if (!img) {
      log('erro', 'imagem_sem_retorno');
      return res.status(502).json({ erro: 'A imagem não pôde ser gerada agora.' });
    }
    log('info', 'imagem_entregue', { bytes: img.length });
    return res.json({ imagem: img });
  } catch (err) {
    log('erro', 'imagem_falhou', { msg: err.message, status: err.status ?? null });
    return res.status(502).json({ erro: 'A imagem não pôde ser gerada agora.' });
  }
});

// ---------------------------------------------------------------------
// 11. Conselho rápido da landing
// ---------------------------------------------------------------------
const conselhoSchema = z.object({ carta: z.string().min(2).max(120) });

app.post('/api/oraculo/conselho', limiteLeitura, async (req, res) => {
  const entrada = conselhoSchema.safeParse(req.body);
  if (!entrada.success) return res.status(400).json({ erro: 'Carta não informada.' });

  try {
    const r = await comRetry(() => ai.models.generateContent({
      model: env.GEMINI_MODEL,
      contents: `Dê um conselho de uma frase curta e profunda baseado na carta de tarot "${entrada.data.carta}". Seja místico e direto. Responda em Português.`,
    }), 'conselho');
    return res.json({ conselho: r.text || 'A sincronicidade está em movimento.' });
  } catch (err) {
    log('erro', 'conselho_falhou', { msg: err.message });
    return res.status(502).json({ erro: 'Aguarde o momento certo para a revelação.' });
  }
});

// ---------------------------------------------------------------------
// 12. Token efêmero para a sessão de voz
//
//     A sessão de voz abre WebSocket direto do navegador para o Google.
//     Não passa por proxy: o áudio é bidirecional e em tempo real, e um
//     intermediário aqui só adicionaria atraso e ponto de falha.
//
//     Mas o navegador precisa de ALGUMA credencial para abrir esse canal.
//     A chave da casa não pode ir: ela é permanente e vale para tudo.
//     O token efêmero resolve: nasce aqui no servidor, vale para UMA
//     sessão, expira em minutos e só serve para o modelo de voz.
//
//     É a diferença entre emprestar a chave da casa e abrir a porta.
// ---------------------------------------------------------------------
app.post('/api/oraculo/token-voz', limiteLeitura, exigirCredito, async (req, res) => {
  try {
    const agora = Date.now();
    const token = await ai.authTokens.create({
      config: {
        uses: 1,                                                   // um único uso
        expireTime: new Date(agora + 30 * 60 * 1000).toISOString(), // sessão morre em 30min
        newSessionExpireTime: new Date(agora + 60 * 1000).toISOString(), // 1min para começar
        liveConnectConstraints: {
          model: env.GEMINI_VOZ_MODEL,
          config: {
            responseModalities: ['AUDIO'],
            systemInstruction: SYSTEM_INSTRUCTION + VOZ_INSTRUCAO_EXTRA,
          },
        },
        httpOptions: { apiVersion: 'v1alpha' },
      },
    });

    consumirCredito(req);
    log('info', 'token_voz_emitido', { restantes: restantes(req) });

    return res.json({
      token: token.name,
      modelo: env.GEMINI_VOZ_MODEL,
      creditosRestantes: restantes(req),
    });
  } catch (err) {
    log('erro', 'token_voz_falhou', { msg: err.message, status: err.status ?? null });
    return res.status(502).json({ erro: 'A sessão de voz não pôde ser aberta agora.' });
  }
});

// ---------------------------------------------------------------------
// 13. Sobe
// ---------------------------------------------------------------------
const servidor = app.listen(env.PORT, '127.0.0.1', () => {
  log('info', 'servico_no_ar', { porta: env.PORT, modelo: env.GEMINI_MODEL });
});

// ---------------------------------------------------------------------
// 14. Encerramento com graça
//
//     O processo morria sujo, e isso custava três coisas:
//
//     1. A gravação de créditos é agrupada com um setTimeout de 2s. Um
//        restart dentro dessa janela descartava o crédito que a pessoa
//        acabou de gastar. E restart não é hipótese remota: o teto de
//        memória é 300M e uma narração sozinha leva o processo de 81MB
//        para 129MB.
//     2. Requisição em voo morria no meio, sem explicação para quem
//        estava esperando.
//     3. O motivo de uma queda inesperada se perdia, porque não havia
//        onde registrar.
//
//     Auditoria arquitetural de 17/08/2026, item 2 do roadmap.
// ---------------------------------------------------------------------
let encerrando = false;

function encerraComGraca(sinal) {
  if (encerrando) return; // o PM2 manda SIGINT e SIGTERM; não fazer duas vezes
  encerrando = true;

  log('info', 'encerrando_com_graca', { sinal });

  // Grava o ledger AGORA. gravarCreditos() é debounced de propósito para o
  // caminho normal; aqui a escrita tem que ser imediata, com a mesma troca
  // atômica do original para nunca deixar arquivo pela metade.
  try {
    if (gravacaoPendente) {
      clearTimeout(gravacaoPendente);
      gravacaoPendente = null;
    }
    const temp = `${ARQUIVO_CREDITOS}.tmp`;
    fs.writeFileSync(temp, JSON.stringify(creditos));
    fs.renameSync(temp, ARQUIVO_CREDITOS);
    log('info', 'creditos_gravados_no_encerramento', { ips: Object.keys(creditos).length });
  } catch (err) {
    log('erro', 'creditos_perdidos_no_encerramento', { msg: err.message });
  }

  // Para de aceitar conexão nova e deixa a que está em voo terminar.
  servidor.close(() => {
    log('info', 'servico_encerrado', { sinal });
    process.exit(0);
  });

  // Rede de segurança. Uma narração pode levar 150s e esperar isso travaria
  // o deploy; 20s cobre leitura e conselho. Narração longa ainda morre — e é
  // exatamente por isso que a narração assíncrona é o item 7 do roadmap:
  // depois dela não existe mais requisição longa para drenar.
  setTimeout(() => {
    log('aviso', 'encerramento_forcado', { sinal, espera_s: 20 });
    process.exit(0);
  }, 20_000).unref();
}

process.on('SIGTERM', () => encerraComGraca('SIGTERM'));
process.on('SIGINT', () => encerraComGraca('SIGINT'));

process.on('uncaughtException', (err) => {
  log('erro', 'excecao_nao_tratada', { msg: err.message, stack: err.stack });
  encerraComGraca('uncaughtException');
});

process.on('unhandledRejection', (motivo) => {
  log('erro', 'promessa_rejeitada', { msg: String(motivo) });
});
