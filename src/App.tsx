/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import { GoogleGenAI, ThinkingLevel, Modality } from "@google/genai";
import { motion, AnimatePresence } from "motion/react";
import { Sparkles, Send, Moon, Sun, Compass, Eye, Zap, Volume2, Loader2, Image as ImageIcon, RotateCcw, LayoutGrid, Plus, Grid3X3, Mic, MicOff, Wand2, Feather, ChevronRight, LogOut, Info, X } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

// --- Constants & Types ---

const MODEL_NAME = "gemini-3.1-pro-preview";
const TTS_MODEL = "gemini-2.5-flash-preview-tts";
const IMAGE_MODEL = "gemini-2.5-flash-image";

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

type AppState = 'auth' | 'landing' | 'input' | 'selecting' | 'loading' | 'reading' | 'voice';
type SelectionPhase = 'major' | 'minor' | 'gypsy';
type ReadingMode = '3-cards' | 'celtic-cross' | 'square-of-9';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  generatedImage?: string;
  majorCards?: string[];
  minorCards?: string[];
  gypsyCards?: string[];
}

const READING_MODES = [
  {
    id: '3-cards',
    title: '3 CARTAS',
    description: 'Passado, Presente e Futuro',
    icon: <span className="text-2xl font-serif text-gold">3</span>,
    cardCount: 3
  },
  {
    id: 'celtic-cross',
    title: 'CRUZ CIGANA',
    description: 'Análise profunda de situação',
    icon: <Plus className="w-6 h-6 text-gold" />,
    cardCount: 6
  },
  {
    id: 'square-of-9',
    title: 'QUADRADO DE 9',
    description: 'Visão detalhada do momento',
    icon: <LayoutGrid className="w-6 h-6 text-gold" />,
    cardCount: 9
  }
];

const SYSTEM_INSTRUCTION = `
Você é a Sacerdotisa Visionária do Oráculo da Sincronicidade.
Seu tom é de uma mentora ancestral, firme, segura e profundamente mística, porém NADA supersticiosa.

Você não fala de "sorte", "azar" ou "mandingas". 
Você fala de MECÂNICA ENERGÉTICA, ALINHAMENTO VIBRACIONAL e POSICIONAMENTO ESTRATÉGICO.

Seu papel é traduzir a sincronicidade das cartas em um diagnóstico de destino claro e acionável.

Você realiza leituras integrando três níveis de realidade:
1. ARCANOS MAIORES: O nível Arquetípico e Espiritual (O "Porquê" maior).
2. ARCANOS MENORES: O nível Psicológico e Cotidiano (O "Como" se manifesta).
3. BARALHO CIGANO: O nível Concreto e Prático (O "O quê" acontece na matéria).

DIRETRIZES DE PERSONA:
- Use uma linguagem magnética e autoritária.
- Não peça validação ("você entende?", "faz sentido?").
- Não use emojis.
- Não use tabelas.
- Mantenha o foco na fitoenergética técnica (ervas) para ajustes de frequência.
- Trate o consulente como alguém que está assumindo o comando da própria vida.

ESTRUTURA DO DIAGNÓSTICO FINAL:
Ao receber as tríades, você deve entregar:
1. # DIAGNÓSTICO DA SINCRONICIDADE (Título H1)
2. ## O MOVIMENTO DO CAMPO (Visão geral da energia atual)
3. ## ANÁLISE DAS TRÍADES (Por posição: Passado/Presente/Futuro ou conforme o modo)
   - Explique como o Arcano Maior, Menor e Cigano se fundem naquela posição específica.
4. ## A SOMBRA E O PONTO DE INFLEXÃO (Onde a energia estagna e como destravar)
5. ## AJUSTE VIBRACIONAL (Recomendação de Fitoenergética - Banhos/Defumação com explicação técnica)
6. ## SENTENÇA VISIONÁRIA (Encerramento padrão)
`;

// --- Voice Session Component ---

