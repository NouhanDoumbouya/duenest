"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Check,
  Crop,
  FileText,
  FlashlightOff,
  Flashlight,
  Image as ImageIcon,
  Loader2,
  Mic,
  MicOff,
  RefreshCw,
  RotateCw,
  ShieldCheck,
  Upload,
  WifiOff,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  detectCapabilities,
  haptic,
  prefersReducedMotion,
} from "@/lib/scanner/capabilities";
import {
  CameraError,
  setTorch,
  startCamera,
  trackSupportsTorch,
  type CameraHandle,
} from "@/lib/scanner/camera";
import {
  detectQuadFromCanvas,
  loadOpenCv,
  warpToCanvas,
} from "@/lib/scanner/opencv";
import {
  requestOrientationPermission,
  subscribeOrientation,
  tiltLabel,
} from "@/lib/scanner/orientation";
import { createVoiceController, type VoiceController } from "@/lib/scanner/voice";
import { ENHANCE_MODES, enhanceCanvas } from "@/lib/scanner/enhance";
import { formatBytes, generatePdfBlob } from "@/lib/scanner/pdf";
import { uploadScan, flushQueuedScans } from "@/lib/scanner/client";
import { enqueueScan, listQueuedScans, purgeStale } from "@/lib/scanner/queue";
import {
  onServiceWorkerFlush,
  registerScannerServiceWorker,
  requestBackgroundFlush,
} from "@/lib/scanner/sw";
import type {
  DetectionState,
  EnhanceMode,
  Quad,
  QueuedScan,
  ScannerCapabilities,
  TiltState,
} from "@/lib/scanner/types";
import { useToast } from "./Toasts";
import { CropEditor } from "./CropEditor";

type Phase = "idle" | "camera" | "cropping" | "enhancing" | "done";

const DETECT_WIDTH = 480;
const DETECT_INTERVAL_MS = 130;
const AUTO_CAPTURE_MS = 1200;

const DETECTION_COPY: Record<DetectionState, string> = {
  searching: "No document found",
  detected: "Document detected, hold steady",
  "hold-steady": "Document detected, hold steady",
  captured: "Captured",
};

