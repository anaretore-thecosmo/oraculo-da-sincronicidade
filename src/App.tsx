/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect, lazy, Suspense } from 'react';
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import { Sparkles, Send, Moon, Sun, Compass, Eye, Zap, Volume2, Loader2, Image as ImageIcon, RotateCcw, LayoutGrid, Plus, Grid3X3, Mic, MicOff, Wand2, Feather, ChevronRight, LogOut, Info, X } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import MANIFESTO from './cartas.json';
import TIRAGENS from './tiragens.json';
// Carregado sob demanda: o VoiceSession arrasta o SDK do Gemini junto,
// e quem só faz leitura não tem por que baixar 277KB que nunca vai usar.
const VoiceSession = lazy(() => import('./VoiceSession'));

// --- Constants & Types ---

// Os modelos são escolhidos no servidor, via GEMINI_MODEL, GEMINI_TTS_MODEL
// e GEMINI_IMAGE_MODEL no .env do oraculo-api. Trocar de modelo passou a ser
// mudança de configuração, não de código, e não exige rebuild do front.

const MAJOR_ARCANA = [
  "O Louco", "O Mago", "A Sacerdotisa", "A Imperatriz", "O Imperador", "O Hierofante",
  "Os Enamorados", "O Carro", "A Justiça", "O Eremita", "A Roda da Fortuna", "A Força",
  "O Pendurado", "A Morte", "A Temperança", "O Diabo", "A Torre", "A Estrela",
  "A Lua", "O Sol", "O Julgamento", "O Mundo"
];

const MINOR_ARCANA = [
  "Ás de Paus", "Dois de Paus", "Três de Paus", "Quatro de Paus", "Cinco de Paus", "Seis de Paus", "Sete de Paus", "Oito de Paus", "Nove de Paus", "Dez de Paus", "Valete de Paus", "Cavaleiro de Paus", "Rainha de Paus", "Rei de Paus",
  "Ás de Copas", "Dois de Copas", "Três de Copas", "Quatro de Copas", "Cinco de Copas", "Seis de Copas", "Sete de Copas", "Oito de Copas", "Nove de Copas", "Dez de Copas", "Valete de Copas", "Cavaleiro de Copas", "Rainha de Copas", "Rei de Copas",
  "Ás de Espadas", "Dois de Espadas", "Três de Espadas", "Quatro de Espadas", "Cinco de Espadas", "Seis de Espadas", "Sete de Espadas", "Oito de Espadas", "Nove de Espadas", "Dez de Espadas", "Valete de Espadas", "Cavaleiro de Espadas", "Rainha de Espadas", "Rei de Espadas",
  "Ás de Ouros", "Dois de Ouros", "Três de Ouros", "Quatro de Ouros", "Cinco de Ouros", "Seis de Ouros", "Sete de Ouros", "Oito de Ouros", "Nove de Ouros", "Dez de Ouros", "Valete de Ouros", "Cavaleiro de Ouros", "Rainha de Ouros", "Rei de Ouros"
];

const GYPSY_TAROT = [
  "O Cavaleiro", "O Trevo", "O Navio", "A Casa", "A Árvore", "As Nuvens", "A Serpente",
  "O Caixão", "As Flores", "A Foice", "O Chicote", "Os Pássaros", "A Criança", "A Raposa",
  "O Urso", "A Estrela", "A Cegonha", "O Cão", "A Torre", "O Jardim", "A Montanha",
  "O Caminho", "O Rato", "O Coração", "O Anel", "O Livro", "A Carta", "O Homem",
  "A Mulher", "Os Lírios", "O Sol", "A Lua", "A Chave", "O Peixe", "A Âncora", "A Cruz"
];

// ---------------------------------------------------------------------
// A arte oficial de cada carta.
//
// A chave leva o BARALHO junto, e não só o nome, porque quatro nomes
// existem em dois baralhos ao mesmo tempo com artes diferentes: A Torre,
// A Estrela, O Sol e A Lua são Arcano Maior E carta cigana. Procurar só
// pelo nome traria a arte errada em oito das 114 — e traria calada.
//
// O vínculo carta→arquivo vive em src/cartas.json, escrito à mão, carta
// por carta. scripts/verifica-cartas.mjs roda no prebuild e derruba o
// build se faltar arte, se sobrar arquivo ou se algum nome divergir
// desta lista. Nada aqui é resolvido por semelhança de texto.
// ---------------------------------------------------------------------
const ARTES = new Map(
  MANIFESTO.cartas.map((c) => [`${c.baralho}|${c.nome}`, `/cartas/${c.id}.webp`])
);

function arteDaCarta(baralho: string, nome: string): string | undefined {
  return ARTES.get(`${baralho}|${nome}`);
}

type AppState = 'landing' | 'input' | 'selecting' | 'loading' | 'reading' | 'voice';
type SelectionPhase = 'major' | 'minor' | 'gypsy';
// 'celtic-cross' foi aposentado em 31/08/2026. O nome estava errado por
// dentro: Cruz Celta é outro método, com dez posições. A Cruz Cigana do
// Oráculo tem seis. Quem preenchesse a lacuna pelo identificador antigo
// importaria a tradição errada — e ficaria plausível o bastante para
// ninguém notar. O servidor ainda aceita o valor velho como alias, só
// para não derrubar quem estava com a aba aberta durante o deploy.
type ReadingMode = '3-cards' | 'cruz-cigana-6' | 'square-of-9';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  generatedImage?: string;
  majorCards?: string[];
  minorCards?: string[];
  gypsyCards?: string[];
}

// ---------------------------------------------------------------------
// As tiragens vêm de src/tiragens.json — a mesma definição que o servidor
// usa para validar a entrada e para montar o prompt do diagnóstico.
//
// Nome visível, número de posições e nome de cada casa NÃO se escrevem
// aqui: se estivessem em dois lugares, um dia divergiriam, e a tela
// mostraria "Núcleo" onde o diagnóstico leu "Posição 1". Só o ícone
// mora no código, porque é JSX e não cabe em JSON.
// ---------------------------------------------------------------------
const ICONES_TIRAGEM: Record<string, React.ReactNode> = {
  '3-cards': <span className="text-2xl font-serif text-gold-texto">3</span>,
  'cruz-cigana-6': <Plus className="w-6 h-6 text-gold-texto" />,
  'square-of-9': <LayoutGrid className="w-6 h-6 text-gold-texto" />,
};

const READING_MODES = TIRAGENS.tiragens.map((t) => ({
  id: t.id,
  title: t.titulo,
  description: t.descricao,
  icon: ICONES_TIRAGEM[t.id],
  cardCount: t.posicoes,
}));

// A casa que ocupa determinada posição da tiragem escolhida.
// indice é base zero (a ordem em que a carta foi consagrada).
function casaDaTiragem(modo: string, indice: number) {
  return TIRAGENS.tiragens.find((t) => t.id === modo)?.casas[indice];
}

// O que aparece embaixo da carta. Na tiragem de 3 o rótulo é curto
// (Passado / Presente / Futuro), como sempre foi — o nome inteiro
// (Passado/Raiz) é o que vai para o diagnóstico. Nas outras duas,
// rótulo e nome são a mesma coisa.
function rotuloDaCasa(modo: string, indice: number): string | undefined {
  const casa = casaDaTiragem(modo, indice) as { nome: string; rotulo?: string } | undefined;
  return casa?.rotulo ?? casa?.nome;
}




// Quando o proxy devolve uma página de erro (504, 502), o corpo vem em HTML
// e o .json() estoura com "Unexpected token '<'", que não diz nada a ninguém.
// Aconteceu na narração em 16/08. Este helper transforma isso em recado.
async function lerResposta(r: Response) {
  const bruto = await r.text();
  try {
    return JSON.parse(bruto);
  } catch {
    if (r.status === 504) return { erro: 'O oráculo demorou mais do que o esperado. Tente novamente.' };
    if (r.status === 502 || r.status === 503) return { erro: 'O oráculo está momentaneamente fora de alcance.' };
    return { erro: 'Não foi possível completar agora. Tente novamente.' };
  }
}

// --- Components ---