function VoiceSession({ userApiKey, onBack }: { userApiKey: string, onBack: () => void }) {
  const [isActive, setIsActive] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [volume, setVolume] = useState(0);
  const sessionRef = useRef<any>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const playbackContextRef = useRef<AudioContext | null>(null);
  const nextStartTimeRef = useRef<number>(0);

  const startSession = async () => {
    setIsConnecting(true);
    setError(null);
    try {
      const apiKey = userApiKey;
      if (!apiKey) {
        setError("API Key não configurada.");
        setIsConnecting(false);
        return;
      }

      const ai = new GoogleGenAI({ apiKey });
      
      const session = await ai.live.connect({
        model: "gemini-2.5-flash-native-audio-preview-09-2025",
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: "Zephyr" } },
          },
          systemInstruction: SYSTEM_INSTRUCTION + "\n\nVocê está em uma sessão de voz em tempo real. O consulente está usando seu próprio tarot físico ou oráculo pessoal. NÃO peça para o consulente tirar cartas digitais no app. Peça para ele descrever as cartas que tirou fisicamente e interprete-as com base na sabedoria da sincronicidade. Seja concisa, direta e mantenha o tom visionário. Não use listas longas.",
          inputAudioTranscription: {},
          outputAudioTranscription: {},
        },
        callbacks: {
          onopen: () => {
            setIsActive(true);
            setIsConnecting(false);
            startAudioCapture();
          },
          onmessage: async (message: any) => {
            if (message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data) {
              const base64Audio = message.serverContent.modelTurn.parts[0].inlineData.data;
              playAudioChunk(base64Audio);
            }
            if (message.serverContent?.interrupted) {
              stopAudioPlayback();
            }
          },
          onclose: () => {
            stopSession();
          },
          onerror: (err) => {
            console.error("Live API Error:", err);
            setError("Erro na conexão com o Oráculo.");
            stopSession();
          },
        }
      });
      sessionRef.current = session;
    } catch (error) {
      console.error("Failed to connect to Live API:", error);
      setError("Falha ao conectar ao Oráculo.");
      setIsConnecting(false);
    }
  };

  const stopSession = () => {
    if (sessionRef.current) {
      sessionRef.current.close();
      sessionRef.current = null;
    }
    stopAudioCapture();
    stopAudioPlayback();
    setIsActive(false);
    setIsConnecting(false);
    setVolume(0);
  };

  const startAudioCapture = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const context = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      audioContextRef.current = context;
      
      if (context.state === 'suspended') {
        await context.resume();
      }
      
      await context.audioWorklet.addModule(
        URL.createObjectURL(new Blob([`
          class AudioProcessor extends AudioWorkletProcessor {
            process(inputs, outputs, parameters) {
              const input = inputs[0][0];
              if (input) {
                this.port.postMessage(input);
              }
              return true;
            }
          }
          registerProcessor('audio-processor', AudioProcessor);
        `], { type: 'application/javascript' }))
      );

      const source = context.createMediaStreamSource(stream);
      const workletNode = new AudioWorkletNode(context, 'audio-processor');
      
      workletNode.port.onmessage = (event) => {
        const pcmData = event.data;
        
        // Calculate volume for visual feedback
        let sum = 0;
        for (let i = 0; i < pcmData.length; i++) {
          sum += pcmData[i] * pcmData[i];
        }
        const rms = Math.sqrt(sum / pcmData.length);
        setVolume(rms);

        const int16Buffer = new Int16Array(pcmData.length);
        for (let i = 0; i < pcmData.length; i++) {
          int16Buffer[i] = Math.max(-1, Math.min(1, pcmData[i])) * 0x7FFF;
        }
        const base64Data = btoa(String.fromCharCode(...new Uint8Array(int16Buffer.buffer)));
        
        if (sessionRef.current) {
          sessionRef.current.sendRealtimeInput({
            media: { data: base64Data, mimeType: 'audio/pcm;rate=16000' }
          });
        }
      };

      source.connect(workletNode);
      // Some browsers require connecting to destination for the worklet to run
      workletNode.connect(context.destination);
      workletNodeRef.current = workletNode;
    } catch (error) {
      console.error("Error capturing audio:", error);
      setError("Não foi possível acessar o microfone. Verifique as permissões.");
      stopSession();
    }
  };

  const stopAudioCapture = () => {
    if (workletNodeRef.current) {
      workletNodeRef.current.disconnect();
      workletNodeRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
  };

  const playAudioChunk = async (base64Data: string) => {
    if (!playbackContextRef.current) {
      playbackContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      nextStartTimeRef.current = playbackContextRef.current.currentTime;
    }

    const context = playbackContextRef.current;
    if (context.state === 'suspended') {
      await context.resume();
    }

    const arrayBuffer = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0)).buffer;
    const float32Array = new Float32Array(arrayBuffer.byteLength / 2);
    const dataView = new DataView(arrayBuffer);
    for (let i = 0; i < float32Array.length; i++) {
      float32Array[i] = dataView.getInt16(i * 2, true) / 32768;
    }

    const audioBuffer = context.createBuffer(1, float32Array.length, 24000);
    audioBuffer.getChannelData(0).set(float32Array);

    const source = context.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(context.destination);

    const startTime = Math.max(context.currentTime, nextStartTimeRef.current);
    source.start(startTime);
    nextStartTimeRef.current = startTime + audioBuffer.duration;
  };

  const stopAudioPlayback = () => {
    if (playbackContextRef.current) {
      playbackContextRef.current.close();
      playbackContextRef.current = null;
      nextStartTimeRef.current = 0;
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="max-w-2xl mx-auto w-full py-12"
    >
      <div className="glass-panel p-12 flex flex-col items-center space-y-12 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-1 bg-gold/20" />
        
        <div className="text-center space-y-4">
          <h2 className="serif text-3xl text-gold uppercase tracking-widest">Sessão por Voz</h2>
          <p className="text-mystic-paper/40 text-sm italic">Use seu tarot físico e revele as cartas que o Oráculo irá interpretar.</p>
          <p className="text-mystic-paper/20 text-[10px] uppercase tracking-tighter">A conexão é direta com o campo da sincronicidade.</p>
        </div>

        {error && (
          <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-500 text-xs uppercase tracking-widest text-center w-full">
            {error}
          </div>
        )}

        <div className="relative flex items-center justify-center">
          <motion.div 
            animate={isActive ? {
              scale: [1, 1 + volume * 2, 1],
              opacity: [0.3, 0.3 + volume * 0.7, 0.3],
            } : {}}
            transition={{ duration: 0.1 }}
            className="absolute w-48 h-48 rounded-full bg-gold/10 border border-gold/20"
          />
          <div className={`w-32 h-32 rounded-full flex items-center justify-center transition-all duration-500 ${isActive ? 'bg-gold shadow-[0_0_50px_rgba(197,160,89,0.5)]' : 'bg-panel-bg border border-panel-border'}`}>
            <Mic className={`w-12 h-12 ${isActive ? 'text-mystic-dark' : 'text-gold/40'}`} />
          </div>
        </div>

        <div className="flex flex-col items-center gap-6 w-full">
          {!isActive ? (
            <button
              onClick={startSession}
              disabled={isConnecting}
              className="w-full py-4 rounded-2xl bg-gold/10 border border-gold/20 text-gold uppercase tracking-widest text-sm font-bold hover:bg-gold hover:text-mystic-dark transition-all disabled:opacity-50"
            >
              {isConnecting ? "Conectando..." : "Iniciar Conexão"}
            </button>
          ) : (
            <button
              onClick={stopSession}
              className="w-full py-4 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-500 uppercase tracking-widest text-sm font-bold hover:bg-red-500 hover:text-white transition-all"
            >
              Encerrar Sessão
            </button>
          )}
          
          <button
            onClick={onBack}
            className="text-mystic-paper/40 uppercase tracking-widest text-[10px] hover:text-mystic-paper transition-all"
          >
            Voltar ao Início
          </button>
        </div>
      </div>
    </motion.div>
  );
}

