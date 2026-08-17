// =====================================================================
// VoiceSession — DESATIVADO, aguardando a fase 2
// =====================================================================
// Este componente NÃO é importado pelo App.tsx e não entra no bundle.
// Ele está preservado aqui, inteiro, porque a sessão de voz volta assim
// que existir emissão de token efêmero pelo oraculo-api.
//
// Por que ele não pode simplesmente voltar como está:
//   ai.live.connect abre WebSocket direto do navegador para o Google e
//   exige uma credencial no cliente. Reativar sem token efêmero seria
//   voltar a pedir a chave do Gemini para quem consulta, que é
//   exatamente o problema que esta refatoração eliminou.
//
// Para reativar, na fase 2:
//   1. criar POST /api/oraculo/token-voz no serviço, emitindo token
//      efêmero via ai.authTokens.create
//   2. trocar o parâmetro userApiKey por esse token de curta duração
//   3. renomear este arquivo para VoiceSession.tsx e importar no App
//   4. devolver o card "Sessão por Voz" na landing
//
// Desativado em 16/08/2026.
// =====================================================================

import { useState, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import { GoogleGenAI, Modality } from "@google/genai";
import { Mic, MicOff, ChevronLeft, Loader2 } from "lucide-react";

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
