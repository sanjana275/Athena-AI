"use client";
import { useCallback, useEffect, useRef, useState } from "react";

export type VoiceMode = "voice-to-text" | "text-to-voice" | "voice-to-image";

interface UseSpeechOptions {
  onTranscript: (text: string) => void;
  onError?: (msg: string) => void;
}

/** Wraps the Web Speech API (SpeechRecognition) for in-browser STT. */
export function useSpeech({ onTranscript, onError }: UseSpeechOptions) {
  const [listening, setListening] = useState(false);
  const [supported, setSupported] = useState(false);
  const recogRef = useRef<any>(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const SR =
        (window as any).SpeechRecognition ||
        (window as any).webkitSpeechRecognition;
      if (SR) setSupported(true);
    }
  }, []);

  const start = useCallback(() => {
    if (typeof window === "undefined") return;
    const SR =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;
    if (!SR) {
      onError?.("Speech recognition is not supported in this browser. Use Chrome or Edge.");
      return;
    }

    const rec = new SR();
    recogRef.current = rec;
    rec.lang = "en-US";
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.continuous = false;

    rec.onstart = () => setListening(true);
    rec.onend = () => setListening(false);
    rec.onerror = (e: any) => {
      setListening(false);
      if (e?.error === "not-allowed") {
        onError?.("Microphone permission denied. Allow mic access in browser settings.");
      } else if (e?.error === "no-speech") {
        onError?.("No speech detected. Please try again.");
      } else {
        onError?.(`Speech error: ${e?.error || "unknown"}`);
      }
    };
    rec.onresult = (e: any) => {
      const results = e?.results ? Array.from(e.results) : [];
      const transcript = results
        .map((r: any) => r[0]?.transcript || "")
        .join(" ")
        .trim();
      if (transcript) onTranscript(transcript);
    };

    try {
      rec.start();
    } catch (err) {
      onError?.("Failed to start speech recognition.");
    }
  }, [onTranscript, onError]);

  const stop = useCallback(() => {
    try {
      recogRef.current?.stop();
    } catch {}
    setListening(false);
  }, []);

  return { listening, supported, start, stop };
}

/** Simple browser SpeechSynthesis wrapper for Text-to-Speech (TTS). */
export const speak = speakText;
export function speakText(text: string, onEnd?: () => void) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const clean = text
    .replace(/[#*`_~\[\]()>-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!clean) return;

  const utterance = new SpeechSynthesisUtterance(clean);
  utterance.rate = 1.05;
  utterance.pitch = 1.0;
  if (onEnd) utterance.onend = onEnd;
  window.speechSynthesis.speak(utterance);
}

export function stopSpeaking() {
  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    window.speechSynthesis.cancel();
  }
}