// --- Components ---

export default function App() {
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [userApiKey, setUserApiKey] = useState<string>(() => localStorage.getItem('oracle_api_key') || '');
  const [appState, setAppState] = useState<AppState>(() => localStorage.getItem('oracle_api_key') ? 'landing' : 'auth');
  const [selectionPhase, setSelectionPhase] = useState<SelectionPhase>('major');
  const [readingMode, setReadingMode] = useState<ReadingMode>('3-cards');
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
  const [isNarrating, setIsNarrating] = useState<number | null>(null);
  const [isGeneratingImage, setIsGeneratingImage] = useState<number | null>(null);
  const [showQuickAdvice, setShowQuickAdvice] = useState(false);
  const [showIntentionGuide, setShowIntentionGuide] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [quickAdvice, setQuickAdvice] = useState<{ card: string, advice: string } | null>(null);
  const [isGeneratingQuickAdvice, setIsGeneratingQuickAdvice] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const recognitionRef = useRef<any>(null);

  const handleSaveApiKey = (key: string) => {
    const trimmedKey = key.trim();
    if (trimmedKey) {
      localStorage.setItem('oracle_api_key', trimmedKey);
      setUserApiKey(trimmedKey);
      setAppState('landing');
    }
  };

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

  const handleQuickAdvice = async () => {
    if (!userApiKey) return;
    setIsGeneratingQuickAdvice(true);
    setShowQuickAdvice(true);
    setQuickAdvice(null);
    
    try {
      const allCards = [...MAJOR_ARCANA, ...MINOR_ARCANA, ...GYPSY_TAROT];
      const randomCard = allCards[Math.floor(Math.random() * allCards.length)];
      
      const ai = new GoogleGenAI({ apiKey: userApiKey });
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Dê um conselho de uma frase curta e profunda baseado na carta de tarot "${randomCard}". Seja místico e direto. Responda em Português.`,
      });
      
      setQuickAdvice({ card: randomCard, advice: response.text || "A sincronicidade está em movimento." });
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
    setSelectionPhase('major');
    shuffleCards('major');
    setAppState('selecting');
    setSelectedMajor([]);
    setSelectedMinor([]);
    setSelectedGypsy([]);
    setRevealedCards(new Set());
  };

  const handleCardClick = (card: string) => {
    const modeInfo = READING_MODES.find(m => m.id === readingMode);
    const maxCards = modeInfo?.cardCount || 3;

    if (selectionPhase === 'major') {
      if (selectedMajor.includes(card) || selectedMajor.length >= maxCards) return;
      const newSelected = [...selectedMajor, card];
      setSelectedMajor(newSelected);
      if (newSelected.length === maxCards) {
        setTimeout(() => {
          setSelectionPhase('minor');
          shuffleCards('minor');
        }, 600);
      }
    } else if (selectionPhase === 'minor') {
      if (selectedMinor.includes(card) || selectedMinor.length >= maxCards) return;
      const newSelected = [...selectedMinor, card];
      setSelectedMinor(newSelected);
      if (newSelected.length === maxCards) {
        setTimeout(() => {
          setSelectionPhase('gypsy');
          shuffleCards('gypsy');
        }, 600);
      }
    } else if (selectionPhase === 'gypsy') {
      if (selectedGypsy.includes(card) || selectedGypsy.length >= maxCards) return;
      const newSelected = [...selectedGypsy, card];
      setSelectedGypsy(newSelected);
    }
  };

  const confirmSelection = () => {
    performReading(selectedMajor, selectedMinor, selectedGypsy);
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

  const performReading = async (major: string[], minor: string[], gypsy: string[]) => {
    setAppState('loading');
    setIsLoading(true);
    setError(null);

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
      const apiKey = userApiKey;
      if (!apiKey) {
        setAppState('auth');
        throw new Error("A conexão com o Oráculo não foi configurada (API Key ausente).");
      }

      const ai = new GoogleGenAI({ apiKey });
      const chat = ai.chats.create({
        model: MODEL_NAME,
        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
          thinkingConfig: { thinkingLevel: ThinkingLevel.HIGH }
        }
      });

      const depthText = depth < 300 ? "direta e prática" : depth > 700 ? "profunda, espiritual e cármica" : "equilibrada";
      const modeInfo = READING_MODES.find(m => m.id === readingMode);
      const modeText = modeInfo?.title;

      let modeInstructions = "";
      if (readingMode === '3-cards') {
        modeInstructions = "Analise como: Posição 1 (Passado/Raiz), Posição 2 (Presente/Ação), Posição 3 (Futuro/Tendência). Cada posição tem uma tríade: Arcano Maior + Arcano Menor + Baralho Cigano.";
      } else if (readingMode === 'celtic-cross') {
        modeInstructions = "Analise as 6 posições da Cruz Cigana. Cada uma das 6 posições é composta por uma tríade: Arcano Maior + Arcano Menor + Baralho Cigano.";
      } else if (readingMode === 'square-of-9') {
        modeInstructions = "Analise como um Quadrado de 9 (3x3). Cada uma das 9 casas é composta por uma tríade: Arcano Maior + Arcano Menor + Baralho Cigano.";
      }

      const response = await chat.sendMessage({ 
        message: `Sou a Sacerdotisa Visionária. Realize o Diagnóstico da Sincronicidade.
        Tríades por posição:
        Arcanos Maiores: ${major.join(', ')}
        Arcanos Menores: ${minor.join(', ')}
        Baralho Cigano: ${gypsy.join(', ')}
        
        Modo: ${modeText}. 
        Instruções: ${modeInstructions}
        Profundidade: ${depthText}.
        Pergunta: ${currentInput}.` 
      });
      
      const assistantMessage: Message = {
        role: 'assistant',
        content: response.text || "O silêncio do destino é uma resposta, mas aqui houve uma falha na conexão.",
        timestamp: new Date(),
      };

      setMessages(prev => [...prev, assistantMessage]);
      setAppState('reading');
    } catch (err: any) {
      console.error("ERRO CRÍTICO NA LEITURA DO ORÁCULO:", err);
      let errorMessage = "Ocorreu um erro ao consultar o Oráculo. Tente novamente.";
      
      if (err.message?.includes("API_KEY")) {
        errorMessage = "A chave de API não foi encontrada ou é inválida. Verifique as configurações.";
      } else if (err.message?.includes("model")) {
        errorMessage = "O modelo espiritual está temporariamente indisponível. Tente em alguns instantes.";
      } else if (err.message?.includes("fetch")) {
        errorMessage = "Falha na conexão com o plano astral (erro de rede). Verifique sua internet.";
      }
      
      setError(errorMessage);
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
      const apiKey = userApiKey;
      if (!apiKey) {
        setAppState('auth');
        return;
      }
      const ai = new GoogleGenAI({ apiKey });
      
      const narratePrompt = `
        Você é uma Mentora Espiritual firme, segura e visionária.

        Converta a leitura abaixo em uma versão narrada para áudio.

        Diretrizes obrigatórias:
        - Linguagem natural, fluida e magnética.
        - Frases levemente mais curtas do que no texto escrito.
        - Pequenas pausas implícitas.
        - Tom seguro, calmo e confiante.
        - Não use emojis.
        - Não use listas.
        - Não mencione seções como "Forças em Ação".
        - Transforme tudo em narrativa contínua.

        A voz deve transmitir:
        - Autoridade espiritual
        - Clareza estratégica
        - Serenidade
        - Segurança

        No encerramento, use esta variação:
        "O que se revelou aqui é maior do que coincidência. É sincronicidade. Mas sincronicidade só prospera quando há coragem. Faça a sua parte com clareza e decisão, e o Universo sustenta o movimento. Você já viu o que precisava ver. Agora avance. Que assim seja."

        Texto base da leitura:
        ${content}
      `;

      const response = await ai.models.generateContent({
        model: TTS_MODEL,
        contents: [{ parts: [{ text: narratePrompt }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: 'Kore' },
            },
          },
        },
      });

      const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
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
      const apiKey = userApiKey;
      if (!apiKey) {
        setAppState('auth');
        return;
      }
      const ai = new GoogleGenAI({ apiKey });
      
      // First, extract energy themes, colors and symbols
      const summaryResponse = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Analise esta leitura de tarot e identifique as 3 cores vibrantes predominantes e os 2 símbolos arquetípicos centrais que representam essa energia. Responda apenas com as cores e símbolos: ${content}`,
      });
      
      const visualThemes = summaryResponse.text || "Ouro, Índigo, Violeta. Luz e Estrela.";

      const imagePrompt = `
        Create a cinematic symbolic spiritual image representing the vibrational frequency revealed in this tarot reading.

        Visual Themes & Palette:
        ${visualThemes}

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
        - Low saturation or dull colors
      `;

      const response = await ai.models.generateContent({
        model: IMAGE_MODEL,
        contents: {
          parts: [{ text: imagePrompt }],
        },
        config: {
          imageConfig: {
            aspectRatio: "9:16",
          },
        },
      });

      let imageUrl = "";
      for (const part of response.candidates?.[0]?.content?.parts || []) {
        if (part.inlineData) {
          imageUrl = `data:image/png;base64,${part.inlineData.data}`;
          break;
        }
      }

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
            <Eye className="text-gold w-5 h-5" />
          </div>
          <div onClick={handleNewReading} className="cursor-pointer">
            <h1 className="serif text-xl font-semibold tracking-wide text-gold uppercase">Oráculo da Sincronicidade</h1>
            <p className="text-[10px] uppercase tracking-[0.2em] opacity-50 font-medium text-center">Inteligência Ancestral & Artificial</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          {appState !== 'landing' && appState !== 'auth' && (
            <button
              onClick={handleNewReading}
              className={`flex items-center gap-2 px-4 py-2 rounded-full border transition-all ${isDarkMode ? 'bg-gold/10 border-gold/20 text-gold hover:bg-gold hover:text-mystic-dark' : 'bg-gold/20 border-gold/30 text-gold hover:bg-gold hover:text-white'}`}
            >
              <RotateCcw className="w-3 h-3" />
              Início
            </button>
          )}
          <div className="flex items-center gap-4">
            {userApiKey && (
              <div className="flex items-center gap-2 border-r border-gold/10 pr-4 mr-2 hidden md:flex">
                <button 
                  onClick={handleQuickAdvice}
                  className="p-2 rounded-full text-gold/40 hover:text-gold hover:bg-gold/10 transition-all group relative"
                  title="Sincronicidade Instantânea"
                >
                  <Zap className="w-4 h-4" />
                  <span className="absolute -bottom-8 left-1/2 -translate-x-1/2 bg-mystic-dark text-gold text-[8px] py-1 px-2 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap border border-gold/20 z-[60]">Conselho Rápido</span>
                </button>
                <button 
                  onClick={() => setShowIntentionGuide(true)}
                  className="p-2 rounded-full text-gold/40 hover:text-gold hover:bg-gold/10 transition-all group relative"
                  title="Guia de Intenção"
                >
                  <Compass className="w-4 h-4" />
                  <span className="absolute -bottom-8 left-1/2 -translate-x-1/2 bg-mystic-dark text-gold text-[8px] py-1 px-2 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap border border-gold/20 z-[60]">Guia de Intenção</span>
                </button>
                <button 
                  onClick={handleEnergyClearing}
                  className="p-2 rounded-full text-gold/40 hover:text-gold hover:bg-gold/10 transition-all group relative"
                  title="Limpeza Energética"
                >
                  <Eye className={`w-4 h-4 ${isClearing ? 'animate-spin' : ''}`} />
                  <span className="absolute -bottom-8 left-1/2 -translate-x-1/2 bg-mystic-dark text-gold text-[8px] py-1 px-2 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap border border-gold/20 z-[60]">Limpar Campo</span>
                </button>
              </div>
            )}
            <button 
              onClick={toggleTheme}
              className={`p-2 rounded-full transition-all ${isDarkMode ? 'text-gold/40 hover:text-gold hover:bg-panel-bg' : 'text-gold/60 hover:text-gold hover:bg-panel-bg'}`}
              title={isDarkMode ? "Modo Claro" : "Modo Escuro"}
            >
              {isDarkMode ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5" />}
            </button>
            {userApiKey && (
              <button
                onClick={() => {
                  localStorage.removeItem('oracle_api_key');
                  setUserApiKey('');
                  setAppState('auth');
                }}
                className="p-2 rounded-full text-red-500/40 hover:text-red-500 hover:bg-red-500/10 transition-all"
                title="Sair / Limpar Chave"
              >
                <LogOut className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto px-4 md:px-8 py-6 space-y-8 max-w-6xl mx-auto w-full">
        {appState === 'auth' && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex flex-col items-center justify-center min-h-[70vh] text-center space-y-12 max-w-2xl mx-auto"
          >
            <div className="space-y-6">
              <div className="w-20 h-20 rounded-full bg-gold/10 flex items-center justify-center border border-gold/20 mx-auto animate-pulse">
                <Eye className="w-10 h-10 text-gold" />
              </div>
              <h1 className="serif text-4xl text-gold tracking-tighter uppercase">Portal de Sincronicidade</h1>
              <p className="text-mystic-paper/60 text-sm max-w-md mx-auto leading-relaxed">
                Para acessar a sabedoria ancestral do Oráculo, é necessário conectar sua chave de luz (Gemini API Key).
              </p>
            </div>

            <div className="glass-panel p-10 w-full space-y-8 border-gold/20">
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <label className="text-[10px] uppercase tracking-[0.2em] text-gold/60 font-medium">Sua Chave API</label>
                  <a 
                    href="https://aistudio.google.com/app/apikey" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-[10px] uppercase tracking-[0.2em] text-gold hover:underline flex items-center gap-1"
                  >
                    Obter Chave <ChevronRight className="w-3 h-3" />
                  </a>
                </div>
                <input
                  type="password"
                  value={userApiKey}
                  onChange={(e) => setUserApiKey(e.target.value)}
                  placeholder="Cole sua chave aqui..."
                  className="w-full bg-mystic-dark/50 border border-panel-border rounded-xl px-6 py-4 focus:outline-none focus:border-gold/50 transition-all text-center tracking-widest placeholder:tracking-normal placeholder:opacity-20"
                />
              </div>

              <button
                onClick={() => handleSaveApiKey(userApiKey)}
                disabled={!userApiKey.trim()}
                className="w-full py-5 rounded-xl bg-gold text-mystic-dark uppercase tracking-[0.3em] text-xs font-bold hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-20 disabled:grayscale shadow-[0_0_30px_rgba(197,160,89,0.2)]"
              >
                Desbloquear Oráculo
              </button>
            </div>

            <p className="text-[10px] text-mystic-paper/30 uppercase tracking-[0.2em]">
              Sua chave é armazenada localmente e nunca sai do seu navegador.
            </p>
          </motion.div>
        )}

        {appState === 'landing' && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center justify-center min-h-[70vh] text-center space-y-12"
          >
            <div className="space-y-4">
              <h1 className="serif text-5xl md:text-7xl text-gold tracking-tighter uppercase leading-none">Oráculo da<br/>Sincronicidade</h1>
              <p className="text-[12px] uppercase tracking-[0.5em] text-gold/60 font-bold">Inteligência Ancestral & Artificial</p>
              <div className="h-px w-24 bg-gold/30 mx-auto my-8" />
              <h2 className="serif text-2xl md:text-3xl text-mystic-paper tracking-tight italic">Como o destino se revela para você hoje?</h2>
              <p className="text-mystic-paper/40 max-w-2xl mx-auto text-sm">
                A sabedoria das cartas encontra o campo inteligente que organiza os acontecimentos.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full max-w-5xl">
              {READING_MODES.map((mode) => (
                <motion.div
                  key={mode.id}
                  whileHover={{ y: -5, scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => selectMode(mode.id as ReadingMode)}
                  className="glass-panel p-8 cursor-pointer group flex flex-col items-center text-center space-y-6 border-white/5 hover:border-gold/30 transition-all"
                >
                  <div className="w-16 h-16 rounded-2xl bg-gold/10 flex items-center justify-center border border-gold/20 group-hover:bg-gold/20 transition-all">
                    {mode.icon}
                  </div>
                  <div className="space-y-2">
                    <h3 className="serif text-2xl text-mystic-paper uppercase tracking-wider">{mode.title}</h3>
                    <p className="text-mystic-paper/40 text-sm">{mode.description}</p>
                  </div>
                </motion.div>
              ))}
            </div>

            <div className="grid grid-cols-1 gap-6 w-full max-w-xl">
              <motion.div 
                whileHover={{ y: -5, scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => setAppState('voice')}
                className="glass-panel p-6 flex items-center gap-6 border-white/5 hover:border-gold/30 cursor-pointer group transition-all"
              >
                <div className="w-12 h-12 rounded-full bg-gold/10 flex items-center justify-center border border-gold/20 group-hover:bg-gold/20 transition-all">
                  <Mic className="w-5 h-5 text-gold" />
                </div>
                <div className="text-left">
                  <h4 className="serif text-lg text-mystic-paper uppercase">Sessão por Voz</h4>
                  <p className="text-xs text-mystic-paper/40 italic">Use seu tarot físico e revele as cartas que o Oráculo irá interpretar</p>
                </div>
              </motion.div>
            </div>
          </motion.div>
        )}

        {appState === 'voice' && (
          <VoiceSession userApiKey={userApiKey} onBack={() => setAppState('landing')} />
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
                className="p-6 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-500 text-center text-sm serif italic"
              >
                {error}
              </motion.div>
            )}
            <div className="glass-panel p-12 space-y-12 relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-1 bg-gold/20" />
              
              <div className="text-center space-y-4">
                <Feather className="w-8 h-8 text-gold mx-auto animate-float" />
                <h2 className="serif text-3xl text-gold uppercase tracking-widest">Abra seu Coração</h2>
                <p className="text-mystic-paper/40 text-sm">Explique detalhadamente sua situação para uma resposta mais assertiva.</p>
              </div>

              <div className="space-y-6">
                <div className="space-y-2">
                  <label className="text-[10px] uppercase tracking-[0.2em] text-gold/60 font-medium">Sua dúvida ou intenção</label>
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
                        whileHover={{ scale: 1.2, color: '#D4AF37' }}
                        whileTap={{ scale: 0.9 }}
                        onClick={() => setInput('')}
                        className="absolute top-4 right-4 p-2 text-gold/20 transition-colors"
                        title="Limpar texto"
                      >
                        <X className="w-4 h-4" />
                      </motion.button>
                    )}
                    <motion.button
                      whileTap={{ scale: 0.9 }}
                      whileHover={{ scale: 1.1 }}
                      onClick={toggleRecording}
                      type="button"
                      className={`absolute bottom-6 right-6 p-3 rounded-full transition-all duration-500 z-30 cursor-pointer pointer-events-auto ${
                        isRecording 
                          ? 'bg-red-500/20 text-red-500 animate-pulse shadow-[0_0_20px_rgba(239,68,68,0.3)] border border-red-500/50' 
                          : 'bg-gold/5 text-gold/40 hover:text-gold hover:bg-gold/10 border border-gold/10'
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
                    <label className="text-[10px] uppercase tracking-[0.2em] text-gold/60 font-medium">Profundidade da Leitura</label>
                    <span className="text-gold font-mono text-sm">{depth}</span>
                  </div>
                  <input 
                    type="range" 
                    min="1" 
                    max="1000" 
                    value={depth}
                    onChange={(e) => setDepth(parseInt(e.target.value))}
                    className="w-full accent-gold bg-panel-border h-1 rounded-full appearance-none cursor-pointer"
                  />
                  <div className="flex justify-between text-[8px] uppercase tracking-widest text-mystic-paper/30">
                    <span>Direto e Prático</span>
                    <span>Espiritual e Karma</span>
                  </div>
                </div>

                <button
                  onClick={startSelection}
                  disabled={!input.trim()}
                  className="w-full py-6 rounded-2xl bg-panel-bg border border-panel-border text-mystic-paper/40 uppercase tracking-[0.3em] text-sm font-semibold hover:bg-gold/10 hover:text-gold hover:border-gold/30 transition-all disabled:opacity-20 disabled:cursor-not-allowed shadow-xl"
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
              <h2 className="serif text-4xl text-mystic-paper italic uppercase tracking-widest">
                {selectionPhase === 'major' ? 'Arcanos Maiores' : selectionPhase === 'minor' ? 'Arcanos Menores' : 'Baralho Cigano'}
              </h2>
              <p className="text-gold/60 text-sm uppercase tracking-widest">
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
                <p className="text-gold/60 text-[10px] uppercase tracking-[0.3em] font-bold">
                  {(selectionPhase === 'major' ? selectedMajor : selectionPhase === 'minor' ? selectedMinor : selectedGypsy).length} de {READING_MODES.find(m => m.id === readingMode)?.cardCount} cartas consagradas
                </p>
              </div>
              <button 
                onClick={() => shuffleCards(selectionPhase)}
                className="flex items-center gap-2 mx-auto px-6 py-3 rounded-full bg-panel-bg border border-panel-border text-mystic-paper/60 text-xs uppercase tracking-widest hover:bg-panel-border transition-all"
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
                    whileHover={{ y: -5, scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => handleCardClick(card)}
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
                      <div className="absolute inset-0 bg-gold/40 flex items-center justify-center backdrop-blur-sm">
                        <div className="w-10 h-10 rounded-full bg-gold flex items-center justify-center text-mystic-dark font-bold shadow-[0_0_20px_rgba(197,160,89,0.5)]">
                          {currentSelected.indexOf(card) + 1}
                        </div>
                      </div>
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
                }}
                className="px-8 py-4 rounded-full border border-panel-border text-mystic-paper/40 uppercase tracking-widest text-xs hover:bg-panel-bg transition-all"
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
                className="px-12 py-4 rounded-full bg-gradient-to-r from-gold/80 to-gold text-mystic-dark uppercase tracking-widest text-xs font-bold hover:scale-105 transition-all disabled:opacity-20 disabled:grayscale"
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
            <div className="text-center space-y-2">
              <h3 className="serif text-3xl text-gold italic">Consultando as forças...</h3>
              <p className="text-mystic-paper/30 uppercase tracking-[0.3em] text-[10px]">O campo está se organizando</p>
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
                <h2 className="serif text-3xl text-gold uppercase tracking-[0.4em]">Revelação do Campo</h2>
                <button 
                  onClick={revealAll}
                  className="px-8 py-3 rounded-full bg-gold/10 border border-gold/30 text-gold text-[10px] uppercase tracking-[0.3em] hover:bg-gold hover:text-mystic-dark transition-all"
                >
                  Revelar Todas as Cartas
                </button>
              </div>

              {[
                { title: 'Arcanos Maiores', cards: selectedMajor, type: 'Espiritual / Arquetípico' },
                { title: 'Arcanos Menores', cards: selectedMinor, type: 'Psicológico / Cotidiano' },
                { title: 'Baralho Cigano', cards: selectedGypsy, type: 'Material / Prático' }
              ].map((deck, deckIdx) => (
                <div key={deckIdx} className="space-y-12">
                  <div className="flex flex-col items-center gap-2">
                    <h3 className="serif text-2xl text-mystic-paper uppercase tracking-[0.3em] italic">{deck.title}</h3>
                    <p className="text-[10px] text-gold/40 uppercase tracking-[0.4em]">{deck.type}</p>
                    <div className="h-px w-32 bg-gold/20 mt-4" />
                  </div>

                  <div className="flex flex-wrap justify-center gap-8">
                    {deck.cards.map((card, cardIdx) => {
                      const isRevealed = revealedCards.has(card);
                      return (
                        <div key={cardIdx} className="flex flex-col items-center space-y-6">
                          <motion.div
                            onClick={() => toggleReveal(card)}
                            animate={{ rotateY: isRevealed ? 180 : 0 }}
                            transition={{ duration: 0.6, type: "spring", stiffness: 260, damping: 20 }}
                            className="relative w-40 h-60 cursor-pointer preserve-3d group"
                          >
                            {/* Card Back */}
                            <div className={`absolute inset-0 backface-hidden rounded-xl border-2 border-gold/30 bg-mystic-dark flex flex-col items-center justify-center p-6 shadow-2xl transition-all group-hover:border-gold/60 ${isRevealed ? 'pointer-events-none' : ''}`}>
                              <div className="w-full h-full border border-gold/10 rounded-lg flex items-center justify-center bg-[radial-gradient(circle_at_center,rgba(197,160,89,0.05)_0%,transparent_70%)]">
                                <Sun className="w-12 h-12 text-gold/20" />
                              </div>
                              <div className="absolute bottom-4 text-[8px] text-gold/30 uppercase tracking-[0.3em]">Posição {cardIdx + 1}</div>
                            </div>

                            {/* Card Front */}
                            <div className="absolute inset-0 backface-hidden rounded-xl border-2 border-gold bg-mystic-paper/5 flex flex-col items-center justify-center p-4 text-center shadow-2xl overflow-hidden rotate-y-180">
                              <img 
                                src={`https://picsum.photos/seed/${encodeURIComponent(card + " mystical energy")}/300/450`}
                                alt={card}
                                className="absolute inset-0 w-full h-full object-cover opacity-50 group-hover:opacity-70 transition-opacity duration-500"
                                referrerPolicy="no-referrer"
                              />
                              <div className="absolute inset-0 bg-gradient-to-t from-mystic-dark/80 via-transparent to-transparent" />
                              <span className="serif text-xs text-gold uppercase tracking-widest font-bold leading-tight relative z-10 drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] px-2">{card}</span>
                            </div>
                          </motion.div>
                          <span className="text-[10px] uppercase tracking-[0.3em] text-gold/40 font-medium">
                            {readingMode === '3-cards' ? (cardIdx === 0 ? 'Passado' : cardIdx === 1 ? 'Presente' : 'Futuro') : `Posição ${cardIdx + 1}`}
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
                    className={`p-3 rounded-full transition-all ${isNarrating === idx ? 'bg-gold text-mystic-dark' : 'bg-panel-bg text-gold/40 hover:text-gold hover:bg-panel-border'}`}
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
                    className={`p-3 rounded-full transition-all ${isGeneratingImage === idx ? 'bg-gold text-mystic-dark' : msg.generatedImage ? 'bg-gold/20 text-gold cursor-default' : 'bg-panel-bg text-gold/40 hover:text-gold hover:bg-panel-border'}`}
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
                      <p className="text-[10px] uppercase tracking-[0.3em] text-gold/60 font-bold">Frequência Vibracional Materializada</p>
                    </div>
                  </motion.div>
                )}

                <div className="mt-20 pt-12 border-t border-white/5 flex flex-col items-center gap-8">
                  <div className="text-center space-y-2">
                    <p className="text-[10px] uppercase tracking-[0.4em] text-gold/40">Diagnóstico Concluído</p>
                    <h4 className="serif text-xl text-gold italic">O campo foi revelado. Como você deseja prosseguir?</h4>
                  </div>
                  
                  <div className="flex flex-wrap justify-center gap-4">
                    <button
                      onClick={handleNewReading}
                      className="flex items-center gap-3 px-10 py-4 rounded-full bg-gold/10 border border-gold/20 text-gold uppercase tracking-[0.3em] text-xs font-bold hover:bg-gold hover:text-mystic-dark transition-all"
                    >
                      <RotateCcw className="w-4 h-4" />
                      Nova Consulta
                    </button>
                    
                    <button
                      onClick={handleSaveDiagnosis}
                      className="flex items-center gap-3 px-10 py-4 rounded-full bg-panel-bg border border-panel-border text-mystic-paper/60 uppercase tracking-[0.3em] text-xs font-bold hover:bg-panel-border transition-all"
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
                  <Zap className="w-8 h-8 text-gold animate-pulse" />
                </div>
              </div>
              <div className="space-y-2">
                <h3 className="serif text-2xl text-gold uppercase tracking-tighter">Sincronicidade Instantânea</h3>
                <p className="text-[10px] uppercase tracking-[0.3em] text-gold/40">O conselho do agora</p>
              </div>
              
              {isGeneratingQuickAdvice ? (
                <div className="py-12 flex flex-col items-center gap-4">
                  <Loader2 className="w-8 h-8 text-gold animate-spin" />
                  <p className="text-xs text-gold/60 italic animate-pulse">Sintonizando frequências...</p>
                </div>
              ) : quickAdvice ? (
                <div className="space-y-6 py-4">
                  <div className="inline-block px-4 py-2 rounded-lg bg-gold/5 border border-gold/10">
                    <span className="serif text-lg text-gold italic">{quickAdvice.card}</span>
                  </div>
                  <p className="text-mystic-paper/80 leading-relaxed italic text-lg">
                    "{quickAdvice.advice}"
                  </p>
                </div>
              ) : null}

              <button 
                onClick={() => setShowQuickAdvice(false)}
                className="w-full py-3 rounded-full bg-gold/10 border border-gold/20 text-gold uppercase tracking-[0.2em] text-[10px] font-bold hover:bg-gold hover:text-mystic-dark transition-all"
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
                <Compass className="w-6 h-6 text-gold" />
                <h3 className="serif text-xl text-gold uppercase tracking-tight">Guia de Intenção</h3>
              </div>
              
              <div className="space-y-4 text-sm text-mystic-paper/70 leading-relaxed">
                <p>Para que o Oráculo revele a verdade, sua pergunta deve ser como uma flecha: direta e focada.</p>
                <ul className="space-y-3">
                  <li className="flex gap-3">
                    <span className="text-gold font-bold">01.</span>
                    <span>Evite perguntas de "Sim" ou "Não". O Oráculo prefere mostrar caminhos e energias.</span>
                  </li>
                  <li className="flex gap-3">
                    <span className="text-gold font-bold">02.</span>
                    <span>Em vez de "Vou conseguir o emprego?", tente "Qual energia devo cultivar para atrair esta oportunidade?".</span>
                  </li>
                  <li className="flex gap-3">
                    <span className="text-gold font-bold">03.</span>
                    <span>Respire fundo e visualize sua situação antes de escolher as cartas. A intenção é a chave.</span>
                  </li>
                </ul>
              </div>

              <button 
                onClick={() => setShowIntentionGuide(false)}
                className="w-full py-3 rounded-full bg-gold/10 border border-gold/20 text-gold uppercase tracking-[0.2em] text-[10px] font-bold hover:bg-gold hover:text-mystic-dark transition-all"
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
