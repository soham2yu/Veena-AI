"use client";

import React, { useState, useRef, useEffect, Suspense } from 'react';
import { useAudioAnalyzer } from '@/hooks/useAudioAnalyzer';
import { useAIEvents } from '@/hooks/useAIEvents';
import { useVoiceSession } from '@/hooks/useVoiceSession';
import dynamic from 'next/dynamic';
import IntelligenceDashboard from '@/components/IntelligenceDashboard';
import ParticleTextOverlay from '@/components/ParticleTextOverlay';
import AIChatbox from '@/components/AIChatbox';
import { Square, Pause, Play, Users, LogOut, User, Activity, GitBranch, X, LoaderCircle, ArrowUpRight } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import AuthModal from '@/components/AuthModal';
import Link from 'next/link';

const OrbScene = dynamic(() => import('@/components/ParticleOrb/OrbScene'), { ssr: false });

function HomeContent() {
  const searchParams = useSearchParams();
  const urlId = searchParams.get('id');
  
  const [appPhase, setAppPhase] = useState<'LANDING' | 'DASHBOARD'>('LANDING');
  const [activeIncidentId, setActiveIncidentId] = useState<string | null>(urlId);
  const [roomState, setRoomState] = useState<'IDLE' | 'LISTENING' | 'PAUSED'>('IDLE');
  const audioRef = useRef<HTMLAudioElement | null>(null);
  
  const [enableTextIllusion, setEnableTextIllusion] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [showParticipants, setShowParticipants] = useState(false);
  const [isAudioExpanded, setIsAudioExpanded] = useState(false);
  const [audioSearch, setAudioSearch] = useState('');
  const { user, loading, logout } = useAuth();
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [hasJoined, setHasJoined] = useState(false);
  const [isTextVisible, setIsTextVisible] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [isConnectingRepo, setIsConnectingRepo] = useState(false);
  const [projectConnectionMessage, setProjectConnectionMessage] = useState<string | null>(null);
  const [showProjectModal, setShowProjectModal] = useState(false);
  const [githubUrl, setGithubUrl] = useState('');
  const [projectUrlError, setProjectUrlError] = useState<string | null>(null);

  // Auto-join logic if URL ID is present
  useEffect(() => {
    if (urlId && !loading) {
      if (!user) {
        setShowAuthModal(true);
      } else if (!hasJoined) {
        setHasJoined(true);
        setAppPhase('DASHBOARD');
        setRoomState('LISTENING');
        // Silent join intercept
        fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000'}/api/analyze`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            incident_id: urlId,
            transcript: [{
              speaker: user.displayName || user.email?.split('@')[0] || "Operator",
              timestamp: new Date().toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" }),
              text: "joined the session"
            }]
          })
        }).catch(() => {});
      }
    }
  }, [urlId, user, loading, hasJoined]);

  // Auth enforcement for anything other than LANDING
  useEffect(() => {
    if (!loading && !user && appPhase !== 'LANDING') {
      setShowAuthModal(true);
    }
  }, [user, loading, appPhase]);

  useEffect(() => {
    if (activeIncidentId && typeof window !== 'undefined') {
      setIsAdmin(localStorage.getItem(`admin_for_${activeIncidentId}`) === 'true');
    }
  }, [activeIncidentId]);
  
  // Visual audio bouncing
  const { amplitude } = useAudioAnalyzer(roomState === 'LISTENING');
  
  // Voice Session for STT
  const { isListening, interimText } = useVoiceSession({
    isActive: roomState === 'LISTENING',
    onInterimResult: () => {
      // Barge-in: interrupt VAANI if she is speaking
      if (audioRef.current && !audioRef.current.paused) {
        audioRef.current.pause();
      }
    },
    onSentenceComplete: async (text) => {
      if (!activeIncidentId || !user) return;
      
      const entry = {
        speaker: user.displayName || user.email?.split('@')[0] || "Operator",
        timestamp: new Date().toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" }),
        text
      };

      setIsThinking(true);
      try {
        const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000'}/api/analyze`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            incident_id: activeIncidentId,
            transcript: [entry] 
          })
        });
        if (!response.ok) {
          let detail = '';
          try {
            const errorBody = await response.json();
            detail = typeof errorBody.detail === 'string' ? errorBody.detail : '';
          } catch {
            // The API may return a platform-generated HTML error page.
          }
          throw new Error(detail || `AI analysis failed (${response.status}).`);
        }
      } catch (e) {
        console.error("Failed to send transcript", e);
      } finally {
        setIsThinking(false);
      }
    }
  });

  // Connect to the FastAPI backend using the selected incident ID
  const { state: aiData } = useAIEvents(activeIncidentId || '', roomState !== 'IDLE');
  
  // Derived state for Orb
  const orbState = roomState === 'IDLE' ? 0 : (roomState === 'PAUSED' ? 3 : 2);

  const uiRef = useRef<HTMLDivElement>(null);

  const handleToggleParticleText = async () => {
    if (!activeIncidentId) return;
    const newVal = !(aiData?.is_particle_text_enabled ?? enableTextIllusion);
    setEnableTextIllusion(newVal); // optimistic
    try {
      await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000'}/api/incidents/${activeIncidentId}/settings`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_particle_text_enabled: newVal })
      });
    } catch (e) {
      console.error(e);
    }
  };

  const togglePause = () => {
    if (roomState === 'LISTENING') setRoomState('PAUSED');
    else setRoomState('LISTENING');
  };

  const stopSession = () => {
    setRoomState('IDLE');
    window.location.href = '/'; 
  };

  const connectProject = async () => {
    if (isConnectingRepo || !activeIncidentId || !user) return;
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(githubUrl.trim());
    } catch {
      setProjectUrlError('Enter a complete GitHub URL, such as https://github.com/owner/repo.');
      return;
    }
    const repoParts = parsedUrl.pathname.split('/').filter(Boolean);
    if (parsedUrl.protocol !== 'https:' || parsedUrl.hostname !== 'github.com' || repoParts.length !== 2) {
      setProjectUrlError('Use a public repository URL in the format https://github.com/owner/repo.');
      return;
    }

    setProjectUrlError(null);
    setIsConnectingRepo(true);
    setProjectConnectionMessage('Scanning repository...');
    try {
      const configuredBackendUrl = process.env.NEXT_PUBLIC_BACKEND_URL?.trim();
      const backendUrl = (configuredBackendUrl || 'http://localhost:8000').replace(/\/+$/, '');
      const isLocalBackend = /^(https?:\/\/)?(localhost|127\.0\.0\.1)(:\d+)?$/i.test(backendUrl);
      if (typeof window !== 'undefined' && !['localhost', '127.0.0.1'].includes(window.location.hostname) && isLocalBackend) {
        throw new Error('The deployed frontend is missing NEXT_PUBLIC_BACKEND_URL. Set it to the public FastAPI URL and redeploy.');
      }
      const res = await fetch(`${backendUrl}/api/github/connect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repo_url: parsedUrl.toString(), incident_id: activeIncidentId })
      });
      if (!res.ok) {
        let detail = '';
        try {
          const errorBody = await res.json();
          detail = typeof errorBody.detail === 'string' ? errorBody.detail : '';
        } catch {
          // The API may return a platform-generated HTML/404 response.
        }
        if (res.status === 404) {
          throw new Error('The deployed backend does not expose the GitHub connector yet. Redeploy the backend and try again.');
        }
        throw new Error(detail || `GitHub connection failed (${res.status}).`);
      }
      setProjectConnectionMessage('Repository connected. VAANI is scanning the project context.');
      setShowProjectModal(false);
      const analyzeResponse = await fetch(`${backendUrl}/api/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          incident_id: activeIncidentId,
          transcript: [{
            speaker: user.displayName || user.email?.split('@')[0] || "Operator",
            timestamp: new Date().toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" }),
            text: `VAANI, I just connected my GitHub project at ${parsedUrl.toString()}. Scan it and tell me what you find.`
          }]
        })
      });
      if (!analyzeResponse.ok) {
        let detail = '';
        try {
          const errorBody = await analyzeResponse.json();
          detail = typeof errorBody.detail === 'string' ? errorBody.detail : '';
        } catch {
          // The API may return a platform-generated HTML error page.
        }
        throw new Error(detail || `AI analysis failed (${analyzeResponse.status}).`);
      }
    } catch (e) {
      setProjectConnectionMessage(e instanceof Error ? e.message : 'Unable to connect to the GitHub service.');
    } finally {
      setIsConnectingRepo(false);
    }
  };

  const filteredTranscript = aiData?.transcript?.filter(t => t.text !== 'joined the session' && t.text !== 'left the session') || [];
  const latestTranscriptText = filteredTranscript.length > 0
    ? filteredTranscript[filteredTranscript.length - 1].text
    : "";

  const [displayText, setDisplayText] = useState("");
  const [showParticleText, setShowParticleText] = useState(true);
  const [activeTextSource, setActiveTextSource] = useState<'NONE' | 'USER' | 'AI'>('NONE');
  const isNormalEnabled = aiData?.is_particle_text_enabled ?? enableTextIllusion;

  // Update displayed text when transcript changes
  useEffect(() => {
    if (latestTranscriptText && isNormalEnabled) {
      setDisplayText(latestTranscriptText);
      setActiveTextSource('USER');
    }
  }, [latestTranscriptText, isNormalEnabled]);

  const lastPlayedResponseRef = useRef<string | null>(null);

  // Handle AI Response Text-To-Speech and Display
  useEffect(() => {
    if (aiData?.ai_response && aiData.ai_response !== lastPlayedResponseRef.current) {
      setIsThinking(false);
      lastPlayedResponseRef.current = aiData.ai_response;
      
      if (audioRef.current && !audioRef.current.paused) {
         audioRef.current.pause();
      }
      const audio = new Audio(`${process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000'}/api/tts?text=${encodeURIComponent(aiData.ai_response)}`);
      audioRef.current = audio;
      let subtitleInterval: NodeJS.Timeout | undefined;

      let animationFrameId: number;

      // Synchronize Particle Text using full sentences to allow particles to assemble
      if (showParticleText) {
        // Split by punctuation to create sentence chunks, fallback to whole text if no punctuation
        const sentences = aiData.ai_response.match(/[^.!?]+[.!?]+/g) || [aiData.ai_response];
        const totalChars = aiData.ai_response.length;
        
        let lastSentence = "";

        const syncSubtitles = () => {
          if (audio.duration) {
            const progress = audio.currentTime / audio.duration;
            const targetCharCount = progress * totalChars;
            
            // Find which sentence we are currently speaking based on character progression
            let charAccumulator = 0;
            let currentSentence = sentences[0];
            for (const sentence of sentences) {
              charAccumulator += sentence.length;
              if (targetCharCount <= charAccumulator) {
                currentSentence = sentence;
                break;
              }
            }
            
            // Only update state if the sentence changed to prevent React re-renders
            if (currentSentence !== lastSentence) {
              lastSentence = currentSentence;
              setDisplayText(currentSentence.trim());
              setActiveTextSource('AI');
            }
          }
          
          if (!audio.paused && !audio.ended) {
            animationFrameId = requestAnimationFrame(syncSubtitles);
          }
        };

        audio.onplay = () => {
          animationFrameId = requestAnimationFrame(syncSubtitles);
        };
        
        audio.onended = () => {
          setTimeout(() => setDisplayText(""), 2000);
        };
      }

      audio.play().catch(e => console.error("Audio playback failed", e));

      return () => {
        if (subtitleInterval) clearInterval(subtitleInterval);
        if (animationFrameId) cancelAnimationFrame(animationFrameId);
        if (audioRef.current === audio) {
          audio.pause();
        }
      };
    }
  }, [aiData?.ai_response, showParticleText]);

  return (
    <main className="relative w-screen h-screen overflow-hidden bg-black font-sans selection:bg-white selection:text-black">
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes slideUp {
          0% { transform: translateY(100%); }
          100% { transform: translateY(0); }
        }
        @keyframes fadeIn {
          0% { opacity: 0; }
          100% { opacity: 1; }
        }
        .animate-slide-up {
          animation: slideUp 1.2s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        .animate-fade-in {
          animation: fadeIn 1.5s cubic-bezier(0.16, 1, 0.3, 1) forwards;
          opacity: 0;
        }
      `}} />

      {/* 3D Canvas Layer */}
      <div className="absolute inset-0 z-0 pointer-events-none">
        <OrbScene audioAmplitude={amplitude} aiState={orbState} isTextVisible={isTextVisible} />
      </div>

      {/* Particle Text Overlay — solid readable text with particle illusion */}
      {appPhase === 'DASHBOARD' && (
        <ParticleTextOverlay
          text={displayText}
          enabled={
            (isNormalEnabled && activeTextSource === 'USER') || 
            (showParticleText && activeTextSource === 'AI')
          }
          onVisibilityChange={setIsTextVisible}
        />
      )}

      {appPhase === 'LANDING' && (
        <div className="absolute inset-0 z-10 overflow-y-auto custom-scroll pointer-events-auto scroll-smooth">
          
          {/* SECTION 1: HERO */}
          <div className="min-h-screen w-full flex flex-col relative z-10">
            
            <div className="absolute top-1/2 left-1/4 -translate-x-1/4 -translate-y-1/2 w-[800px] h-[6000px] bg-black/30 blur-[120px] rounded-full pointer-events-none z-0" />

            {/* Navigation */}
            <nav className="w-full flex justify-between items-center p-8 md:px-16 animate-fade-in relative z-10" style={{animationDelay: '0.5s'}}>
              <div className="text-white text-xs font-bold tracking-[0.3em] flex items-center gap-4">
                <div className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
                VAANI
              </div>
              <div className="flex items-center gap-12 text-white/50 text-[10px] font-medium tracking-[0.2em] uppercase hidden md:flex">
                <a href="#features" className="hover:text-white transition-colors">Features</a>
                <a href="#voice" className="hover:text-white transition-colors">Voice AI</a>
                {user ? (
                  <button onClick={logout} className="hover:text-white transition-colors flex items-center gap-2">
                    <LogOut className="w-3 h-3" /> Logout
                  </button>
                ) : (
                  <button onClick={() => setShowAuthModal(true)} className="hover:text-white transition-colors flex items-center gap-2">
                    <User className="w-3 h-3" /> Login
                  </button>
                )}
              </div>
            </nav>

            {/* Hero Content */}
            <div className="flex-1 flex flex-col justify-center px-8 md:px-16 lg:px-24 relative z-10">
              <div className="text-blue-400 text-[10px] tracking-[0.4em] uppercase font-bold mb-6 animate-fade-in" style={{animationDelay: '0.1s'}}>
                Agentic Voice AI for Engineering Teams
              </div>
              <h1 className="text-white font-black leading-[0.85] tracking-[-0.04em] uppercase" style={{ fontSize: 'clamp(3.5rem, 12vw, 9rem)' }}>
                <div className="overflow-hidden pb-3"><div className="animate-slide-up" style={{animationDelay: '0.15s'}}>VAANI</div></div>
                <div className="overflow-hidden pb-3"><div className="animate-slide-up text-white/80" style={{animationDelay: '0.25s', fontSize: 'clamp(1.5rem, 4vw, 3.5rem)'}}>She listens. She thinks.</div></div>
                <div className="overflow-hidden pb-3"><div className="animate-slide-up text-blue-400/90" style={{animationDelay: '0.35s', fontSize: 'clamp(1.5rem, 4vw, 3.5rem)'}}>She speaks only when it matters<span className="text-white">.</span></div></div>
              </h1>
              <p className="text-white/50 max-w-xl mt-8 text-sm md:text-base leading-relaxed tracking-wide animate-fade-in" style={{animationDelay: '0.6s'}}>
                An autonomous AI engineer that joins your war rooms, silently analyzes chaotic conversations, detects flaws in real-time, and speaks up only when your team is about to make a critical mistake.
              </p>
              
              <div className="flex items-center gap-4 mt-12 animate-fade-in" style={{animationDelay: '0.9s'}}>
                <a 
                  href="/dashboard"
                  className="inline-block group relative overflow-hidden bg-white text-black font-bold uppercase tracking-[0.2em] text-[10px] px-10 py-4 rounded-full hover:scale-105 transition-all duration-500"
                >
                  <span className="relative z-10">Launch War Room</span>
                  <div className="absolute inset-0 h-full w-0 bg-blue-500 transition-all duration-500 ease-out group-hover:w-full z-0"></div>
                </a>
                <a 
                  href="#features"
                  className="inline-block text-white/50 hover:text-white font-bold uppercase tracking-[0.2em] text-[10px] px-6 py-4 border border-white/20 rounded-full hover:border-white/50 transition-all duration-300"
                >
                  Learn More
                </a>
              </div>
            </div>
            
            {/* Stats Bar */}
            <div className="flex items-center justify-between px-8 md:px-16 pb-10 animate-fade-in z-10" style={{animationDelay: '1.2s'}}>
              <div className="flex items-center gap-12">
                <div>
                  <div className="text-white text-2xl font-black tracking-tight">{'<'}200ms</div>
                  <div className="text-white/30 text-[9px] tracking-[0.2em] uppercase mt-1">Barge-in Latency</div>
                </div>
                <div className="w-px h-8 bg-white/10" />
                <div>
                  <div className="text-white text-2xl font-black tracking-tight">Rime AI</div>
                  <div className="text-white/30 text-[9px] tracking-[0.2em] uppercase mt-1">Neural TTS Engine</div>
                </div>
                <div className="w-px h-8 bg-white/10 hidden md:block" />
                <div className="hidden md:block">
                  <div className="text-white text-2xl font-black tracking-tight">Full Duplex</div>
                  <div className="text-white/30 text-[9px] tracking-[0.2em] uppercase mt-1">Listen + Speak + Think</div>
                </div>
              </div>
              <div className="flex flex-col items-center gap-2">
                <div className="text-white/30 text-[8px] tracking-[0.3em] uppercase rotate-90 origin-right mb-6">Scroll</div>
                <div className="w-px h-12 bg-gradient-to-b from-white/30 to-transparent"></div>
              </div>
            </div>
          </div>

          {/* SECTION 2: CAPABILITIES */}
          <div id="features" className="min-h-screen w-full flex items-center px-8 md:px-16 lg:px-24 py-24 relative">
            <div className="w-full max-w-7xl mx-auto">
              <h2 className="text-white/30 font-mono text-xs tracking-[0.3em] uppercase mb-4 flex items-center gap-3">
                <span className="w-8 h-px bg-white/30"></span> Core Capabilities
              </h2>
              <h3 className="text-white text-4xl md:text-6xl font-bold tracking-tight mb-16">
                Not a chatbot.<br/><span className="text-blue-400">An autonomous engineer.</span>
              </h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {/* Card 1 */}
                <div className="group bg-white/[0.03] backdrop-blur-xl border border-white/10 rounded-2xl p-8 hover:border-green-500/40 hover:bg-green-500/[0.03] transition-all duration-500">
                  <div className="w-10 h-10 rounded-xl bg-green-500/10 border border-green-500/30 flex items-center justify-center mb-6">
                    <span className="text-green-400 text-lg">✓</span>
                  </div>
                  <h4 className="text-white text-lg font-semibold mb-3 tracking-wide">Smart Silence</h4>
                  <p className="text-white/40 text-sm leading-relaxed">VAANI stays silent 95% of the time. She only speaks when you call her name, or when she detects a critical flaw in your approach.</p>
                </div>

                {/* Card 2 */}
                <div className="group bg-white/[0.03] backdrop-blur-xl border border-white/10 rounded-2xl p-8 hover:border-red-500/40 hover:bg-red-500/[0.03] transition-all duration-500">
                  <div className="w-10 h-10 rounded-xl bg-red-500/10 border border-red-500/30 flex items-center justify-center mb-6">
                    <span className="text-red-400 text-lg">⚡</span>
                  </div>
                  <h4 className="text-white text-lg font-semibold mb-3 tracking-wide">Proactive Flaw Detection</h4>
                  <p className="text-white/40 text-sm leading-relaxed">If your team discusses a flawed architecture or misses a critical bug, VAANI autonomously interrupts to warn you before it ships.</p>
                </div>

                {/* Card 3 */}
                <div className="group bg-white/[0.03] backdrop-blur-xl border border-white/10 rounded-2xl p-8 hover:border-blue-500/40 hover:bg-blue-500/[0.03] transition-all duration-500">
                  <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/30 flex items-center justify-center mb-6">
                    <span className="text-blue-400 text-lg">🔊</span>
                  </div>
                  <h4 className="text-white text-lg font-semibold mb-3 tracking-wide">True Barge-In</h4>
                  <p className="text-white/40 text-sm leading-relaxed">Interrupt VAANI mid-sentence. She instantly stops, discards stale thoughts, and listens to your new instruction with zero latency.</p>
                </div>

                {/* Card 4 */}
                <div className="group bg-white/[0.03] backdrop-blur-xl border border-white/10 rounded-2xl p-8 hover:border-purple-500/40 hover:bg-purple-500/[0.03] transition-all duration-500">
                  <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/30 flex items-center justify-center mb-6">
                    <span className="text-purple-400 text-lg">🧠</span>
                  </div>
                  <h4 className="text-white text-lg font-semibold mb-3 tracking-wide">Room Vibe Detection</h4>
                  <p className="text-white/40 text-sm leading-relaxed">VAANI reads the emotional temperature of the room — Calm, Focused, Stressed, or Chaotic — and adapts her tone accordingly.</p>
                </div>

                {/* Card 5 */}
                <div className="group bg-white/[0.03] backdrop-blur-xl border border-white/10 rounded-2xl p-8 hover:border-cyan-500/40 hover:bg-cyan-500/[0.03] transition-all duration-500">
                  <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center mb-6">
                    <span className="text-cyan-400 text-lg">📁</span>
                  </div>
                  <h4 className="text-white text-lg font-semibold mb-3 tracking-wide">Project Connection</h4>
                  <p className="text-white/40 text-sm leading-relaxed">Connect your local codebase to VAANI. She scans your project for issues and brings context into the conversation automatically.</p>
                </div>

                {/* Card 6 */}
                <div className="group bg-white/[0.03] backdrop-blur-xl border border-white/10 rounded-2xl p-8 hover:border-amber-500/40 hover:bg-amber-500/[0.03] transition-all duration-500">
                  <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center mb-6">
                    <span className="text-amber-400 text-lg">🎯</span>
                  </div>
                  <h4 className="text-white text-lg font-semibold mb-3 tracking-wide">Semantic Segregation</h4>
                  <p className="text-white/40 text-sm leading-relaxed">10 engineers talking about 3 different topics? VAANI separates each thread independently, extracting facts, risks, and actions per topic.</p>
                </div>
              </div>
            </div>
          </div>

          {/* SECTION 3: VOICE AI CTA */}
          <div id="voice" className="min-h-[70vh] w-full flex items-center px-8 md:px-16 lg:px-24 py-24 relative">
            <div className="w-full max-w-7xl mx-auto flex flex-col items-center text-center">
              <div className="text-blue-400/60 text-[10px] tracking-[0.4em] uppercase font-bold mb-6">Powered by Rime AI &times; Gemini</div>
              <h3 className="text-white text-4xl md:text-7xl font-black tracking-tighter mb-6 max-w-4xl">
                Meet <span className="text-blue-500">VAANI.</span>
              </h3>
              <p className="text-white/50 text-sm md:text-base leading-relaxed max-w-2xl mx-auto mb-4">
                A 23-year-old brilliant AI engineer who sounds human, thinks like a senior architect, and knows exactly when to stay quiet.
              </p>
              <p className="text-white/30 text-xs md:text-sm leading-relaxed max-w-xl mx-auto mb-12">
                Say her name to summon her. Watch as her neural voice renders perfectly synced particle text across your screen.
              </p>
              
              <div className="flex items-center gap-4">
                <a 
                  href="/dashboard"
                  className="inline-block group relative overflow-hidden bg-blue-500 text-white font-bold uppercase tracking-[0.2em] text-[10px] px-14 py-5 rounded-full hover:scale-105 transition-all duration-500 shadow-[0_0_40px_rgba(59,130,246,0.3)]"
                >
                  <span className="relative z-10">Deploy to War Room</span>
                </a>
              </div>
              
              {/* Tech Stack */}
              <div className="mt-20 flex items-center gap-8 text-white/20 text-[9px] tracking-[0.3em] uppercase">
                <span>Next.js</span>
                <span className="w-1 h-1 bg-white/20 rounded-full" />
                <span>FastAPI</span>
                <span className="w-1 h-1 bg-white/20 rounded-full" />
                <span>Rime TTS</span>
                <span className="w-1 h-1 bg-white/20 rounded-full" />
                <span>Gemini</span>
                <span className="w-1 h-1 bg-white/20 rounded-full" />
                <span>Web Speech API</span>
              </div>
            </div>
          </div>

          {showAuthModal && <AuthModal onCancel={() => {
            setShowAuthModal(false);
            if (!user && appPhase !== 'LANDING') {
              setAppPhase('LANDING');
              setActiveIncidentId(null);
              window.history.pushState({}, '', '/');
            }
          }} />}
        </div>
      )}


      {/* DASHBOARD UI Layer */}
      {appPhase === 'DASHBOARD' && (
        <div ref={uiRef} className="absolute inset-0 z-10 pointer-events-none flex flex-col animate-fade-in" style={{animationDelay: '0s'}}>
          
          {/* Top Header */}
          <div className="w-full flex justify-between items-start p-8 md:px-12 pointer-events-auto">
            {/* Left Section */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-6">
                <div className="text-white text-xs font-bold tracking-[0.3em] flex items-center gap-4">
                  <div className="w-1.5 h-1.5 bg-white rounded-full" />
                  VAANI {activeIncidentId && <span className="text-white/50"> {'//'} {activeIncidentId}</span>}
                </div>
              </div>
            </div>
            
            {/* Right Section */}
            <div className="flex items-center gap-6">
              {user ? (
                <>
                  <Link 
                    href="/dashboard"
                    className="flex items-center gap-2 text-white/50 hover:text-white transition-colors"
                  >
                    <Activity className="w-4 h-4" />
                    <span className="text-[10px] uppercase tracking-widest font-bold">Dashboard</span>
                  </Link>
                  <span className="text-white/30 text-[10px] tracking-widest uppercase">|</span>
                  <span className="text-white/50 text-[10px] tracking-widest uppercase">
                    {user.email?.split('@')[0]}
                  </span>
                  <button 
                    onClick={logout}
                    className="flex items-center gap-2 text-white/50 hover:text-white transition-colors"
                  >
                    <LogOut className="w-4 h-4" />
                    <span className="text-[10px] uppercase tracking-widest font-bold">Logout</span>
                  </button>
                </>
              ) : (
                <button 
                  onClick={() => setShowAuthModal(true)}
                  className="flex items-center gap-2 text-white hover:text-blue-400 transition-colors"
                >
                  <User className="w-4 h-4" />
                  <span className="text-[10px] uppercase tracking-widest font-bold">Sign In</span>
                </button>
              )}
            </div>
            
            {roomState !== 'IDLE' && (
              <div className="flex flex-col items-end gap-4">
                <div className="flex items-center gap-8 bg-black/40 px-6 py-3 rounded-full border border-white/10 backdrop-blur-md">
                  
                  {/* Status Indicator */}
                  <div className="flex items-center gap-2">
                    {roomState === 'LISTENING' ? (
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
                    ) : (
                      <span className="w-1.5 h-1.5 rounded-full bg-yellow-500" />
                    )}
                    <span className="text-white/70 text-[10px] tracking-[0.2em] uppercase font-bold">
                      {roomState === 'LISTENING' ? 'Live' : 'Paused'}
                    </span>
                  </div>
                  
                  <div className="w-px h-3 bg-white/10" />

                  {/* Participants */}
                  <div 
                    className="flex items-center gap-2 cursor-pointer group relative"
                    onMouseEnter={() => setShowParticipants(true)}
                    onMouseLeave={() => setShowParticipants(false)}
                  >
                    <Users className="w-3 h-3 text-white/40 group-hover:text-white transition-colors" />
                    <span className="text-white text-[10px] tracking-[0.2em] uppercase font-mono font-bold">
                      {aiData?.participants?.length || 1}
                    </span>

                    {showParticipants && aiData?.participants && (
                      <div className="absolute top-full right-0 mt-4 bg-black/90 border border-white/10 rounded-xl p-5 min-w-[240px] shadow-2xl backdrop-blur-xl">
                        <div className="text-[9px] text-white/30 uppercase tracking-[0.3em] mb-4 pb-3 border-b border-white/5 font-bold">Active Connections</div>
                        <div className="space-y-4">
                          {aiData.participants.map((p, i) => (
                            <div key={i} className="flex items-center gap-3">
                              <div className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center text-white text-[10px] font-bold uppercase">
                                {p.charAt(0)}
                              </div>
                              <span className="text-xs text-white/80 font-medium tracking-wide uppercase">{p}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="w-px h-3 bg-white/10" />
                  
                  {/* Share Code */}
                  <div className="flex items-center gap-2 cursor-pointer group" onClick={() => {
                    navigator.clipboard.writeText(window.location.href);
                    alert('Room link copied to clipboard!');
                  }} title="Copy Room Link">
                    <span className="text-white/30 text-[10px] tracking-[0.2em] uppercase font-bold">Code:</span>
                    <span className="text-white/80 text-[10px] tracking-[0.2em] uppercase font-mono bg-white/5 px-2 py-1 rounded group-hover:bg-white group-hover:text-black transition-all">
                      {activeIncidentId}
                    </span>
                  </div>

                  {isAdmin && (
                    <>
                      <div className="w-px h-3 bg-white/10" />
                      <div className="flex items-center gap-2 cursor-pointer group" onClick={handleToggleParticleText} title="Toggle Particle Text">
                        <span className="text-white/30 text-[10px] tracking-[0.2em] uppercase font-bold">FX:</span>
                        <span className={`text-[10px] tracking-[0.2em] uppercase font-mono px-2 py-1 rounded transition-all ${
                          (aiData?.is_particle_text_enabled ?? enableTextIllusion) ? 'bg-blue-500/20 text-blue-400 border border-blue-500/50' : 'bg-white/5 text-white/50 border border-transparent hover:bg-white/10'
                        }`}>
                          {(aiData?.is_particle_text_enabled ?? enableTextIllusion) ? 'ON' : 'OFF'}
                        </span>
                      </div>
                    </>
                  )}
                </div>
                
                {/* Controls */}
                <div className="flex gap-2 items-center">
                  <button onClick={togglePause} className="p-3 bg-black/40 hover:bg-white/10 rounded-full border border-white/10 text-white/70 transition-all cursor-pointer z-50 backdrop-blur-md">
                    {roomState === 'LISTENING' ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                  </button>
                  <button onClick={stopSession} className="p-3 bg-black/40 hover:bg-red-500/20 rounded-full border border-white/10 text-white/70 hover:text-red-400 transition-all cursor-pointer z-50 backdrop-blur-md">
                    <Square className="w-3 h-3" />
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Main Content Area */}
          <div className="flex-1 flex flex-col relative">
            
            {/* Top Row: Intelligence Dashboard widgets — positioned top-left */}
            <div className="px-8 md:px-12 pt-2 pointer-events-auto">
              <IntelligenceDashboard state={aiData} onConnectProject={() => {
                setProjectUrlError(null);
                setProjectConnectionMessage(null);
                setShowProjectModal(true);
              }} />
              {projectConnectionMessage && (
                <div className={`mt-3 max-w-xl rounded-lg border px-3 py-2 text-[10px] tracking-wide backdrop-blur-md ${
                  projectConnectionMessage.startsWith('Repository connected')
                    ? 'border-green-500/30 bg-green-500/10 text-green-300'
                    : projectConnectionMessage === 'Scanning repository...'
                      ? 'border-blue-500/30 bg-blue-500/10 text-blue-300'
                      : 'border-red-500/30 bg-red-500/10 text-red-300'
                }`} role="status">
                  {projectConnectionMessage}
                </div>
              )}
            </div>

            {/* Bottom Row: Transcript pinned bottom-left */}
            <div className="mt-auto px-8 md:px-12 pb-8 pointer-events-auto">
              {/* Transcript */}
              {roomState !== 'IDLE' && (
                <div className={`transition-all duration-500 ease-out flex flex-col bg-black/40 backdrop-blur-xl rounded-2xl border border-white/10 overflow-hidden shadow-2xl ${
                  isAudioExpanded 
                    ? 'w-full max-w-sm h-[40vh]' 
                    : 'w-full max-w-sm h-28 cursor-pointer hover:border-white/30'
                }`}
                onClick={() => !isAudioExpanded && setIsAudioExpanded(true)}
                >
                  <div className="p-3 border-b border-white/5 flex items-center justify-between bg-white/5">
                    <div className="flex items-center gap-3">
                      {isListening ? (
                        <div className="relative flex h-2.5 w-2.5">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500"></span>
                        </div>
                      ) : (
                        <div className="w-2 h-2 bg-red-500/60 rounded-full" />
                      )}
                      <span className="text-white/50 text-[10px] tracking-[0.3em] uppercase font-bold">
                        {isListening ? 'Listening' : 'Mic Off'}
                      </span>
                    </div>
                    {isAudioExpanded && (
                      <button onClick={(e) => { e.stopPropagation(); setIsAudioExpanded(false); }} className="text-white/40 hover:text-white text-sm px-2 py-1 bg-white/5 rounded">MINIMIZE &times;</button>
                    )}
                  </div>
                  
                  {isAudioExpanded && (
                    <div className="p-3 border-b border-white/5 bg-black/40">
                      <input 
                        type="text" 
                        placeholder="Search intercepts..." 
                        value={audioSearch}
                        onChange={e => setAudioSearch(e.target.value)}
                        className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-white text-xs focus:outline-none focus:border-white/30"
                      />
                    </div>
                  )}

                  <div className={`flex-1 p-4 overflow-y-auto custom-scroll flex flex-col-reverse ${isAudioExpanded ? 'space-y-3' : 'space-y-1'}`}>
                    {/* Live interim text — what the mic is currently hearing */}
                    {interimText && (
                      <div className="text-sm border-l-2 border-green-500/50 pl-3 py-1 mb-2 animate-pulse">
                        <span className="text-green-400/60 font-mono text-[10px] uppercase tracking-wider mr-2">hearing</span>
                        <span className="text-green-300/70 text-xs italic font-light">{interimText}</span>
                      </div>
                    )}
                    
                    {filteredTranscript.length > 0 ? (
                      [...filteredTranscript]
                        .filter(t => !audioSearch || t.text.toLowerCase().includes(audioSearch.toLowerCase()) || t.speaker.toLowerCase().includes(audioSearch.toLowerCase()))
                        .reverse().map((t, i) => (
                        <div key={i} className="text-sm py-0.5">
                          <span className="text-blue-400/60 font-mono text-[10px] uppercase tracking-wider mr-2">{t.speaker}</span>
                          <span className={`leading-relaxed font-light ${isAudioExpanded ? 'text-white/90 text-sm' : 'text-white/70 text-xs truncate block'}`}>{t.text}</span>
                        </div>
                      ))
                    ) : (
                      <div className="text-white/20 text-xs text-center font-light mt-4 tracking-wide">
                        {isThinking ? (
                          <span className="text-blue-400 animate-pulse">VAANI is thinking...</span>
                        ) : (
                          <span>Awaiting voice transmission...</span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
          
          {/* Chatbox — bottom-right, no overlap */}
          {roomState !== 'IDLE' && activeIncidentId && (
            <AIChatbox 
              incidentId={activeIncidentId} 
              aiResponse={aiData?.ai_response} 
              showParticleText={showParticleText}
              onToggleParticleText={() => {
                setShowParticleText(!showParticleText);
                if (showParticleText) setDisplayText("");
              }}
            />
          )}

          {showProjectModal && (
            <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-4 backdrop-blur-md pointer-events-auto" role="dialog" aria-modal="true" aria-labelledby="connect-project-title">
              <div className="relative w-full max-w-md overflow-hidden rounded-2xl border border-white/15 bg-[#080b14]/95 shadow-[0_24px_100px_rgba(0,0,0,0.65)]">
                <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-blue-400 to-transparent" />
                <div className="flex items-start justify-between border-b border-white/10 px-6 py-5">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-blue-400/30 bg-blue-400/10">
                      <GitBranch className="h-5 w-5 text-blue-300" />
                    </div>
                    <div>
                      <p className="text-[9px] font-bold uppercase tracking-[0.3em] text-blue-300/70">Project context</p>
                      <h2 id="connect-project-title" className="mt-1 text-lg font-semibold tracking-tight text-white">Connect a repository</h2>
                    </div>
                  </div>
                  <button type="button" onClick={() => !isConnectingRepo && setShowProjectModal(false)} className="rounded-lg p-2 text-white/40 transition hover:bg-white/10 hover:text-white disabled:cursor-not-allowed" disabled={isConnectingRepo} aria-label="Close dialog">
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <form onSubmit={(event) => { event.preventDefault(); void connectProject(); }} className="space-y-5 px-6 py-6">
                  <div>
                    <label htmlFor="github-repository-url" className="mb-2 block text-[10px] font-bold uppercase tracking-[0.2em] text-white/50">GitHub repository URL</label>
                    <div className={`flex items-center gap-3 rounded-xl border bg-white/[0.04] px-4 transition ${projectUrlError ? 'border-red-400/60' : 'border-white/15 focus-within:border-blue-400/70'}`}>
                      <GitBranch className="h-4 w-4 shrink-0 text-white/35" />
                      <input id="github-repository-url" value={githubUrl} onChange={(event) => { setGithubUrl(event.target.value); setProjectUrlError(null); }} placeholder="https://github.com/owner/repository" className="h-12 min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-white/25" autoFocus disabled={isConnectingRepo} />
                    </div>
                    {projectUrlError ? <p className="mt-2 text-xs text-red-300">{projectUrlError}</p> : <p className="mt-2 text-xs leading-relaxed text-white/35">VAANI will inspect public source files and add grounded findings to this incident.</p>}
                  </div>

                  {isConnectingRepo && (
                    <div className="rounded-xl border border-blue-400/20 bg-blue-400/[0.06] p-4">
                      <div className="flex items-center gap-3">
                        <LoaderCircle className="h-4 w-4 animate-spin text-blue-300" />
                        <div className="flex-1">
                          <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.18em]">
                            <span className="text-blue-200">Scanning repository</span>
                            <span className="text-blue-300/50">Live</span>
                          </div>
                          <div className="mt-3 h-1 overflow-hidden rounded-full bg-white/10"><div className="h-full w-1/2 animate-pulse rounded-full bg-gradient-to-r from-blue-500 to-cyan-300" /></div>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="flex items-center justify-end gap-3">
                    <button type="button" onClick={() => setShowProjectModal(false)} disabled={isConnectingRepo} className="rounded-lg px-4 py-2.5 text-[10px] font-bold uppercase tracking-[0.18em] text-white/45 transition hover:bg-white/5 hover:text-white disabled:cursor-not-allowed disabled:opacity-40">Cancel</button>
                    <button type="submit" disabled={isConnectingRepo || !githubUrl.trim()} className="inline-flex items-center gap-2 rounded-lg bg-blue-500 px-5 py-2.5 text-[10px] font-bold uppercase tracking-[0.18em] text-white shadow-[0_0_24px_rgba(59,130,246,0.25)] transition hover:bg-blue-400 disabled:cursor-not-allowed disabled:opacity-40">
                      {isConnectingRepo ? 'Scanning' : 'Connect repository'}
                      {!isConnectingRepo && <ArrowUpRight className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
        )}

      </main>
    );
  }



export default function Home() { return <Suspense fallback={<div>Loading...</div>}><HomeContent /></Suspense>; }

