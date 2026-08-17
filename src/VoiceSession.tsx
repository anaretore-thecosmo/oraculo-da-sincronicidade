// =====================================================================
// VoiceSession — sessão de voz ao vivo com o Oráculo
// =====================================================================
// Reativado em 16/08/2026, agora com token efêmero.
//
// Por que não dá para usar proxy aqui:
//   ai.live.connect abre WebSocket bidirecional direto do navegador para
//   o Google. Áudio em tempo real nos dois sentidos. Um intermediário só
//   adicionaria atraso e mais um ponto de falha.
//
// Como fica seguro mesmo assim:
//   O navegador nunca vê a chave da casa. Ele pede um TOKEN EFÊMERO ao
//   servidor (/api/oraculo/token-voz), que vale para uma única sessão,
//   expira em 30 minutos e só serve para o modelo de voz. O prompt da
//   Sacerdotisa fica travado dentro do token, no servidor: não trafega
//   pelo front e não é editável por quem estiver do outro lado.
//
//   É a diferença entre emprestar a chave da casa e abrir a porta.
// =====================================================================

import { useState, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import { GoogleGenAI } from "@google/genai";
import { Mic, MicOff, ChevronLeft, Loader2 } from "lucide-react";

// A instrução da Sacerdotisa não vive mais aqui: ela é injetada pelo
// servidor dentro do token efêmero, e por isso não aparece no bundle.

// --- Voice Session Component ---

function VoiceSession({ onBack, onCreditos }: { onBack: () => void, onCreditos?: (restantes: number) => void }) {
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
      // Pede a chave da porta ao servidor. Ela abre uma sessão só.
      const r = await fetch('/api/oraculo/token-voz', { method: 'POST' });
      const dados = await r.json();

      if (r.status === 402) {
        setError('Suas leituras gratuitas se completaram.');
        setIsConnecting(false);
        return;
      }
      if (!r.ok || !dados.token) {
        setError(dados.erro || 'A sessão de voz não pôde ser aberta agora.');
        setIsConnecting(false);
        return;
      }
      if (typeof dados.creditosRestantes === 'number') onCreditos?.(dados.creditosRestantes);

      // O token entra no lugar da chave. v1alpha é exigido pela Live API.
      const ai = new GoogleGenAI({
        apiKey: dados.token,
        httpOptions: { apiVersion: 'v1alpha' },
      });

      const session = await ai.live.connect({
        model: dados.modelo,
        // Sem config aqui de propósito: modalidade, voz e instrução já vêm
        // travadas dentro do token, definidas no servidor.
        config: {
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

export default VoiceSession;
