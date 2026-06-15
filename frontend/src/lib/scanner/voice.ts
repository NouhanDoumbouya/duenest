export type VoiceCommand = "capture" | "torch" | "cancel";

interface SpeechRecognitionResultLike {
  0: { transcript: string };
  isFinal: boolean;
}

interface SpeechRecognitionEventLike {
  results: ArrayLike<SpeechRecognitionResultLike>;
}

interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}

interface SpeechRecognitionCtor {
  new (): SpeechRecognitionLike;
}

function getCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function isVoiceSupported(): boolean {
  return getCtor() !== null;
}

const PHRASES: Record<string, VoiceCommand> = {
  capture: "capture",
  scan: "capture",
  shoot: "capture",
  flash: "torch",
  torch: "torch",
  light: "torch",
  cancel: "cancel",
  stop: "cancel",
  close: "cancel",
};

function matchCommand(transcript: string): VoiceCommand | null {
  const text = transcript.toLowerCase().trim();
  for (const phrase of Object.keys(PHRASES)) {
    if (text.includes(phrase)) return PHRASES[phrase];
  }
  return null;
}

export interface VoiceController {
  start: () => void;
  stop: () => void;
}

/**
 * Start listening for the supported voice commands. Voice is never required:
 * if unsupported or permission is denied, `onUnavailable` fires and the rest of
 * the scanner is unaffected. The controller auto-restarts on `onend` while
 * active to keep recognition alive.
 */
export function createVoiceController(opts: {
  onCommand: (command: VoiceCommand) => void;
  onUnavailable?: (reason: string) => void;
  onListeningChange?: (listening: boolean) => void;
}): VoiceController | null {
  const Ctor = getCtor();
  if (!Ctor) {
    opts.onUnavailable?.("Voice commands are not supported in this browser.");
    return null;
  }

  let recognition: SpeechRecognitionLike | null = null;
  let active = false;

  const build = (): SpeechRecognitionLike => {
    const rec = new Ctor();
    rec.continuous = true;
    rec.interimResults = false;
    rec.lang = "en-US";
    rec.onresult = (event) => {
      const last = event.results[event.results.length - 1];
      if (!last) return;
      const command = matchCommand(last[0].transcript);
      if (command) opts.onCommand(command);
    };
    rec.onerror = (event) => {
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        active = false;
        opts.onUnavailable?.("Microphone access was denied.");
        opts.onListeningChange?.(false);
      }
    };
    rec.onend = () => {
      if (active) {
        try {
          rec.start();
        } catch {
          /* already started / transient */
        }
      } else {
        opts.onListeningChange?.(false);
      }
    };
    return rec;
  };

  return {
    start() {
      if (active) return;
      active = true;
      recognition = build();
      try {
        recognition.start();
        opts.onListeningChange?.(true);
      } catch {
        active = false;
        opts.onUnavailable?.("Could not start voice recognition.");
      }
    },
    stop() {
      active = false;
      try {
        recognition?.stop();
      } catch {
        /* ignore */
      }
      recognition = null;
    },
  };
}
