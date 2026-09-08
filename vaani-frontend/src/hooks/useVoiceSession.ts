"use client";
import { useState, useRef, useEffect, useCallback } from "react";

interface UseVoiceSessionProps {
  isActive: boolean;
  onSentenceComplete: (text: string) => void;
  onInterimResult?: (text: string) => void;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SpeechRecognitionInstance = any;

export function useVoiceSession({ isActive, onSentenceComplete, onInterimResult }: UseVoiceSessionProps) {
  const [isListening, setIsListening] = useState(false);
  const [interimText, setInterimText] = useState("");
  const recognitionRef = useRef<SpeechRecognitionInstance>(null);
  const onSentenceCompleteRef = useRef(onSentenceComplete);
  const onInterimResultRef = useRef(onInterimResult);
  const restartTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isActiveRef = useRef(isActive);

  useEffect(() => {
    onSentenceCompleteRef.current = onSentenceComplete;
    onInterimResultRef.current = onInterimResult;
  }, [onSentenceComplete, onInterimResult]);

  useEffect(() => {
    isActiveRef.current = isActive;
  }, [isActive]);

  const startRecognition = useCallback(() => {
    if (!isActiveRef.current || !recognitionRef.current) return;
    try {
      recognitionRef.current.start();
      setIsListening(true);
    } catch {
      // Already started, ignore
    }
  }, []);

  useEffect(() => {
    if (!isActive) {
      if (recognitionRef.current) {
        recognitionRef.current.onend = null;
        recognitionRef.current.onerror = null;
        recognitionRef.current.onresult = null;
        try { recognitionRef.current.stop(); } catch {}
        recognitionRef.current = null;
      }
      if (restartTimeoutRef.current) {
        clearTimeout(restartTimeoutRef.current);
        restartTimeoutRef.current = null;
      }
      setIsListening(false);
      setInterimText("");
      return;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      console.error("Speech Recognition API not supported in this browser.");
      return;
    }

    if (!recognitionRef.current) {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = "en-US";
      // Increase max alternatives for better accuracy
      recognition.maxAlternatives = 3;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      recognition.onresult = (event: any) => {
        let interimTranscript = '';
        let finalTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const result = event.results[i];
          // Pick the highest-confidence alternative
          const bestAlt = result[0];
          
          if (result.isFinal) {
            finalTranscript += bestAlt.transcript;
          } else {
            interimTranscript += bestAlt.transcript;
          }
        }

        if (interimTranscript) {
          setInterimText(interimTranscript.trim());
          if (onInterimResultRef.current) {
            onInterimResultRef.current(interimTranscript.trim());
          }
        }

        if (finalTranscript && finalTranscript.trim()) {
          setInterimText("");
          onSentenceCompleteRef.current(finalTranscript.trim());
        }
      };

      recognition.onerror = (event: SpeechRecognitionInstance) => {
        const error = event?.error || 'unknown';
        // Don't log "no-speech" or "aborted" — these are normal
        if (error !== 'no-speech' && error !== 'aborted') {
          console.warn("Speech recognition error:", error);
        }
        // Auto-restart on recoverable errors
        if (error === 'network' || error === 'audio-capture') {
          if (restartTimeoutRef.current) clearTimeout(restartTimeoutRef.current);
          restartTimeoutRef.current = setTimeout(startRecognition, 1000);
        }
      };

      recognition.onend = () => {
        // Auto-restart to keep listening continuously
        if (isActiveRef.current && recognitionRef.current) {
          if (restartTimeoutRef.current) clearTimeout(restartTimeoutRef.current);
          restartTimeoutRef.current = setTimeout(startRecognition, 100);
        }
      };

      recognitionRef.current = recognition;
    }

    startRecognition();

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.onend = null;
        recognitionRef.current.onerror = null;
        recognitionRef.current.onresult = null;
        try { recognitionRef.current.stop(); } catch {}
        recognitionRef.current = null;
      }
      if (restartTimeoutRef.current) {
        clearTimeout(restartTimeoutRef.current);
        restartTimeoutRef.current = null;
      }
      setIsListening(false);
      setInterimText("");
    };
  }, [isActive, startRecognition]);

  return { isListening, interimText };
}