export default function App() {
  const [isDarkMode, setIsDarkMode] = useState(true);
  // A chave do Gemini vive no servidor (/var/www/oraculo-api/.env).
  // O navegador não guarda, não pede e não vê chave nenhuma.
  // Todo mundo entra direto. Não há mais porteiro pedindo chave.
  const [appState, setAppState] = useState<AppState>('landing');
  const [selectionPhase, setSelectionPhase] = useState<SelectionPhase>('major');
  const [readingMode, setReadingMode] = useState<ReadingMode>('3-cards');

  useEffect(() => {
    if (appState !== 'loading') { setSegundosNaEspera(0); return; }
    const t = setInterval(
      () =>
        setSegundosNaEspera((s) => {
          // Aviso de espera prolongada uma vez so, e nao a cada segundo.
          if (s + 1 === 60) {
            setAnuncio('A interpretação está levando mais tempo do que o habitual. Sua pergunta e suas cartas continuam preservadas.');
          }
          return s + 1;
        }),
      1000
    );
    return () => clearInterval(t);
  }, [appState]);

  // Quem pede movimento reduzido no sistema recebe a mesma informação sem
  // o deslocamento: a carta troca de face em vez de girar, e o realce de
  // toque some. O CSS cuida das animações declaradas em folha de estilo;
  // isto aqui cuida das que o Motion controla por JavaScript, que a media
  // query não alcança.
  const semMovimento = useReducedMotion();
  const realceSuspenso = semMovimento ? undefined : { y: -5, scale: 1.02 };
  const realceCarta = semMovimento ? undefined : { y: -5, scale: 1.05 };
  const toqueSuave = semMovimento ? undefined : { scale: 0.98 };
  const toqueCarta = semMovimento ? undefined : { scale: 0.95 };
  const viradaDaCarta = semMovimento
    ? { duration: 0 }
    : { duration: 0.6, type: 'spring' as const, stiffness: 260, damping: 20 };

  // Enter e Espaco em elemento que nao e <button> nativo. O Motion torna o
  // elemento focavel, mas nao o torna acionavel: medido em 02/09/2026, o
  // foco chegava nos cartoes e nas cartas e nenhuma tecla os ativava — a
  // jornada inteira era impossivel sem mouse.
  // Enter e Espaco. Medido em 02/09/2026: o evento chega ao elemento nas
  // duas fases, captura e borbulha — o Motion nao interrompe a propagacao.
  // Fase normal, portanto.
  const aoTeclado = (acao: () => void) => (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      acao();
    }
  };

  // O Quadrado de 9 se desenha como tabuleiro 3x3, e nao como fileira que
  // quebra onde couber. A geometria dele nao e enfeite: e ela que sustenta
  // a leitura do Nucleo no centro, das tres linhas, das tres colunas e das
  // duas diagonais. Se as nove cartas quebram em 5+4, a diagonal 1-5-9
  // deixa de existir aos olhos de quem le. As outras duas tiragens seguem
  // no layout de sempre.
  const emTabuleiro = readingMode === 'square-of-9';
  const [depth, setDepth] = useState(500);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [selectedMajor, setSelectedMajor] = useState<string[]>([]);
  const [selectedMinor, setSelectedMinor] = useState<string[]>([]);
  const [selectedGypsy, setSelectedGypsy] = useState<string[]>([]);
  const [revealedCards, setRevealedCards] = useState<Set<string>>(new Set());
  const [availableCards, setAvailableCards] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Identificador da tentativa. Nasce quando a pessoa manda revelar, e
  // sobrevive à retentativa: é ele que impede o servidor de cobrar duas
  // vezes se a leitura concluir lá e não chegar aqui.
  const [tentativaId, setTentativaId] = useState<string | null>(null);
  // Existe leitura pendente com estas mesmas cartas? É o que autoriza o
  // botão de tentar de novo sem refazer a tiragem.
  const [podeTentarDeNovo, setPodeTentarDeNovo] = useState(false);
  // Segundos decorridos na espera. Tempo decorrido é fato; etapa do
  // provedor seria invenção, porque o servidor não sabe em que ponto o
  // Gemini está.
  const [segundosNaEspera, setSegundosNaEspera] = useState(0);
  // Uma regiao viva so, com frase curta. Anuncia mudanca de estado real —
  // nunca animacao, e nunca a identidade de carta que ainda esta virada
  // para baixo, que quem enxerga tambem nao ve.
  const [anuncio, setAnuncio] = useState('');
  const [isNarrating, setIsNarrating] = useState<number | null>(null);
  const [isGeneratingImage, setIsGeneratingImage] = useState<number | null>(null);
  const [showQuickAdvice, setShowQuickAdvice] = useState(false);
  const [showIntentionGuide, setShowIntentionGuide] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [quickAdvice, setQuickAdvice] = useState<{ card: string, advice: string } | null>(null);
  const [isGeneratingQuickAdvice, setIsGeneratingQuickAdvice] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  // Quantas leituras por conta da casa ainda restam. Quem manda é o
  // servidor: o navegador só exibe o que ele responder.
  const [creditos, setCreditos] = useState<{ restantes: number, total: number, linkCompra: string | null } | null>(null);
  const [esgotado, setEsgotado] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const recognitionRef = useRef<any>(null);

  const toggleTheme = () => setIsDarkMode(!isDarkMode);

  useEffect(() => {
    // Theme initialization
    if (isDarkMode) {
      document.documentElement.classList.remove('light');
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
      document.documentElement.classList.add('light');
    }
  }, [isDarkMode]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, appState, selectedMajor, selectedMinor, selectedGypsy]);

  const handleNewReading = () => {
    setMessages([]);
    setInput('');
    setAppState('landing');
    setSelectionPhase('major');
    setSelectedMajor([]);
    setSelectedMinor([]);
    setSelectedGypsy([]);
    setRevealedCards(new Set());
    setAvailableCards([]);
    setIsLoading(false);
    setIsNarrating(null);
    setQuickAdvice(null);
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
  };

  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, []);

  useEffect(() => {
    fetch('/api/oraculo/creditos')
      .then(r => r.json())
      .then(d => {
        setCreditos(d);
        if (d.restantes === 0) setEsgotado(true);
      })
      .catch(() => { /* silêncio: sem contador é melhor que erro na cara */ });
  }, []);

  const handleQuickAdvice = async () => {
    setIsGeneratingQuickAdvice(true);
    setShowQuickAdvice(true);
    setQuickAdvice(null);

    const allCards = [...MAJOR_ARCANA, ...MINOR_ARCANA, ...GYPSY_TAROT];
    const randomCard = allCards[Math.floor(Math.random() * allCards.length)];

    try {
      const resposta = await fetch('/api/oraculo/conselho', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ carta: randomCard }),
      });
      const dados = await lerResposta(resposta);
      if (!resposta.ok) throw new Error(dados.erro);

      setQuickAdvice({ card: randomCard, advice: dados.conselho });
    } catch (error) {
      console.error("Erro no conselho rápido:", error);
      setQuickAdvice({ card: "O Destino", advice: "Aguarde o momento certo para a revelação." });
    } finally {
      setIsGeneratingQuickAdvice(false);
    }
  };

  const toggleRecording = async () => {
    console.log("toggleRecording acionado. Estado atual isRecording:", isRecording);
    
    if (isRecording) {
      console.log("Parando gravação...");
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch (e) {
          console.error("Erro ao parar reconhecimento:", e);
        }
      }
      setIsRecording(false);
      return;
    }

    // Tentar solicitar permissão explicitamente primeiro
    try {
      console.log("Solicitando permissão de microfone...");
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // Se chegamos aqui, temos permissão. Podemos parar o stream imediatamente.
      stream.getTracks().forEach(track => track.stop());
      console.log("Permissão concedida.");
    } catch (err) {
      console.error("Erro de permissão:", err);
      setError("Permissão de microfone negada ou não encontrada. Por favor, verifique as configurações do seu navegador.");
      return;
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      console.error("SpeechRecognition não suportado neste navegador.");
      setError("Seu navegador não suporta reconhecimento de voz. Tente usar o Chrome ou Edge.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'pt-BR';
    recognition.interimResults = true;
    recognition.continuous = true;
    recognition.maxAlternatives = 1;

    const initialText = input;

    recognition.onstart = () => {
      console.log("Evento onstart disparado");
      setIsRecording(true);
      setError(null);
      
      if (isNarrating !== null) {
        if ((window as any).currentAudioSource) {
          try {
            (window as any).currentAudioSource.stop();
          } catch (e) {}
        }
        setIsNarrating(null);
      }
    };

    recognition.onresult = (event: any) => {
      let sessionTranscript = '';
      const lastIndex = event.results.length - 1;
      const lastTranscript = event.results[lastIndex][0].transcript.trim();
      
      // Heurística para detectar navegadores que retornam resultados cumulativos (comum em alguns dispositivos móveis)
      let isCumulative = false;
      if (lastIndex > 0) {
        const prevTranscript = event.results[lastIndex - 1][0].transcript.trim();
        if (prevTranscript.length > 0 && lastTranscript.startsWith(prevTranscript)) {
          isCumulative = true;
        }
      }

      if (isCumulative) {
        sessionTranscript = lastTranscript;
      } else {
        for (let i = 0; i < event.results.length; ++i) {
          const t = event.results[i][0].transcript.trim();
          if (t) sessionTranscript += t + ' ';
        }
      }
      
      if (sessionTranscript) {
        const finalOutput = sessionTranscript.trim();
        setInput(initialText ? `${initialText.trim()} ${finalOutput}` : finalOutput);
      }
    };

    recognition.onerror = (event: any) => {
      console.error("Evento onerror disparado:", event.error);
      setIsRecording(false);
      
      if (event.error === 'not-allowed') {
        setError("Acesso ao microfone negado. Habilite a permissão nas configurações do site.");
      } else if (event.error === 'no-speech') {
        console.log("Nenhuma fala detectada.");
      } else if (event.error === 'network') {
        setError("Erro de rede no reconhecimento de voz.");
      } else {
        setError(`Erro no reconhecimento: ${event.error}`);
      }
    };

    recognition.onend = () => {
      console.log("Evento onend disparado");
      setIsRecording(false);
    };

    recognitionRef.current = recognition;
    
    try {
      console.log("Chamando recognition.start()...");
      recognition.start();
      setIsRecording(true); // Feedback imediato
    } catch (err) {
      console.error("Erro fatal ao iniciar recognition:", err);
      setError("Falha ao iniciar o reconhecimento de voz.");
      setIsRecording(false);
    }
  };

  const handleEnergyClearing = () => {
    setIsClearing(true);
    setTimeout(() => {
      handleNewReading();
      setIsClearing(false);
    }, 1000);
  };

  const selectMode = (mode: ReadingMode) => {
    setReadingMode(mode);
    setAppState('input');
  };

  const shuffleCards = (phase: SelectionPhase) => {
    let deck: string[] = [];
    if (phase === 'major') deck = [...MAJOR_ARCANA];
    else if (phase === 'minor') deck = [...MINOR_ARCANA];
    else if (phase === 'gypsy') deck = [...GYPSY_TAROT];
    
    const shuffled = [...deck].sort(() => 0.5 - Math.random());
    setAvailableCards(shuffled);
  };

  const startSelection = () => {
    if (!input.trim()) return;
    // Tiragem nova: tentativa nova, e a anterior deixa de valer.
    setTentativaId(null);
    setPodeTentarDeNovo(false);
    setSelectionPhase('major');
    shuffleCards('major');
    setAppState('selecting');
    const quantas = READING_MODES.find(m => m.id === readingMode)?.cardCount || 3;
    setAnuncio(`Consagração aberta. Arcanos Maiores: escolha ${quantas} cartas.`);
    setSelectedMajor([]);
    setSelectedMinor([]);
    setSelectedGypsy([]);
    setRevealedCards(new Set());
  };

  // Escolhas do baralho que esta em consagracao agora.
  const escolhasDesteBaralho =
    selectionPhase === 'major' ? selectedMajor : selectionPhase === 'minor' ? selectedMinor : selectedGypsy;
  const podeEmbaralhar = escolhasDesteBaralho.length === 0;

  const handleCardClick = (card: string) => {
    const modeInfo = READING_MODES.find(m => m.id === readingMode);
    const maxCards = modeInfo?.cardCount || 3;

    if (selectionPhase === 'major') {
      if (selectedMajor.includes(card) || selectedMajor.length >= maxCards) return;
      const newSelected = [...selectedMajor, card];
      setSelectedMajor(newSelected);
      setAnuncio(`${newSelected.length} de ${maxCards} consagradas.`);
      if (newSelected.length === maxCards) {
        setTimeout(() => {
          setSelectionPhase('minor');
          setAnuncio(`Arcanos Maiores completos. Agora Arcanos Menores: escolha ${maxCards} cartas.`);
          shuffleCards('minor');
        }, 600);
      }
    } else if (selectionPhase === 'minor') {
      if (selectedMinor.includes(card) || selectedMinor.length >= maxCards) return;
      const newSelected = [...selectedMinor, card];
      setSelectedMinor(newSelected);
      setAnuncio(`${newSelected.length} de ${maxCards} consagradas.`);
      if (newSelected.length === maxCards) {
        setTimeout(() => {
          setSelectionPhase('gypsy');
          setAnuncio(`Arcanos Menores completos. Agora Baralho Cigano: escolha ${maxCards} cartas.`);
          shuffleCards('gypsy');
        }, 600);
      }
    } else if (selectionPhase === 'gypsy') {
      if (selectedGypsy.includes(card) || selectedGypsy.length >= maxCards) return;
      const newSelected = [...selectedGypsy, card];
      setSelectedGypsy(newSelected);
      setAnuncio(`${newSelected.length} de ${maxCards} consagradas.`);
    }
  };

  const confirmSelection = () => {
    // Leitura nova, tentativa nova.
    const id = crypto.randomUUID();
    setTentativaId(id);
    performReading(selectedMajor, selectedMinor, selectedGypsy, id);
  };

  // Tentar de novo com as MESMAS cartas: mesma tríade, mesma pergunta,
  // mesmo identificador de tentativa. Não sorteia nada de novo.
  const tentarDeNovo = () => {
    const id = tentativaId ?? crypto.randomUUID();
    if (!tentativaId) setTentativaId(id);
    performReading(selectedMajor, selectedMinor, selectedGypsy, id);
  };

  const toggleReveal = (card: string) => {
    setRevealedCards(prev => {
      const next = new Set(prev);
      if (next.has(card)) next.delete(card);
      else next.add(card);
      return next;
    });
  };

  const revealAll = () => {
    const all = new Set([...selectedMajor, ...selectedMinor, ...selectedGypsy]);
    setRevealedCards(all);
  };

  const handleSaveDiagnosis = () => {
    const assistantMessages = messages.filter(m => m.role === 'assistant');
    if (assistantMessages.length === 0) return;

    const lastReading = assistantMessages[assistantMessages.length - 1].content;
    const timestamp = new Date().toLocaleDateString('pt-BR');
    
    const content = `
ORÁCULO DA SINCRONICIDADE - DIAGNÓSTICO DE DESTINO
Data: ${timestamp}

CARTAS REVELADAS:
- Arcanos Maiores: ${selectedMajor.join(', ')}
- Arcanos Menores: ${selectedMinor.join(', ')}
- Baralho Cigano: ${selectedGypsy.join(', ')}

--------------------------------------------------
DIAGNÓSTICO DA SACERDOTISA:

${lastReading}

--------------------------------------------------
O destino é forjado no agora.
Sincronicidade & Inteligência Artificial.
    `.trim();

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `diagnostico-sincronicidade-${new Date().getTime()}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const performReading = async (
    major: string[],
    minor: string[],
    gypsy: string[],
    idDaTentativa: string
  ) => {
    setAppState('loading');
    setIsLoading(true);
    setError(null);
    setPodeTentarDeNovo(false);
    setAnuncio('Leitura enviada. Isso pode levar alguns minutos. Suas cartas foram preservadas.');

    const userMessage: Message = {
      role: 'user',
      content: input,
      timestamp: new Date(),
      majorCards: major,
      minorCards: minor,
      gypsyCards: gypsy
    };

    setMessages([userMessage]); 
    const currentInput = input;

    try {
      // A chave do Gemini vive no servidor, em /var/www/oraculo-api/.env.
      // O navegador não conhece chave nenhuma e não precisa conhecer.
      const resposta = await fetch('/api/oraculo/leitura', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pergunta: currentInput,
          modo: readingMode,
          profundidade: depth,
          arcanosMaiores: major,
          arcanosMenores: minor,
          baralhoCigano: gypsy,
          tentativaId: idDaTentativa,
        }),
      });

      const dados = await lerResposta(resposta);

      if (resposta.status === 402) {
        // Leituras gratuitas acabaram. Não é erro: é o fim do que era grátis.
        setCreditos({ restantes: 0, total: dados.gratisTotal, linkCompra: dados.linkCompra });
        setEsgotado(true);
        setAppState('input');
        setIsLoading(false);
        return;
      }

      if (!resposta.ok) {
        throw new Error(dados.erro || "Não foi possível completar a leitura agora.");
      }

      if (typeof dados.creditosRestantes === 'number') {
        setCreditos(c => c ? { ...c, restantes: dados.creditosRestantes } : c);
      }

      const assistantMessage: Message = {
        role: 'assistant',
        content: dados.leitura,
        timestamp: new Date(),
      };

      setMessages(prev => [...prev, assistantMessage]);
      setPodeTentarDeNovo(false);
      setAnuncio('Diagnóstico pronto.');
      setAppState('reading');
    } catch (err: any) {
      console.error("ERRO NA LEITURA DO ORÁCULO:", err);
      // O serviço já devolve o motivo em texto de gente. Mostra o que ele disse.
      // As cartas NÃO são apagadas aqui. Até 02/09/2026 a falha devolvia
      // para a pergunta e o próximo passo zerava as três seleções: depois
      // de até 157 segundos de espera, a pessoa reconsagrava 27 cartas por
      // uma falha que não era dela.
      setError(
        err.message ||
          'Não foi possível concluir a interpretação agora. Sua pergunta e suas cartas foram preservadas. Você não precisa realizar a tiragem novamente.'
      );
      setPodeTentarDeNovo(true);
      setAnuncio('Não foi possível concluir a interpretação. Sua pergunta e suas cartas foram preservadas. Há um botão para tentar novamente.');
      setAppState('input');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;
    startSelection();
  };

  const handleNarrate = async (content: string, index: number) => {
    // Stop any existing audio
    if ((window as any).currentAudioSource) {
      try {
        (window as any).currentAudioSource.stop();
        (window as any).currentAudioSource = null;
      } catch (e) {
        console.error("Error stopping audio:", e);
      }
    }

    if (isNarrating === index) {
      setIsNarrating(null);
      return;
    }

    setIsNarrating(index);

    try {
      // O prompt da narração mora no servidor, junto da chave.
      const resposta = await fetch('/api/oraculo/narracao', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ texto: content }),
      });
      const dados = await lerResposta(resposta);
      if (!resposta.ok) throw new Error(dados.erro || 'A narração não pôde ser gerada agora.');

      const base64Audio = dados.audio;
      if (base64Audio) {
        const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
        const arrayBuffer = Uint8Array.from(atob(base64Audio), c => c.charCodeAt(0)).buffer;
        
        // PCM 16-bit Little Endian
        const float32Array = new Float32Array(arrayBuffer.byteLength / 2);
        const dataView = new DataView(arrayBuffer);
        for (let i = 0; i < float32Array.length; i++) {
          float32Array[i] = dataView.getInt16(i * 2, true) / 32768;
        }
        
        const audioBuffer = audioContext.createBuffer(1, float32Array.length, 24000);
        audioBuffer.getChannelData(0).set(float32Array);
        
        const source = audioContext.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(audioContext.destination);
        source.onended = () => {
          if (isNarrating === index) setIsNarrating(null);
        };
        source.start();
        
        // Store source to allow stopping
        (window as any).currentAudioSource = source;
      } else {
        setIsNarrating(null);
      }
    } catch (error) {
      console.error("Erro na narração:", error);
      setIsNarrating(null);
    }
  };

  const handleGenerateImage = async (content: string, index: number) => {
    if (isGeneratingImage !== null) return;
    setIsGeneratingImage(index);

    try {
      // Prompt e chave moram no servidor. O front só pede a imagem.
      const resposta = await fetch('/api/oraculo/imagem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ texto: content }),
      });
      const dados = await lerResposta(resposta);
      if (!resposta.ok) throw new Error(dados.erro || 'A imagem não pôde ser gerada agora.');

      const imageUrl = dados.imagem ? `data:image/png;base64,${dados.imagem}` : "";

      if (imageUrl) {
        setMessages(prev => prev.map((msg, i) => i === index ? { ...msg, generatedImage: imageUrl } : msg));
      }
    } catch (error) {
      console.error("Erro ao gerar imagem:", error);
    } finally {
      setIsGeneratingImage(null);
    }
  };

  return (
    <div className="min-h-screen flex flex-col transition-colors duration-700 selection:bg-gold/30">
      {/* Background Elements */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-gold/5 blur-[120px] rounded-full" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-gold/5 blur-[120px] rounded-full" />
      </div>

      {/* Header */}
      <header className="sticky top-0 z-50 glass-panel m-4 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-gold/20 flex items-center justify-center border border-gold/30 shadow-[0_0_15px_rgba(197,160,89,0.2)]">
            <Eye className="text-gold-texto w-5 h-5" />
          </div>
          <div onClick={handleNewReading} className="cursor-pointer">
            {/* Marca, nao titulo do documento: havia dois <h1> na mesma pagina. A
                  classe continua a mesma, entao a aparencia nao muda. */}
              <p className="serif text-xl font-semibold tracking-wide text-gold-texto uppercase">Oráculo da Sincronicidade</p>
            <p className="text-[10px] uppercase tracking-[0.2em] opacity-50 font-medium text-center">Inteligência Ancestral & Artificial</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          {appState !== 'landing' && (
            <button
              onClick={handleNewReading}
              className={`flex items-center gap-2 min-h-11 px-4 py-2 rounded-full border transition-all ${isDarkMode ? 'bg-gold/10 border-gold/20 text-gold-texto hover:bg-gold hover:text-sobre-ouro' : 'bg-gold/20 border-gold/30 text-gold-texto hover:bg-gold hover:text-white'}`}
            >
              <RotateCcw className="w-3 h-3" />
              Início
            </button>
          )}
          <div className="flex items-center gap-4">
            {(
              <div className="flex items-center gap-2 border-r border-gold/10 pr-4 mr-2 hidden md:flex">
                <button 
                  onClick={handleQuickAdvice}
                  className="min-w-11 min-h-11 flex items-center justify-center rounded-full text-suave hover:text-gold-texto hover:bg-gold/10 transition-all group relative"
                  title="Sincronicidade Instantânea"
                >
                  <Zap className="w-4 h-4" />
                  <span className="absolute -bottom-8 left-1/2 -translate-x-1/2 bg-mystic-dark text-gold-texto text-[8px] py-1 px-2 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap border border-gold/20 z-[60]">Conselho Rápido</span>
                </button>
                <button 
                  onClick={() => setShowIntentionGuide(true)}
                  className="min-w-11 min-h-11 flex items-center justify-center rounded-full text-suave hover:text-gold-texto hover:bg-gold/10 transition-all group relative"
                  title="Guia de Intenção"
                >
                  <Compass className="w-4 h-4" />
                  <span className="absolute -bottom-8 left-1/2 -translate-x-1/2 bg-mystic-dark text-gold-texto text-[8px] py-1 px-2 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap border border-gold/20 z-[60]">Guia de Intenção</span>
                </button>
                <button 
                  onClick={handleEnergyClearing}
                  className="min-w-11 min-h-11 flex items-center justify-center rounded-full text-suave hover:text-gold-texto hover:bg-gold/10 transition-all group relative"
                  title="Limpeza Energética"
                >
                  <Eye className={`w-4 h-4 ${isClearing ? 'animate-spin' : ''}`} />
                  <span className="absolute -bottom-8 left-1/2 -translate-x-1/2 bg-mystic-dark text-gold-texto text-[8px] py-1 px-2 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap border border-gold/20 z-[60]">Limpar Campo</span>
                </button>
              </div>
            )}
            <button 
              onClick={toggleTheme}
              className={`min-w-11 min-h-11 flex items-center justify-center rounded-full transition-all ${isDarkMode ? 'text-suave hover:text-gold-texto hover:bg-panel-bg' : 'text-suave hover:text-gold-texto hover:bg-panel-bg'}`}
              title={isDarkMode ? "Modo Claro" : "Modo Escuro"}
            >
              {isDarkMode ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto px-4 md:px-8 py-6 space-y-8 max-w-6xl mx-auto w-full">
        {appState === 'landing' && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center justify-center min-h-[70vh] text-center space-y-12"
          >
            <div className="space-y-4">
              <h1 className="serif text-5xl md:text-7xl text-gold-texto tracking-tighter uppercase leading-none">Oráculo da<br/>Sincronicidade</h1>
              <p className="text-[12px] uppercase tracking-[0.5em] text-suave font-bold">Inteligência Ancestral & Artificial</p>
              <div className="h-px w-24 bg-gold/30 mx-auto my-8" />
              <h2 className="serif text-2xl md:text-3xl text-mystic-paper tracking-tight italic">Como o destino se revela para você hoje?</h2>
              <p className="text-suave max-w-2xl mx-auto text-sm">
                A sabedoria das cartas encontra o campo inteligente que organiza os acontecimentos.
              </p>

              {/* Leituras por conta da casa. Discreto: informa sem pressionar. */}
              {creditos && !esgotado && (
                <p className="text-[10px] uppercase tracking-[0.3em] text-suave pt-2">
                  {creditos.restantes === 1
                    ? 'Última leitura por conta da casa'
                    : `${creditos.restantes} leituras por conta da casa`}
                </p>
              )}
            </div>

            {esgotado && (
              <div className="glass-panel p-10 w-full max-w-2xl space-y-6 border-gold/20">
                <h3 className="serif text-2xl text-gold-texto uppercase tracking-wider">O campo pede uma pausa</h3>
                <p className="text-suave text-sm leading-relaxed">
                  Suas leituras por conta da casa se completaram. O que se revelou até aqui continua valendo, e o oráculo segue aberto para quem quiser atravessar.
                </p>
                {creditos?.linkCompra ? (
                  <a
                    href={creditos.linkCompra}
                    className="inline-block px-10 py-4 rounded-xl bg-gold text-sobre-ouro uppercase tracking-[0.3em] text-xs font-bold hover:scale-[1.02] transition-all"
                  >
                    Continuar a travessia
                  </a>
                ) : (
                  <p className="text-[10px] uppercase tracking-[0.2em] text-suave">Em breve, a continuação</p>
                )}
              </div>
            )}

            <div className={`grid grid-cols-1 md:grid-cols-3 gap-6 w-full max-w-5xl ${esgotado ? 'opacity-30 pointer-events-none' : ''}`}>
              {READING_MODES.map((mode) => (
                <motion.div
                  key={mode.id}
                  role="button"
                  tabIndex={0}
                  aria-label={`${mode.title}. ${mode.description}. ${mode.cardCount * 3} cartas.`}
                  whileHover={realceSuspenso}
                  whileTap={toqueSuave}
                  onClick={() => selectMode(mode.id as ReadingMode)}
                  onKeyDown={aoTeclado(() => selectMode(mode.id as ReadingMode))}
                  className="glass-panel p-8 cursor-pointer group flex flex-col items-center text-center space-y-6 border-white/5 hover:border-gold/30 transition-all"
                >
                  <div className="w-16 h-16 rounded-2xl bg-gold/10 flex items-center justify-center border border-gold/20 group-hover:bg-gold/20 transition-all">
                    {mode.icon}
                  </div>
                  <div className="space-y-2">
                    <h3 className="serif text-2xl text-mystic-paper uppercase tracking-wider">{mode.title}</h3>
                    <p className="text-suave text-sm">{mode.description}</p>
                  </div>
                </motion.div>
              ))}
            </div>

            {/* Sessão por Voz: reativada com token efêmero emitido pelo
                servidor. Consome uma leitura, como qualquer consulta. */}
            <div className={`grid grid-cols-1 gap-6 w-full max-w-xl ${esgotado ? 'opacity-30 pointer-events-none' : ''}`}>
              <motion.div
                whileHover={realceSuspenso}
                whileTap={toqueSuave}
                onClick={() => !esgotado && setAppState('voice')}
                className="glass-panel p-6 flex items-center gap-6 border-white/5 hover:border-gold/30 cursor-pointer group transition-all"
              >
                <div className="w-12 h-12 rounded-full bg-gold/10 flex items-center justify-center border border-gold/20 group-hover:bg-gold/20 transition-all">
                  <Mic className="w-5 h-5 text-gold-texto" />
                </div>
                <div className="text-left">
                  <h4 className="serif text-lg text-mystic-paper uppercase">Sessão por Voz</h4>
                  <p className="text-xs text-suave italic">Use seu tarot físico e revele as cartas que o Oráculo irá interpretar</p>
                </div>
              </motion.div>
            </div>
          </motion.div>
        )}

        {appState === 'voice' && (
          <Suspense fallback={
            <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
              <Loader2 className="w-8 h-8 text-gold-texto animate-spin" />
              <p className="text-[10px] uppercase tracking-[0.3em] text-suave">Abrindo o canal</p>
            </div>
          }>
            <VoiceSession
              onBack={() => setAppState('landing')}
              onCreditos={(restantes) => setCreditos(c => c ? { ...c, restantes } : c)}
            />
          </Suspense>
        )}

        {appState === 'input' && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="max-w-3xl mx-auto w-full py-12 space-y-8"
          >
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                role="alert"
                className="p-6 rounded-2xl bg-red-500/10 border border-red-500/20 text-center space-y-4"
              >
                <p className="text-red-500 text-sm serif italic">{error}</p>

                {/* A tiragem continua de pé: mesma pergunta, mesmas cartas,
                    mesma tentativa. Não há novo sorteio, e o servidor
                    reconhece a tentativa para não cobrar duas vezes. */}
                {podeTentarDeNovo && (
                  <button
                    onClick={tentarDeNovo}
                    disabled={isLoading}
                    className="px-8 py-3 rounded-full bg-gold text-sobre-ouro uppercase tracking-[0.2em] text-xs font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
                  >
                    Tentar novamente com estas cartas
                  </button>
                )}
              </motion.div>
            )}
            <div className="glass-panel p-12 space-y-12 relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-1 bg-gold/20" />
              
              <div className="text-center space-y-4">
                <Feather className="w-8 h-8 text-gold-texto mx-auto animate-float" />
                <h1 className="serif text-3xl text-gold-texto uppercase tracking-widest">Abra seu Coração</h1>
                <p className="text-suave text-sm">Explique detalhadamente sua situação para uma resposta mais assertiva.</p>
              </div>

              <div className="space-y-6">
                <div className="space-y-2">
                  <label className="text-[10px] uppercase tracking-[0.2em] text-suave font-medium">Sua dúvida ou intenção</label>
                  <div className="relative group/input">
                    <textarea
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      placeholder="Conte ao oráculo o que você deseja saber..."
                      className="w-full bg-mystic-dark/50 border border-panel-border rounded-2xl px-6 py-6 focus:outline-none focus:border-gold/50 transition-all resize-none h-48 text-lg placeholder:opacity-20 pr-16"
                    />
                    {input && !isRecording && (
                      <motion.button
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        whileHover={semMovimento ? undefined : { scale: 1.2, color: '#D4AF37' }}
                        whileTap={semMovimento ? undefined : { scale: 0.9 }}
                        onClick={() => setInput('')}
                        className="absolute top-4 right-4 p-2 text-suave transition-colors"
                        title="Limpar texto"
                      >
                        <X className="w-4 h-4" />
                      </motion.button>
                    )}
                    <motion.button
                      whileTap={semMovimento ? undefined : { scale: 0.9 }}
                      whileHover={semMovimento ? undefined : { scale: 1.1 }}
                      onClick={toggleRecording}
                      type="button"
                      className={`absolute bottom-6 right-6 min-w-11 min-h-11 flex items-center justify-center rounded-full transition-all duration-500 z-30 cursor-pointer pointer-events-auto ${
                        isRecording 
                          ? 'bg-red-500/20 text-red-500 animate-pulse shadow-[0_0_20px_rgba(239,68,68,0.3)] border border-red-500/50' 
                          : 'bg-gold/5 text-suave hover:text-gold-texto hover:bg-gold/10 border border-gold/10'
                      }`}
                      title={isRecording ? "Parar Gravação" : "Falar com o Oráculo"}
                    >
                      {isRecording ? (
                        <motion.div
                          animate={{ scale: [1, 1.2, 1] }}
                          transition={{ repeat: Infinity, duration: 1.5 }}
                        >
                          <MicOff className="w-5 h-5" />
                        </motion.div>
                      ) : (
                        <Mic className="w-5 h-5" />
                      )}
                    </motion.button>
                    {isRecording && (
                      <div className="absolute bottom-6 right-20 flex items-center gap-2 pointer-events-none">
                        <span className="flex gap-1">
                          <span className="w-1 h-3 bg-red-500 animate-[bounce_1s_infinite_0ms]" />
                          <span className="w-1 h-4 bg-red-500 animate-[bounce_1s_infinite_200ms]" />
                          <span className="w-1 h-2 bg-red-500 animate-[bounce_1s_infinite_400ms]" />
                        </span>
                        <span className="text-[10px] uppercase tracking-widest text-red-500 font-bold">Ouvindo...</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="glass-panel p-8 space-y-6 bg-mystic-dark/30">
                  <div className="flex justify-between items-center">
                    <label className="text-[10px] uppercase tracking-[0.2em] text-suave font-medium">Profundidade da Leitura</label>
                    <span className="text-gold-texto font-mono text-sm">{depth}</span>
                  </div>
                  <input 
                    type="range" 
                    min="1" 
                    max="1000" 
                    value={depth}
                    onChange={(e) => setDepth(parseInt(e.target.value))}
                    className="w-full accent-gold bg-panel-border h-1 rounded-full appearance-none cursor-pointer"
                  />
                  <div className="flex justify-between text-[8px] uppercase tracking-widest text-suave">
                    <span>Direto e Prático</span>
                    <span>Espiritual e Karma</span>
                  </div>
                </div>

                <button
                  onClick={startSelection}
                  disabled={!input.trim()}
                  className="w-full py-6 rounded-2xl bg-panel-bg border border-panel-border text-suave uppercase tracking-[0.3em] text-sm font-semibold hover:bg-gold/10 hover:text-gold-texto hover:border-gold/30 transition-all disabled:opacity-20 disabled:cursor-not-allowed shadow-xl"
                >
                  Consagrar Pergunta
                </button>
              </div>
            </div>
          </motion.div>
        )}

        {appState === 'selecting' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="space-y-12 py-12"
          >
            <div className="text-center space-y-6">
              <h1 className="serif text-4xl text-mystic-paper italic uppercase tracking-widest">
                {selectionPhase === 'major' ? 'Arcanos Maiores' : selectionPhase === 'minor' ? 'Arcanos Menores' : 'Baralho Cigano'}
              </h1>
              <p className="text-suave text-sm uppercase tracking-widest">
                {selectionPhase === 'major' ? 'Escolha as forças arquetípicas' : selectionPhase === 'minor' ? 'Escolha as influências cotidianas' : 'Escolha os movimentos concretos'}
              </p>
              
              <div className="flex flex-col items-center gap-4">
                <div className="flex gap-2">
                  {Array.from({ length: READING_MODES.find(m => m.id === readingMode)?.cardCount || 3 }).map((_, i) => {
                    const currentSelected = selectionPhase === 'major' ? selectedMajor : selectionPhase === 'minor' ? selectedMinor : selectedGypsy;
                    return (
                      <div 
                        key={i} 
                        className={`w-3 h-3 rounded-full border border-gold/40 transition-all duration-500 ${i < currentSelected.length ? 'bg-gold shadow-[0_0_10px_rgba(197,160,89,0.5)]' : 'bg-transparent'}`} 
                      />
                    );
                  })}
                </div>
                <p className="text-suave text-[10px] uppercase tracking-[0.3em] font-bold">
                  {(selectionPhase === 'major' ? selectedMajor : selectionPhase === 'minor' ? selectedMinor : selectedGypsy).length} de {READING_MODES.find(m => m.id === readingMode)?.cardCount} cartas consagradas
                </p>
              </div>
              <button
                onClick={() => {
                  if (!podeEmbaralhar) {
                    setAnuncio('Desmarque as cartas escolhidas para embaralhar novamente.');
                    return;
                  }
                  shuffleCards(selectionPhase);
                }}
                aria-disabled={!podeEmbaralhar}
                title={podeEmbaralhar ? undefined : 'Desmarque as cartas escolhidas para embaralhar novamente.'}
                className={`flex items-center gap-2 mx-auto min-h-11 px-6 py-3 rounded-full bg-panel-bg border border-panel-border text-suave text-xs uppercase tracking-widest transition-all ${
                  podeEmbaralhar ? 'hover:bg-panel-border' : 'opacity-40 cursor-not-allowed'
                }`}
              >
                <RotateCcw className="w-4 h-4" />
                Embaralhar Deck
              </button>
            </div>

            <div className="grid grid-cols-4 md:grid-cols-6 lg:grid-cols-9 gap-4">
              {availableCards.map((card, i) => {
                const currentSelected = selectionPhase === 'major' ? selectedMajor : selectionPhase === 'minor' ? selectedMinor : selectedGypsy;
                const isSelected = currentSelected.includes(card);

                return (
                  <motion.div
                    key={`${selectionPhase}-${i}`}
                    role="button"
                    tabIndex={0}
                    aria-pressed={isSelected}
                    // O nome acessivel NAO diz que carta e esta: durante a
                    // consagracao ela esta virada para baixo, e quem enxerga
                    // tambem nao sabe. Dizer aqui vazaria a carta para quem
                    // usa leitor de tela e quebraria o proprio sorteio.
                    aria-label={`Carta ${i + 1} de ${availableCards.length}, virada para baixo`}
                    whileHover={realceCarta}
                    whileTap={toqueCarta}
                    onClick={() => handleCardClick(card)}
                    onKeyDown={aoTeclado(() => handleCardClick(card))}
                    className={`relative aspect-[2/3] cursor-pointer transition-all duration-300 rounded-lg overflow-hidden border ${
                      isSelected 
                        ? 'border-gold shadow-[0_0_20px_rgba(197,160,89,0.3)]' 
                        : 'border-white/5 bg-mystic-dark/40'
                    }`}
                  >
                    {/* Card Back - Hidden during selection */}
                    <div className="absolute inset-0 bg-mystic-dark flex items-center justify-center">
                      <div className="w-full h-full border-2 border-gold/20 rounded-lg m-1 flex items-center justify-center bg-[radial-gradient(circle_at_center,rgba(197,160,89,0.05)_0%,transparent_70%)]">
                        <Sun className="w-8 h-8 text-gold/10" />
                      </div>
                    </div>

                    {isSelected && (
                      <div className="absolute inset-0 bg-gold/40 backdrop-blur-sm" />
                    )}
                  </motion.div>
                );
              })}
            </div>

            <div className="flex justify-center gap-6">
              <button
                onClick={() => {
                  if (selectionPhase === 'major') setSelectedMajor([]);
                  else if (selectionPhase === 'minor') setSelectedMinor([]);
                  else setSelectedGypsy([]);
                  setAnuncio('Escolhas desmarcadas. O baralho pode ser embaralhado de novo.');
                }}
                className="px-8 py-4 rounded-full border border-panel-border text-suave uppercase tracking-widest text-xs hover:bg-panel-bg transition-all"
              >
                Limpar Escolha
              </button>
              <button
                onClick={confirmSelection}
                disabled={
                  selectedMajor.length < (READING_MODES.find(m => m.id === readingMode)?.cardCount || 3) ||
                  selectedMinor.length < (READING_MODES.find(m => m.id === readingMode)?.cardCount || 3) ||
                  selectedGypsy.length < (READING_MODES.find(m => m.id === readingMode)?.cardCount || 3)
                }
                className="px-12 py-4 rounded-full bg-gradient-to-r from-gold/80 to-gold text-sobre-ouro uppercase tracking-widest text-xs font-bold hover:scale-105 transition-all disabled:opacity-20 disabled:grayscale"
              >
                <div className="flex items-center gap-2">
                  <Zap className="w-4 h-4" />
                  Revelar Destino
                </div>
              </button>
            </div>
          </motion.div>
        )}

        {appState === 'loading' && (
          <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-8">
            <div className="relative">
              <div className="w-24 h-32 border-2 border-gold/30 rounded-xl animate-pulse flex items-center justify-center">
                <Feather className="text-gold/20 w-12 h-12" />
              </div>
              <div className="absolute -top-2 -right-2 w-6 h-6 bg-gold rounded-full animate-ping" />
            </div>
            <div className="text-center space-y-3 max-w-md px-6">
              <h1 className="serif text-3xl text-gold-texto italic">
                Suas cartas foram preservadas. A leitura está sendo integrada.
              </h1>
              {/* Tempo decorrido é fato observável. Etapa do provedor seria
                  invenção: o servidor não sabe em que ponto o Gemini está,
                  e barra de progresso aqui seria progresso fingido. */}
              <p className="text-suave text-sm">
                {segundosNaEspera < 60
                  ? 'Isso pode levar alguns minutos. Você pode permanecer nesta página.'
                  : 'A interpretação está levando mais tempo do que o habitual. Sua pergunta e suas cartas continuam preservadas.'}
              </p>
              {/* Sem aria-live aqui: anunciar o relogio faria o leitor de tela
                  falar a cada segundo. O aviso de espera prolongada sai uma
                  vez so, pela regiao viva do rodape. */}
              <p className="text-suave uppercase tracking-[0.3em] text-[10px] tabular-nums">
                {Math.floor(segundosNaEspera / 60)}:{String(segundosNaEspera % 60).padStart(2, '0')} decorrido
              </p>
            </div>
          </div>
        )}

        {appState === 'reading' && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="max-w-5xl mx-auto w-full py-12 space-y-20"
          >
            {/* Hierarchical Revelation Section */}
            <div className="space-y-24">
              <div className="flex flex-col items-center gap-6">
                <h1 className="serif text-3xl text-gold-texto uppercase tracking-[0.4em]">Revelação do Campo</h1>
                <button 
                  onClick={revealAll}
                  className="px-8 py-3 rounded-full bg-gold/10 border border-gold/30 text-gold-texto text-[10px] uppercase tracking-[0.3em] hover:bg-gold hover:text-sobre-ouro transition-all"
                >
                  Revelar Todas as Cartas
                </button>
              </div>

              {[
                { title: 'Arcanos Maiores', baralho: 'maiores', cards: selectedMajor, type: 'Espiritual / Arquetípico' },
                { title: 'Arcanos Menores', baralho: 'menores', cards: selectedMinor, type: 'Psicológico / Cotidiano' },
                { title: 'Baralho Cigano', baralho: 'cigano', cards: selectedGypsy, type: 'Material / Prático' }
              ].map((deck, deckIdx) => (
                <div key={deckIdx} className="space-y-12">
                  <div className="flex flex-col items-center gap-2">
                    <h2 className="serif text-2xl text-mystic-paper uppercase tracking-[0.3em] italic">{deck.title}</h2>
                    <p className="text-[10px] text-suave uppercase tracking-[0.4em]">{deck.type}</p>
                    <div className="h-px w-32 bg-gold/20 mt-4" />
                  </div>

                  <div
                    className={
                      emTabuleiro
                        ? // Tres colunas SEMPRE, inclusive no celular: a topologia e o
                          // conteudo. O que se adapta e o tamanho — a carta ocupa a
                          // celula e mantem 2:3, a mesma proporcao da arte original.
                          'grid grid-cols-3 gap-2 sm:gap-4 md:gap-6 w-full max-w-[34rem] mx-auto px-1'
                        : 'flex flex-wrap justify-center gap-8'
                    }
                  >
                    {deck.cards.map((card, cardIdx) => {
                      const isRevealed = revealedCards.has(card);
                      return (
                        <div
                          key={cardIdx}
                          className={`flex flex-col items-center ${emTabuleiro ? 'space-y-2 sm:space-y-3' : 'space-y-6'}`}
                        >
                          <motion.div
                            role="button"
                            tabIndex={0}
                            aria-pressed={isRevealed}
                            aria-label={
                              isRevealed
                                ? `${casaDaTiragem(readingMode, cardIdx)?.nome ?? `Posição ${cardIdx + 1}`}: ${card}. Tocar para virar de volta.`
                                : `${casaDaTiragem(readingMode, cardIdx)?.nome ?? `Posição ${cardIdx + 1}`}: carta virada para baixo. Tocar para revelar.`
                            }
                            onClick={() => toggleReveal(card)}
                            onKeyDown={aoTeclado(() => toggleReveal(card))}
                            animate={{ rotateY: isRevealed ? 180 : 0 }}
                            transition={viradaDaCarta}
                            className={`relative cursor-pointer preserve-3d group ${
                              emTabuleiro ? 'w-full aspect-[2/3]' : 'w-40 h-60'
                            }`}
                          >
                            {/* Card Back */}
                            <div className={`absolute inset-0 backface-hidden rounded-xl border-2 border-gold/30 bg-mystic-dark flex flex-col items-center justify-center ${emTabuleiro ? 'p-2 sm:p-4' : 'p-6'} shadow-2xl transition-all group-hover:border-gold/60 ${isRevealed ? 'pointer-events-none' : ''}`}>
                              <div className="w-full h-full border border-gold/10 rounded-lg flex items-center justify-center bg-[radial-gradient(circle_at_center,rgba(197,160,89,0.05)_0%,transparent_70%)]">
                                <Sun className={emTabuleiro ? 'w-1/3 h-1/3 text-gold/20' : 'w-12 h-12 text-gold/20'} />
                              </div>
                              <div className={`absolute text-[8px] text-suave uppercase ${emTabuleiro ? 'bottom-1.5 tracking-[0.1em]' : 'bottom-4 tracking-[0.3em]'}`}>Posição {cardIdx + 1}</div>
                            </div>

                            {/* Card Front */}
                            <div className="absolute inset-0 backface-hidden rounded-xl border-2 border-gold bg-mystic-paper/5 flex flex-col items-center justify-center p-4 text-center shadow-2xl overflow-hidden rotate-y-180">
                              <img
                                src={arteDaCarta(deck.baralho, card)}
                                alt={card}
                                loading="lazy"
                                width={600}
                                height={900}
                                className="absolute inset-0 w-full h-full object-cover"
                              />
                              {/* Antes a arte vinha a 50% sob um véu quase opaco, porque era
                                  foto genérica de banco de imagens e não aguentava ser vista.
                                  Agora é arte autoral: opacidade cheia e véu mínimo.
                                  O véu ficou fraco de propósito — cada arte traz o próprio
                                  nome gravado no rodapé, e escurecer aquela faixa apagaria
                                  justamente o que a artista desenhou para ser lido. */}
                              <div className="absolute inset-0 bg-gradient-to-t from-mystic-dark/30 via-transparent to-transparent" />
                              {/* A legibilidade deste nome mora na classe
                                  .nome-da-carta, em index.css, e nao em
                                  utilitario solto aqui: o tratamento e um so
                                  para os tres baralhos e as tres modalidades.
                                  O que fica no Tailwind e tipografia — fonte,
                                  tamanho, cor, caixa, espacamento. */}
                              <span className="serif text-xs text-gold-texto uppercase tracking-widest font-bold leading-tight relative z-10 px-2 nome-da-carta">{card}</span>
                            </div>
                          </motion.div>
                          {/* O nome da casa vem da definição da tiragem, não de
                              um ternário aqui. O número continua existindo, no
                              title, para quem usa leitor de tela e para quando
                              alguém precisar conferir contra o diagnóstico. */}
                          <span
                            className={`text-[10px] uppercase text-suave font-medium ${
                              emTabuleiro
                                ? // Nome longo como "Manifestacao Tendencial" quebra em duas
                                  // linhas em vez de estourar a celula ou ser cortado.
                                  'tracking-[0.1em] leading-tight text-center w-full [overflow-wrap:anywhere]'
                                : 'tracking-[0.3em]'
                            }`}
                            title={`Posição ${cardIdx + 1} — ${casaDaTiragem(readingMode, cardIdx)?.nome ?? ''}`}
                          >
                            {rotuloDaCasa(readingMode, cardIdx) ?? `Posição ${cardIdx + 1}`}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            {/* Reading Content */}
            {messages.filter(m => m.role === 'assistant').map((msg, idx) => (
              <div key={idx} className="glass-panel p-12 md:p-20 shadow-2xl relative overflow-hidden group">
                <div className="absolute top-0 left-0 w-full h-1 bg-gold/30" />
                
                {/* Action Buttons */}
                <div className="absolute top-8 right-8 flex gap-4">
                  <button
                    onClick={() => handleNarrate(msg.content, idx)}
                    className={`min-w-11 min-h-11 flex items-center justify-center rounded-full transition-all ${isNarrating === idx ? 'bg-gold text-sobre-ouro' : 'bg-panel-bg text-suave hover:text-gold-texto hover:bg-panel-border'}`}
                    title="Ouvir a Profecia"
                  >
                    {isNarrating === idx ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <Volume2 className="w-5 h-5" />
                    )}
                  </button>
                  <button
                    onClick={() => handleGenerateImage(msg.content, idx)}
                    disabled={isGeneratingImage === idx || !!msg.generatedImage}
                    className={`min-w-11 min-h-11 flex items-center justify-center rounded-full transition-all ${isGeneratingImage === idx ? 'bg-gold text-sobre-ouro' : msg.generatedImage ? 'bg-gold/20 text-gold-texto cursor-default' : 'bg-panel-bg text-suave hover:text-gold-texto hover:bg-panel-border'}`}
                    title="Materializar Imagem"
                  >
                    {isGeneratingImage === idx ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <ImageIcon className="w-5 h-5" />
                    )}
                  </button>
                </div>

                <div className="markdown-body prose-invert prose-gold max-w-none">
                  <ReactMarkdown>{msg.content}</ReactMarkdown>
                </div>

                {msg.generatedImage && (
                  <motion.div 
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="mt-16 rounded-2xl overflow-hidden border border-panel-border shadow-2xl"
                  >
                    <img 
                      src={msg.generatedImage} 
                      alt="Frequência Vibracional" 
                      className="w-full h-auto object-cover"
                      referrerPolicy="no-referrer"
                    />
                    <div className="bg-mystic-dark/80 p-4 text-center">
                      <p className="text-[10px] uppercase tracking-[0.3em] text-suave font-bold">Frequência Vibracional Materializada</p>
                    </div>
                  </motion.div>
                )}

                <div className="mt-20 pt-12 border-t border-white/5 flex flex-col items-center gap-8">
                  <div className="text-center space-y-2">
                    <p className="text-[10px] uppercase tracking-[0.4em] text-suave">Diagnóstico Concluído</p>
                    <h3 className="serif text-xl text-gold-texto italic">O campo foi revelado. Como você deseja prosseguir?</h3>
                  </div>
                  
                  <div className="flex flex-wrap justify-center gap-4">
                    <button
                      onClick={handleNewReading}
                      className="flex items-center gap-3 px-10 py-4 rounded-full bg-gold/10 border border-gold/20 text-gold-texto uppercase tracking-[0.3em] text-xs font-bold hover:bg-gold hover:text-sobre-ouro transition-all"
                    >
                      <RotateCcw className="w-4 h-4" />
                      Nova Consulta
                    </button>
                    
                    <button
                      onClick={handleSaveDiagnosis}
                      className="flex items-center gap-3 px-10 py-4 rounded-full bg-panel-bg border border-panel-border text-suave uppercase tracking-[0.3em] text-xs font-bold hover:bg-panel-border transition-all"
                    >
                      <Plus className="w-4 h-4" />
                      Salvar Diagnóstico
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </motion.div>
        )}
        {/* Regiao viva unica. Fora do fluxo visual, dentro do fluxo de leitura
            de quem usa leitor de tela. */}
        <p className="sr-only" role="status" aria-live="polite">
          {anuncio}
        </p>
      </main>

      <footer className="p-8 text-center">
        <p className="text-[9px] uppercase tracking-[0.4em] opacity-20">
          O destino é forjado no agora. Sincronicidade & Inteligência Artificial.
        </p>
      </footer>

      {/* Modals for Quick Actions */}
      <AnimatePresence>
        {showQuickAdvice && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-mystic-dark/90 backdrop-blur-md"
            onClick={() => setShowQuickAdvice(false)}
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="glass-panel p-8 max-w-sm w-full text-center space-y-6 border-gold/30"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex justify-center">
                <div className="w-16 h-16 rounded-full bg-gold/10 flex items-center justify-center border border-gold/20">
                  <Zap className="w-8 h-8 text-gold-texto animate-pulse" />
                </div>
              </div>
              <div className="space-y-2">
                <h3 className="serif text-2xl text-gold-texto uppercase tracking-tighter">Sincronicidade Instantânea</h3>
                <p className="text-[10px] uppercase tracking-[0.3em] text-suave">O conselho do agora</p>
              </div>
              
              {isGeneratingQuickAdvice ? (
                <div className="py-12 flex flex-col items-center gap-4">
                  <Loader2 className="w-8 h-8 text-gold-texto animate-spin" />
                  <p className="text-xs text-suave italic animate-pulse">Sintonizando frequências...</p>
                </div>
              ) : quickAdvice ? (
                <div className="space-y-6 py-4">
                  <div className="inline-block px-4 py-2 rounded-lg bg-gold/5 border border-gold/10">
                    <span className="serif text-lg text-gold-texto italic">{quickAdvice.card}</span>
                  </div>
                  <p className="text-mystic-paper/80 leading-relaxed italic text-lg">
                    "{quickAdvice.advice}"
                  </p>
                </div>
              ) : null}

              <button 
                onClick={() => setShowQuickAdvice(false)}
                className="w-full py-3 rounded-full bg-gold/10 border border-gold/20 text-gold-texto uppercase tracking-[0.2em] text-[10px] font-bold hover:bg-gold hover:text-sobre-ouro transition-all"
              >
                Gratidão
              </button>
            </motion.div>
          </motion.div>
        )}

        {showIntentionGuide && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-mystic-dark/90 backdrop-blur-md"
            onClick={() => setShowIntentionGuide(false)}
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="glass-panel p-8 max-w-md w-full space-y-6 border-gold/30"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center gap-4 border-b border-gold/10 pb-4">
                <Compass className="w-6 h-6 text-gold-texto" />
                <h3 className="serif text-xl text-gold-texto uppercase tracking-tight">Guia de Intenção</h3>
              </div>
              
              <div className="space-y-4 text-sm text-mystic-paper/70 leading-relaxed">
                <p>Para que o Oráculo revele a verdade, sua pergunta deve ser como uma flecha: direta e focada.</p>
                <ul className="space-y-3">
                  <li className="flex gap-3">
                    <span className="text-gold-texto font-bold">01.</span>
                    <span>Evite perguntas de "Sim" ou "Não". O Oráculo prefere mostrar caminhos e energias.</span>
                  </li>
                  <li className="flex gap-3">
                    <span className="text-gold-texto font-bold">02.</span>
                    <span>Em vez de "Vou conseguir o emprego?", tente "Qual energia devo cultivar para atrair esta oportunidade?".</span>
                  </li>
                  <li className="flex gap-3">
                    <span className="text-gold-texto font-bold">03.</span>
                    <span>Respire fundo e visualize sua situação antes de escolher as cartas. A intenção é a chave.</span>
                  </li>
                </ul>
              </div>

              <button 
                onClick={() => setShowIntentionGuide(false)}
                className="w-full py-3 rounded-full bg-gold/10 border border-gold/20 text-gold-texto uppercase tracking-[0.2em] text-[10px] font-bold hover:bg-gold hover:text-sobre-ouro transition-all"
              >
                Compreendo
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Energy Clearing Ripple Effect */}
      <AnimatePresence>
        {isClearing && (
          <motion.div 
            initial={{ opacity: 0, scale: 0 }}
            animate={{ opacity: 1, scale: 4 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1, ease: "easeOut" }}
            className="fixed inset-0 z-[200] pointer-events-none flex items-center justify-center"
          >
            <div className="w-64 h-64 rounded-full border-4 border-gold/30 blur-sm" />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