export function ScannerExperience({ onClose }: { onClose: () => void }) {
  const { showToast } = useToast();

  const [phase, setPhase] = useState<Phase>("idle");
  const [caps] = useState<ScannerCapabilities>(() => detectCapabilities());
  const [ariaStatus, setAriaStatus] = useState("Scanner ready");
  const [detection, setDetection] = useState<DetectionState>("searching");
  const [tilt, setTilt] = useState<TiltState>("unavailable");
  const [torchOn, setTorchOn] = useState(false);
  const [torchAvailable, setTorchAvailable] = useState(false);
  const [voiceOn, setVoiceOn] = useState(false);
  const [autoCapture, setAutoCapture] = useState(true);
  const [holdProgress, setHoldProgress] = useState(0);
  const [flash, setFlash] = useState(false);
  const [enhanceMode, setEnhanceMode] = useState<EnhanceMode>("clean");
  const [pdfSize, setPdfSize] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [online, setOnline] = useState(() =>
    typeof navigator === "undefined" ? true : navigator.onLine,
  );
  const [queued, setQueued] = useState<QueuedScan[]>([]);
  const [cvReady, setCvReady] = useState(false);
  const [quad, setQuad] = useState<Quad | null>(null);
  const [frozenCanvas, setFrozenCanvas] = useState<HTMLCanvasElement | null>(null);
  const [enhancedCanvas, setEnhancedCanvas] = useState<HTMLCanvasElement | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<CameraHandle | null>(null);
  const detectCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const cvRef = useRef<Awaited<ReturnType<typeof loadOpenCv>> | null>(null);
  const detectionLoopRef = useRef<() => void>(() => {});
  const rafRef = useRef<number | null>(null);
  const lastDetectRef = useRef(0);
  const stableSinceRef = useRef<number | null>(null);
  const tiltRef = useRef<TiltState>("unavailable");
  const detectedQuadRef = useRef<Quad | null>(null);
  const voiceRef = useRef<VoiceController | null>(null);
  const orientationCleanupRef = useRef<() => void>(() => {});
  const phaseRef = useRef<Phase>("idle");
  const reducedMotion = useRef(false);
  const autoCaptureRef = useRef(true);
  const captureRef = useRef<() => void>(() => {});

  const announce = useCallback((msg: string) => setAriaStatus(msg), []);

  // Keep refs that the rAF detection loop reads in sync with React state,
  // without re-creating the loop on every change.
  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);
  useEffect(() => {
    autoCaptureRef.current = autoCapture;
  }, [autoCapture]);

  const refreshQueue = useCallback(async () => {
    try {
      setQueued(await listQueuedScans());
    } catch {
      /* queue listing is non-critical */
    }
  }, []);

  const flushNow = useCallback(async () => {
    const { uploaded } = await flushQueuedScans();
    if (uploaded > 0) {
      showToast(`Uploaded ${uploaded} queued scan${uploaded > 1 ? "s" : ""}.`, "success");
      announce("Upload complete");
    }
    await refreshQueue();
  }, [announce, refreshQueue, showToast]);

  // ---- lifecycle: online state, queue, service worker -------------------
  useEffect(() => {
    reducedMotion.current = prefersReducedMotion();
    void purgeStale().then(refreshQueue);

    let unsubscribeSw: () => void = () => {};
    if (caps.serviceWorker) {
      void registerScannerServiceWorker();
      unsubscribeSw = onServiceWorkerFlush(() => void flushNow());
    }

    const goOnline = () => {
      setOnline(true);
      void flushNow();
    };
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
      unsubscribeSw();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caps.serviceWorker, refreshQueue]);

  // ---- cleanup on unmount ----------------------------------------------
  const stopEverything = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    orientationCleanupRef.current();
    voiceRef.current?.stop();
    voiceRef.current = null;
    cameraRef.current?.stop();
    cameraRef.current = null;
  }, []);

  useEffect(() => () => stopEverything(), [stopEverything]);

  // ---- detection loop ---------------------------------------------------
  const runDetection = useCallback(() => {
    const video = videoRef.current;
    const cv = cvRef.current;
    if (!video || phaseRef.current !== "camera") {
      rafRef.current = requestAnimationFrame(detectionLoopRef.current);
      return;
    }
    const now = performance.now();
    if (cv && video.videoWidth && now - lastDetectRef.current >= DETECT_INTERVAL_MS) {
      lastDetectRef.current = now;
      let dc = detectCanvasRef.current;
      if (!dc) {
        dc = document.createElement("canvas");
        detectCanvasRef.current = dc;
      }
      const dw = DETECT_WIDTH;
      const dh = Math.round((video.videoHeight / video.videoWidth) * dw);
      dc.width = dw;
      dc.height = dh;
      const dctx = dc.getContext("2d");
      if (dctx) {
        dctx.drawImage(video, 0, 0, dw, dh);
        let found: Quad | null = null;
        try {
          found = detectQuadFromCanvas(cv, dc);
        } catch {
          found = null;
        }
        const scaleUp = video.videoWidth / dw;
        if (found) {
          detectedQuadRef.current = found.map((p) => ({
            x: p.x * scaleUp,
            y: p.y * scaleUp,
          })) as Quad;
          const aligned = tiltRef.current === "level" || tiltRef.current === "slight";
          setDetection(aligned ? "hold-steady" : "detected");
          if (autoCaptureRef.current && aligned) {
            if (stableSinceRef.current == null) stableSinceRef.current = now;
            const held = now - stableSinceRef.current;
            setHoldProgress(Math.min(1, held / AUTO_CAPTURE_MS));
            if (held >= AUTO_CAPTURE_MS) {
              stableSinceRef.current = null;
              setHoldProgress(0);
              captureRef.current();
              return;
            }
          } else {
            stableSinceRef.current = null;
            setHoldProgress(0);
          }
        } else {
          detectedQuadRef.current = null;
          stableSinceRef.current = null;
          setHoldProgress(0);
          setDetection("searching");
        }
      }
    }
    rafRef.current = requestAnimationFrame(detectionLoopRef.current);
  }, []);

  useEffect(() => {
    detectionLoopRef.current = runDetection;
  }, [runDetection]);

  // ---- capture ----------------------------------------------------------
  const capture = useCallback(() => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    setFrozenCanvas(canvas);

    const detected = detectedQuadRef.current;
    const initial: Quad =
      detected ??
      ([
        { x: canvas.width * 0.08, y: canvas.height * 0.08 },
        { x: canvas.width * 0.92, y: canvas.height * 0.08 },
        { x: canvas.width * 0.92, y: canvas.height * 0.92 },
        { x: canvas.width * 0.08, y: canvas.height * 0.92 },
      ] as Quad);

    haptic([50]);
    setDetection("captured");
    if (!reducedMotion.current) {
      setFlash(true);
      window.setTimeout(() => setFlash(false), 220);
    }
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    setQuad(initial);
    setPhase("cropping");
    announce("Adjust document corners");
  }, [announce]);

  useEffect(() => {
    captureRef.current = capture;
  }, [capture]);

  // ---- start camera -----------------------------------------------------
  const startScanning = useCallback(async () => {
    if (!caps.secureContext) {
      showToast("Camera requires a secure (HTTPS) connection.", "error");
      return;
    }
    try {
      const handle = await startCamera();
      cameraRef.current = handle;
      setPhase("camera");
      announce("Camera ready");
      const video = videoRef.current;
      if (video) {
        video.srcObject = handle.stream;
        await video.play().catch(() => {});
      }
      const torchOk = trackSupportsTorch(handle.track);
      setTorchAvailable(torchOk);

      // OpenCV is best-effort; manual crop still works without it.
      loadOpenCv()
        .then((cv) => {
          cvRef.current = cv;
          setCvReady(true);
        })
        .catch(() => {
          showToast("Edge detection unavailable — you can still crop manually.", "info");
        });

      if (caps.orientation) {
        const granted = await requestOrientationPermission();
        if (granted) {
          orientationCleanupRef.current = subscribeOrientation((r) => {
            tiltRef.current = r.state;
            setTilt(r.state);
          });
        }
      }

      rafRef.current = requestAnimationFrame(runDetection);
    } catch (err) {
      const message =
        err instanceof CameraError
          ? err.message
          : "Could not start the camera.";
      showToast(message, "error");
      announce(message);
    }
  }, [announce, caps.orientation, caps.secureContext, runDetection, showToast]);

  // ---- torch ------------------------------------------------------------
  const toggleTorch = useCallback(async () => {
    const track = cameraRef.current?.track;
    if (!track) return;
    try {
      const next = await setTorch(track, !torchOn);
      setTorchOn(next);
    } catch {
      showToast("Torch toggle failed on this device.", "error");
    }
  }, [showToast, torchOn]);

  const handleClose = useCallback(() => {
    stopEverything();
    onClose();
  }, [onClose, stopEverything]);

  // ---- voice ------------------------------------------------------------
  const toggleVoice = useCallback(() => {
    if (voiceOn) {
      voiceRef.current?.stop();
      voiceRef.current = null;
      setVoiceOn(false);
      return;
    }
    const controller = createVoiceController({
      onCommand: (command) => {
        if (command === "capture") capture();
        else if (command === "torch") void toggleTorch();
        else if (command === "cancel") handleClose();
        announce(`Voice command: ${command}`);
      },
      onUnavailable: (reason) => {
        setVoiceOn(false);
        showToast(reason, "error");
      },
      onListeningChange: setVoiceOn,
    });
    if (!controller) return;
    voiceRef.current = controller;
    controller.start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voiceOn, capture, toggleTorch, announce, showToast]);

  // ---- file import fallback --------------------------------------------
  const onImportFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      canvas.getContext("2d")?.drawImage(img, 0, 0);
      setFrozenCanvas(canvas);
      URL.revokeObjectURL(url);
      setQuad([
        { x: canvas.width * 0.05, y: canvas.height * 0.05 },
        { x: canvas.width * 0.95, y: canvas.height * 0.05 },
        { x: canvas.width * 0.95, y: canvas.height * 0.95 },
        { x: canvas.width * 0.05, y: canvas.height * 0.95 },
      ]);
      setPhase("cropping");
      announce("Adjust document corners");
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      showToast("Could not open that image.", "error");
    };
    img.src = url;
  }, [announce, showToast]);

  // ---- apply warp + enhance --------------------------------------------
  const buildEnhanced = useCallback(
    (mode: EnhanceMode): HTMLCanvasElement | null => {
      if (!frozenCanvas || !quad) return null;
      const cv = cvRef.current;
      const warped = cv
        ? warpToCanvas(cv, frozenCanvas, quad)
        : cropBoundingBox(frozenCanvas, quad);
      return enhanceCanvas(warped, mode);
    },
    [frozenCanvas, quad],
  );

  const applyCrop = useCallback(() => {
    if (!frozenCanvas || !quad) return;
    setBusy(true);
    announce("Processing scan");
    window.setTimeout(() => {
      try {
        const enhanced = buildEnhanced(enhanceMode);
        if (!enhanced) throw new Error("enhance failed");
        setEnhancedCanvas(enhanced);
        setPdfSize(null);
        setPhase("enhancing");
        announce("PDF ready to review");
      } catch {
        showToast("We couldn't process that scan. Try retaking it.", "error");
      } finally {
        setBusy(false);
      }
    }, 30);
  }, [announce, buildEnhanced, enhanceMode, frozenCanvas, quad, showToast]);

  const changeEnhanceMode = useCallback(
    (mode: EnhanceMode) => {
      setEnhanceMode(mode);
      setPdfSize(null);
      const enhanced = buildEnhanced(mode);
      if (enhanced) setEnhancedCanvas(enhanced);
    },
    [buildEnhanced],
  );

  // Paint the current enhanced canvas into the visible preview canvas.
  useEffect(() => {
    if (phase !== "enhancing" || !enhancedCanvas) return;
    const target = document.getElementById("scan-preview") as HTMLCanvasElement | null;
    if (target) {
      target.width = enhancedCanvas.width;
      target.height = enhancedCanvas.height;
      target.getContext("2d")?.drawImage(enhancedCanvas, 0, 0);
    }
  }, [phase, enhancedCanvas]);

  // ---- save / upload ----------------------------------------------------
  const saveAndUpload = useCallback(async () => {
    const canvas = enhancedCanvas;
    if (!canvas) return;
    setBusy(true);
    announce("Generating PDF");
    let blob: Blob;
    try {
      blob = await generatePdfBlob([canvas]);
      setPdfSize(blob.size);
    } catch {
      setBusy(false);
      showToast("PDF generation failed. Please try again.", "error");
      return;
    }

    const filename = `scan-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "")}.pdf`;

    if (!online) {
      await enqueueScan(blob, filename);
      await requestBackgroundFlush();
      await refreshQueue();
      setBusy(false);
      setPhase("done");
      showToast(
        "You are offline. Scan saved locally and will upload when connection returns.",
        "info",
      );
      announce("Scan queued for upload when online");
      return;
    }

    try {
      await uploadScan(blob, filename);
      setBusy(false);
      setPhase("done");
      showToast("Scan uploaded to your vault.", "success");
      announce("Upload complete");
    } catch (err) {
      await enqueueScan(blob, filename);
      await refreshQueue();
      setBusy(false);
      setPhase("done");
      const message = (err as Error).message || "Upload failed.";
      showToast(`${message} Saved locally to retry.`, "error");
      announce("Scan queued for upload when online");
    }
  }, [announce, enhancedCanvas, online, refreshQueue, showToast]);

  // ---- navigation helpers ----------------------------------------------
  const retake = useCallback(() => {
    setFrozenCanvas(null);
    setEnhancedCanvas(null);
    setQuad(null);
    setDetection("searching");
    setPhase("camera");
    stableSinceRef.current = null;
    rafRef.current = requestAnimationFrame(runDetection);
    announce("Camera ready");
  }, [announce, runDetection]);

  const rotateQuad = useCallback(() => {
    setQuad((prev) => (prev ? ([prev[3], prev[0], prev[1], prev[2]] as Quad) : prev));
  }, []);

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-slate-950 text-slate-50">
      <span className="sr-only" role="status" aria-live="polite">
        {ariaStatus}
      </span>

      {/* Top bar */}
      <header className="flex items-center justify-between gap-3 border-b border-white/10 bg-slate-950/80 px-4 py-3 backdrop-blur-md">
        <div className="flex items-center gap-2 text-sm font-medium">
          <ShieldCheck className="size-4 text-teal-300" aria-hidden="true" />
          <span>DueNest Scanner</span>
        </div>
        <div className="flex items-center gap-2">
          {!online && (
            <span className="flex items-center gap-1 rounded-full bg-amber-500/15 px-2.5 py-1 text-xs text-amber-200">
              <WifiOff className="size-3.5" aria-hidden="true" /> Offline
            </span>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={handleClose}
            aria-label="Close scanner"
            className="text-slate-200 hover:bg-white/10 hover:text-white"
          >
            <X className="size-5" aria-hidden="true" />
          </Button>
        </div>
      </header>

      <main className="relative flex-1 overflow-hidden">
        {phase === "idle" && (
          <IdleScreen
            caps={caps}
            queued={queued}
            onStart={startScanning}
            onImport={() => fileInputRef.current?.click()}
            onRetryQueue={flushNow}
            onRefreshQueue={refreshQueue}
          />
        )}

        <div
          className={cn(
            "relative h-full w-full bg-black",
            phase === "camera" ? "block" : "hidden",
          )}
        >
          <video
            ref={videoRef}
            playsInline
            muted
            className="h-full w-full object-cover"
            aria-label="Live camera preview"
          />
          {phase === "camera" && (
            <CameraOverlay
              detection={detection}
              tilt={tilt}
              holdProgress={holdProgress}
              torchOn={torchOn}
              torchAvailable={torchAvailable}
              caps={caps}
              voiceOn={voiceOn}
              autoCapture={autoCapture}
              cvReady={cvReady}
              onToggleTorch={toggleTorch}
              onToggleVoice={toggleVoice}
              onToggleAuto={() => setAutoCapture((v) => !v)}
              onCapture={capture}
              onImport={() => fileInputRef.current?.click()}
            />
          )}
        </div>

        {phase === "cropping" && frozenCanvas && quad && (
          <div className="flex h-full flex-col">
            <div className="flex-1 overflow-auto p-4">
              <p className="mb-3 text-center text-sm text-slate-300">
                Drag the corners to match the document edges.
              </p>
              <CropEditor source={frozenCanvas} quad={quad} onQuadChange={setQuad} />
            </div>
            <div className="grid grid-cols-2 gap-2 border-t border-white/10 bg-slate-950/80 p-4 backdrop-blur-md sm:grid-cols-4">
              <Button variant="outline" onClick={retake} className="border-white/20 bg-white/5 text-slate-100 hover:bg-white/10">
                <RefreshCw className="size-4" aria-hidden="true" /> Retake
              </Button>
              <Button
                variant="outline"
                onClick={() => frozenCanvas && quad && resetQuad(frozenCanvas, setQuad)}
                className="border-white/20 bg-white/5 text-slate-100 hover:bg-white/10"
              >
                <Crop className="size-4" aria-hidden="true" /> Reset
              </Button>
              <Button variant="outline" onClick={rotateQuad} className="border-white/20 bg-white/5 text-slate-100 hover:bg-white/10">
                <RotateCw className="size-4" aria-hidden="true" /> Rotate
              </Button>
              <Button onClick={applyCrop} disabled={busy} className="bg-teal-500 text-slate-950 hover:bg-teal-400">
                {busy ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Check className="size-4" aria-hidden="true" />}
                Apply
              </Button>
            </div>
          </div>
        )}

        {phase === "enhancing" && (
          <div className="flex h-full flex-col">
            <div className="flex flex-1 items-center justify-center overflow-auto p-4">
              <canvas
                id="scan-preview"
                className="max-h-full max-w-full rounded-xl shadow-floating ring-1 ring-white/10"
                aria-label="Enhanced document preview"
              />
            </div>
            <div className="space-y-3 border-t border-white/10 bg-slate-950/80 p-4 backdrop-blur-md">
              <div className="flex items-center justify-center gap-2" role="group" aria-label="Enhancement level">
                {ENHANCE_MODES.map((m) => (
                  <button
                    key={m.value}
                    type="button"
                    onClick={() => changeEnhanceMode(m.value)}
                    aria-pressed={enhanceMode === m.value}
                    className={cn(
                      "rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:ring-teal-300 focus-visible:outline-none",
                      enhanceMode === m.value
                        ? "bg-teal-500 text-slate-950"
                        : "bg-white/5 text-slate-200 hover:bg-white/10",
                    )}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
              {pdfSize != null && (
                <p className="text-center text-xs text-slate-400">PDF size: {formatBytes(pdfSize)}</p>
              )}
              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" onClick={retake} className="border-white/20 bg-white/5 text-slate-100 hover:bg-white/10">
                  <RefreshCw className="size-4" aria-hidden="true" /> Retake
                </Button>
                <Button onClick={saveAndUpload} disabled={busy} className="bg-teal-500 text-slate-950 hover:bg-teal-400">
                  {busy ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Upload className="size-4" aria-hidden="true" />}
                  {online ? "Save & upload" : "Save offline"}
                </Button>
              </div>
            </div>
          </div>
        )}

        {phase === "done" && (
          <div className="flex h-full flex-col items-center justify-center gap-5 p-8 text-center">
            <div className="flex size-16 items-center justify-center rounded-full bg-teal-500/15">
              <Check className="size-8 text-teal-300" aria-hidden="true" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">{online ? "Scan saved" : "Scan queued"}</h2>
              <p className="mt-1 max-w-xs text-sm text-slate-400">
                {online
                  ? "Your document is in your vault inbox."
                  : "It will upload automatically when you're back online."}
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={retake} className="border-white/20 bg-white/5 text-slate-100 hover:bg-white/10">
                <FileText className="size-4" aria-hidden="true" /> Scan another
              </Button>
              <Button onClick={handleClose} className="bg-teal-500 text-slate-950 hover:bg-teal-400">
                Done
              </Button>
            </div>
          </div>
        )}

        {flash && <div className="pointer-events-none absolute inset-0 z-50 bg-white animate-out fade-out duration-200" />}
      </main>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,application/pdf"
        className="sr-only"
        onChange={onImportFile}
      />
    </div>
  );
}

// ---- sub-views ----------------------------------------------------------

function CameraOverlay(props: {
  detection: DetectionState;
  tilt: TiltState;
  holdProgress: number;
  torchOn: boolean;
  torchAvailable: boolean;
  caps: ScannerCapabilities;
  voiceOn: boolean;
  autoCapture: boolean;
  cvReady: boolean;
  onToggleTorch: () => void;
  onToggleVoice: () => void;
  onToggleAuto: () => void;
  onCapture: () => void;
  onImport: () => void;
}) {
  const detected = props.detection === "detected" || props.detection === "hold-steady";
  return (
    <>
      {/* Document frame glow */}
      <div
        className={cn(
          "pointer-events-none absolute inset-6 rounded-3xl border-2 transition-all duration-300 sm:inset-12",
          detected
            ? "border-teal-300/90 shadow-[0_0_40px_rgba(45,212,191,0.45)]"
            : "border-white/25",
        )}
      />

      {/* Status chip */}
      <div className="pointer-events-none absolute inset-x-0 top-4 flex flex-col items-center gap-2">
        <span
          className={cn(
            "rounded-full px-3.5 py-1.5 text-xs font-medium backdrop-blur-md",
            detected ? "bg-teal-500/20 text-teal-100" : "bg-black/40 text-slate-200",
          )}
        >
          {DETECTION_COPY[props.detection]}
        </span>
        {props.caps.orientation && (
          <BubbleLevel tilt={props.tilt} />
        )}
        {!props.cvReady && (
          <span className="rounded-full bg-black/40 px-3 py-1 text-[11px] text-slate-300">
            Loading edge detection…
          </span>
        )}
      </div>

      {/* Hold-steady progress ring */}
      {props.holdProgress > 0 && (
        <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
          <svg width="84" height="84" viewBox="0 0 84 84" aria-hidden="true">
            <circle cx="42" cy="42" r="38" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="4" />
            <circle
              cx="42"
              cy="42"
              r="38"
              fill="none"
              stroke="rgb(94,234,212)"
              strokeWidth="4"
              strokeLinecap="round"
              strokeDasharray={2 * Math.PI * 38}
              strokeDashoffset={2 * Math.PI * 38 * (1 - props.holdProgress)}
              transform="rotate(-90 42 42)"
            />
          </svg>
        </div>
      )}

      {/* Bottom controls */}
      <div className="absolute inset-x-0 bottom-0 flex flex-col gap-3 bg-gradient-to-t from-black/80 to-transparent px-6 pb-7 pt-12">
        <div className="flex items-center justify-center gap-3 text-xs text-slate-300">
          <button
            type="button"
            onClick={props.onToggleAuto}
            aria-pressed={props.autoCapture}
            className="rounded-full bg-white/10 px-3 py-1 backdrop-blur-md"
          >
            Auto-capture: {props.autoCapture ? "On" : "Off"}
          </button>
        </div>
        <div className="flex items-center justify-between">
          <ControlButton
            onClick={props.onImport}
            label="Import from gallery"
            disabled={false}
          >
            <ImageIcon className="size-6" aria-hidden="true" />
          </ControlButton>

          <button
            type="button"
            onClick={props.onCapture}
            aria-label="Capture document"
            className="flex size-[72px] items-center justify-center rounded-full border-4 border-white bg-white/90 transition-transform active:scale-95"
          >
            <span className="size-14 rounded-full bg-white" />
          </button>

          <div className="flex flex-col gap-3">
            {props.torchAvailable ? (
              <ControlButton onClick={props.onToggleTorch} label={props.torchOn ? "Turn torch off" : "Turn torch on"} disabled={false}>
                {props.torchOn ? <Flashlight className="size-6 text-amber-300" aria-hidden="true" /> : <FlashlightOff className="size-6" aria-hidden="true" />}
              </ControlButton>
            ) : (
              <span className="size-12" aria-hidden="true" />
            )}
            {props.caps.speech && (
              <ControlButton onClick={props.onToggleVoice} label={props.voiceOn ? "Stop voice commands" : "Start voice commands"} disabled={false}>
                {props.voiceOn ? <Mic className="size-6 text-teal-300" aria-hidden="true" /> : <MicOff className="size-6" aria-hidden="true" />}
              </ControlButton>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

function ControlButton({
  children,
  onClick,
  label,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  label: string;
  disabled: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      disabled={disabled}
      className="flex size-12 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur-md transition-colors hover:bg-white/20 focus-visible:ring-2 focus-visible:ring-teal-300 focus-visible:outline-none disabled:opacity-40"
    >
      {children}
    </button>
  );
}

function BubbleLevel({ tilt }: { tilt: TiltState }) {
  const offset = tilt === "level" ? 0 : tilt === "slight" ? 6 : 12;
  return (
    <div className="flex items-center gap-2 rounded-full bg-black/40 px-3 py-1 text-[11px] text-slate-200 backdrop-blur-md">
      <span className="relative flex size-5 items-center justify-center rounded-full border border-white/40">
        <span
          className={cn(
            "size-2 rounded-full transition-transform duration-150",
            tilt === "level" ? "bg-teal-300" : tilt === "slight" ? "bg-amber-300" : "bg-red-400",
          )}
          style={{ transform: `translate(${offset}px, 0)` }}
        />
      </span>
      {tiltLabel(tilt)}
    </div>
  );
}

function IdleScreen(props: {
  caps: ScannerCapabilities;
  queued: QueuedScan[];
  onStart: () => void;
  onImport: () => void;
  onRetryQueue: () => void;
  onRefreshQueue: () => void;
}) {
  return (
    <div className="mx-auto flex h-full max-w-md flex-col items-center justify-center gap-6 p-8 text-center">
      <div className="flex size-16 items-center justify-center rounded-2xl bg-teal-500/15">
        <FileText className="size-8 text-teal-300" aria-hidden="true" />
      </div>
      <div>
        <h1 className="text-xl font-semibold">Scan a document</h1>
        <p className="mt-2 text-sm text-slate-400">
          Capture passports, letters, and forms. We auto-detect the edges, flatten the page,
          and save a clean PDF straight to your encrypted vault.
        </p>
      </div>

      {!props.caps.camera && (
        <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
          {props.caps.secureContext
            ? "No camera detected. You can still import an image instead."
            : "Camera needs a secure (HTTPS) connection. Import an image instead."}
        </p>
      )}

      <div className="flex w-full flex-col gap-2">
        <Button
          onClick={props.onStart}
          disabled={!props.caps.camera}
          className="bg-teal-500 text-slate-950 hover:bg-teal-400"
          size="lg"
        >
          Start scanning
        </Button>
        <Button variant="outline" onClick={props.onImport} className="border-white/20 bg-white/5 text-slate-100 hover:bg-white/10" size="lg">
          <ImageIcon className="size-4" aria-hidden="true" /> Import an image
        </Button>
      </div>

      {props.queued.length > 0 && (
        <div className="w-full rounded-xl border border-white/10 bg-white/5 p-3 text-left">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-medium text-slate-300">
              {props.queued.length} scan{props.queued.length > 1 ? "s" : ""} waiting to upload
            </span>
            <button type="button" onClick={props.onRetryQueue} className="text-xs text-teal-300 hover:underline">
              Retry now
            </button>
          </div>
          <ul className="space-y-1 text-xs text-slate-400">
            {props.queued.slice(0, 3).map((item) => (
              <li key={item.id} className="flex items-center justify-between">
                <span className="truncate">{item.filename}</span>
                <span>{formatBytes(item.sizeBytes)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ---- helpers ------------------------------------------------------------

function cropBoundingBox(source: HTMLCanvasElement, quad: Quad): HTMLCanvasElement {
  const xs = quad.map((p) => p.x);
  const ys = quad.map((p) => p.y);
  const minX = Math.max(0, Math.min(...xs));
  const minY = Math.max(0, Math.min(...ys));
  const w = Math.min(source.width, Math.max(...xs)) - minX;
  const h = Math.min(source.height, Math.max(...ys)) - minY;
  const out = document.createElement("canvas");
  out.width = Math.max(1, Math.round(w));
  out.height = Math.max(1, Math.round(h));
  out.getContext("2d")?.drawImage(source, minX, minY, w, h, 0, 0, out.width, out.height);
  return out;
}

function resetQuad(source: HTMLCanvasElement, setQuad: (q: Quad) => void) {
  setQuad([
    { x: source.width * 0.06, y: source.height * 0.06 },
    { x: source.width * 0.94, y: source.height * 0.06 },
    { x: source.width * 0.94, y: source.height * 0.94 },
    { x: source.width * 0.06, y: source.height * 0.94 },
  ]);
}
