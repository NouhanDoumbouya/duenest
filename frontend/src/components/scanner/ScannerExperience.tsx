"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Bell,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Copy,
  Crop,
  EyeOff,
  FileText,
  FlashlightOff,
  Flashlight,
  Image as ImageIcon,
  Layers,
  Loader2,
  Maximize,
  Mic,
  MicOff,
  Plus,
  RefreshCw,
  RotateCcw,
  RotateCw,
  ScanSearch,
  ScanText,
  Share2,
  ShieldCheck,
  SlidersHorizontal,
  Upload,
  Wand2,
  WifiOff,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { getFeatureMap, type FeatureState } from "@/lib/features";
import { cn } from "@/lib/utils";
import {
  detectCapabilities,
  haptic,
  prefersReducedMotion,
} from "@/lib/scanner/capabilities";
import {
  CameraError,
  focusAt,
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
import {
  applyAdjustments,
  applyFilter,
  DEFAULT_FILTER,
  FILTERS,
  getFilterMeta,
  isNeutralAdjust,
  NEUTRAL_ADJUST,
  renderPage,
  type Adjustments,
  type FilterId,
} from "@/lib/scanner/filters";
import {
  analyzeCanvasQuality,
  type ScanQualityWarning,
} from "@/lib/scanner/quality";
import { assessFraming, FRAMING_COPY } from "@/lib/scanner/autocapture";
import { recognizeText, hasUsableText, type OcrResult } from "@/lib/scanner/ocr";
import { formatBytes, generatePdfBlob } from "@/lib/scanner/pdf";
import { applyWatermark } from "@/lib/scanner/watermark";
import { applyRedactions, type RedactionRect } from "@/lib/scanner/redaction";
import { rasterizePdf } from "@/lib/pdf/rasterize";
import { FILENAME_TYPE_CHIPS, suggestFilename } from "@/lib/scanner/filename";
import { SCAN_MODES, type ScanMode } from "@/lib/scanner/modes";
import { uploadScan, flushQueuedScans } from "@/lib/scanner/client";
import {
  enqueueScan,
  listQueuedScans,
  purgeStale,
  removeScan,
} from "@/lib/scanner/queue";
import {
  onServiceWorkerFlush,
  registerScannerServiceWorker,
  requestBackgroundFlush,
} from "@/lib/scanner/sw";
import type {
  DetectionState,
  Quad,
  QueuedScan,
  ScannerCapabilities,
  TiltState,
} from "@/lib/scanner/types";
import { useToast } from "./Toasts";
import { CropEditor } from "./CropEditor";
import { PrepareCopySheet, type PreparedCopyOptions } from "./PrepareCopySheet";
import { RedactionEditor } from "./RedactionEditor";

type Phase = "idle" | "camera" | "cropping" | "enhancing" | "done";

/**
 * A committed page in a multi-page scan. We keep the pre-warp frame + quad (not
 * just the warped base) so a page can be re-opened and re-cropped later.
 */
interface ScanPage {
  id: string;
  frozen: HTMLCanvasElement;
  quad: Quad;
  base: HTMLCanvasElement;
  filterId: FilterId;
  adjust: Adjustments;
  thumb: string;
}

const MAX_PAGES = 25;

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
  const router = useRouter();

  const [phase, setPhase] = useState<Phase>("idle");
  const [caps] = useState<ScannerCapabilities>(() => detectCapabilities());
  const [ariaStatus, setAriaStatus] = useState("Scanner ready");
  const [detection, setDetection] = useState<DetectionState>("searching");
  // Live framing guidance ("Move closer" / "Center the document" / …) derived
  // from the detected quad. Display-only — it doesn't change the capture trigger.
  const [coaching, setCoaching] = useState<string | null>(null);
  const [tilt, setTilt] = useState<TiltState>("unavailable");
  const [torchOn, setTorchOn] = useState(false);
  const [torchAvailable, setTorchAvailable] = useState(false);
  const [voiceOn, setVoiceOn] = useState(false);
  const [autoCapture, setAutoCapture] = useState(true);
  // Hands-free batch mode: once a page is framed + steady it is captured AND
  // committed automatically, then the camera keeps going for the next page —
  // no taps between pages. Opt-in (default off) and only offered when the
  // `scan_hands_free` flag is on. Manual/auto single-capture is unchanged.
  const [handsFree, setHandsFree] = useState(false);
  const [holdProgress, setHoldProgress] = useState(0);
  const [flash, setFlash] = useState(false);
  const [filterId, setFilterId] = useState<FilterId>(DEFAULT_FILTER);
  const [moreOpen, setMoreOpen] = useState(false);
  // Chosen scan mode (session-only). A preset over filter + quality; never
  // auto-detected. null = no explicit mode picked.
  const [scanMode, setScanMode] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<ScanQualityWarning[]>([]);
  // On-device OCR result for the page in review (text + confidence), plus the
  // open/busy/progress UI state. Runs only when the user taps "Extract text".
  const [ocr, setOcr] = useState<OcrResult | null>(null);
  const [ocrOpen, setOcrOpen] = useState(false);
  const [ocrBusy, setOcrBusy] = useState(false);
  const [ocrStatus, setOcrStatus] = useState<string | null>(null);
  const [pages, setPages] = useState<ScanPage[]>([]);
  const [adjust, setAdjust] = useState<Adjustments>(NEUTRAL_ADJUST);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [saveOptionsOpen, setSaveOptionsOpen] = useState(false);
  const [exportQuality, setExportQuality] = useState<"standard" | "hd">("standard");
  // Human-readable progress shown during multi-step work (PDF build → upload).
  const [progress, setProgress] = useState<string | null>(null);
  // When re-editing a committed page, the slot it should return to (else append).
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [docName, setDocName] = useState("");
  const [pdfSize, setPdfSize] = useState<number | null>(null);
  // Id of the inbox file created by the last successful upload (online only).
  // Lets the success state deep-link straight to the saved file.
  const [savedFileId, setSavedFileId] = useState<number | null>(null);
  // Resolved feature availability for the current viewer. Advanced "next step"
  // connectors (share / bundle / reminder) stay hidden unless their flag is on,
  // so they never appear for normal users until a founder launches them.
  const [features, setFeatures] = useState<Record<string, FeatureState>>({});
  // "Prepare copy" sheet + the id of the prepared copy once created. The copy is
  // always a new inbox file; the original saved scan is never modified.
  const [prepareCopyOpen, setPrepareCopyOpen] = useState(false);
  const [copySavedFileId, setCopySavedFileId] = useState<number | null>(null);
  const [copySavedSize, setCopySavedSize] = useState<number | null>(null);
  // Redaction editor: open state + the page canvases snapshot it edits.
  const [redactOpen, setRedactOpen] = useState(false);
  const [redactPages, setRedactPages] = useState<HTMLCanvasElement[] | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const [online, setOnline] = useState(() =>
    typeof navigator === "undefined" ? true : navigator.onLine,
  );
  const [queued, setQueued] = useState<QueuedScan[]>([]);
  const [cvReady, setCvReady] = useState(false);
  const [quad, setQuad] = useState<Quad | null>(null);
  const [frozenCanvas, setFrozenCanvas] = useState<HTMLCanvasElement | null>(null);
  const [enhancedCanvas, setEnhancedCanvas] = useState<HTMLCanvasElement | null>(null);
  // The warped/cropped page BEFORE any filter. Filters are non-destructive: they
  // are always re-derived from this base, so switching filters or reverting to
  // Original never compounds processing or loses quality.
  const baseCanvasRef = useRef<HTMLCanvasElement | null>(null);
  // The base with the current filter applied (no manual adjustments). Lets the
  // brightness/contrast sliders re-run a single cheap LUT pass while dragging,
  // instead of re-filtering the whole frame each tick.
  const filteredBaseRef = useRef<HTMLCanvasElement | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<CameraHandle | null>(null);
  const detectCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const cvRef = useRef<Awaited<ReturnType<typeof loadOpenCv>> | null>(null);
  const detectionLoopRef = useRef<() => void>(() => {});
  const rafRef = useRef<number | null>(null);
  const lastDetectRef = useRef(0);
  const stableSinceRef = useRef<number | null>(null);
  // While the lens is refocusing (e.g. just after a tap-to-focus), suppress
  // auto-capture so we never freeze a half-focused frame. Holds a perf-now
  // deadline; auto-capture resumes once the clock passes it.
  const focusingUntilRef = useRef(0);
  const tiltRef = useRef<TiltState>("unavailable");
  const detectedQuadRef = useRef<Quad | null>(null);
  const voiceRef = useRef<VoiceController | null>(null);
  const orientationCleanupRef = useRef<() => void>(() => {});
  const phaseRef = useRef<Phase>("idle");
  const reducedMotion = useRef(false);
  const autoCaptureRef = useRef(true);
  const handsFreeRef = useRef(false);
  // Live page count for the detection loop (which closes over a stale `pages`).
  const pageCountRef = useRef(0);
  const captureRef = useRef<() => void>(() => {});
  const handsFreeCaptureRef = useRef<() => void>(() => {});

  const announce = useCallback((msg: string) => setAriaStatus(msg), []);

  // Keep refs that the rAF detection loop reads in sync with React state,
  // without re-creating the loop on every change.
  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);
  useEffect(() => {
    autoCaptureRef.current = autoCapture;
  }, [autoCapture]);
  useEffect(() => {
    handsFreeRef.current = handsFree;
  }, [handsFree]);
  useEffect(() => {
    pageCountRef.current = pages.length;
  }, [pages.length]);

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

  // Discard a queued/failed local draft. Only removes the LOCAL draft from the
  // encrypted IndexedDB queue — already-uploaded server files are never touched.
  const discardQueued = useCallback(
    async (id: string) => {
      try {
        await removeScan(id);
        await refreshQueue();
        showToast("Scan discarded.", "info");
      } catch {
        showToast("Couldn't discard that scan. Please try again.", "error");
      }
    },
    [refreshQueue, showToast],
  );

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
          // Live framing coaching from the detected quad (in detect-canvas
          // coordinates). Cleared once the page is well framed.
          const framing = assessFraming(found, dw, dh);
          setCoaching(
            framing.state === "ready" ? null : FRAMING_COPY[framing.state],
          );
          const aligned = tiltRef.current === "level" || tiltRef.current === "slight";
          setDetection(aligned ? "hold-steady" : "detected");
          const refocusing = now < focusingUntilRef.current;
          if (refocusing) {
            stableSinceRef.current = null;
            setHoldProgress(0);
          } else if ((autoCaptureRef.current || handsFreeRef.current) && aligned) {
            if (stableSinceRef.current == null) stableSinceRef.current = now;
            const held = now - stableSinceRef.current;
            setHoldProgress(Math.min(1, held / AUTO_CAPTURE_MS));
            if (held >= AUTO_CAPTURE_MS) {
              stableSinceRef.current = null;
              setHoldProgress(0);
              if (handsFreeRef.current) {
                // Commit this page and keep the camera running for the next
                // one (a cooldown inside prevents an immediate double-capture).
                handsFreeCaptureRef.current();
              } else {
                captureRef.current();
                return;
              }
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
          setCoaching(null);
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

  // Hands-free batch capture: freeze the current frame, warp/crop it with the
  // live-detected quad, and commit it straight into the page list WITHOUT
  // leaving the camera — so the user can keep laying down pages one after
  // another. A short cooldown (reusing the focus-suppression window the loop
  // already honors) stops a single page from being captured twice.
  const handsFreeCapture = useCallback(() => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    if (pageCountRef.current >= MAX_PAGES) {
      setHandsFree(false);
      showToast(`A scan can hold up to ${MAX_PAGES} pages.`, "info");
      return;
    }
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);

    const pageQuad: Quad = detectedQuadRef.current ?? fullQuad(canvas);
    const cv = cvRef.current;
    let base: HTMLCanvasElement;
    try {
      base = cv ? warpToCanvas(cv, canvas, pageQuad) : cropBoundingBox(canvas, pageQuad);
    } catch {
      base = cropBoundingBox(canvas, pageQuad);
    }
    const page: ScanPage = {
      id: makeId(),
      frozen: canvas,
      quad: pageQuad,
      base,
      filterId,
      adjust: NEUTRAL_ADJUST,
      thumb: makeThumbnail(base, filterId, NEUTRAL_ADJUST),
    };
    setPages((prev) => (prev.length >= MAX_PAGES ? prev : [...prev, page]));

    haptic([40]);
    if (!reducedMotion.current) {
      setFlash(true);
      window.setTimeout(() => setFlash(false), 180);
    }
    announce("Page captured");
    // Quiet period before the next auto-capture so one page isn't double-shot.
    stableSinceRef.current = null;
    setHoldProgress(0);
    focusingUntilRef.current = performance.now() + 1500;
  }, [announce, filterId, showToast]);

  useEffect(() => {
    handsFreeCaptureRef.current = handsFreeCapture;
  }, [handsFreeCapture]);

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

  // Tap-to-focus: drive the lens toward the tapped point and pause auto-capture
  // briefly so it doesn't fire while the lens is still hunting. Coordinates are
  // normalized (0..1); the overlay shows the ring optimistically either way.
  const focusAtPoint = useCallback((nx: number, ny: number) => {
    focusingUntilRef.current = performance.now() + 900;
    stableSinceRef.current = null;
    const track = cameraRef.current?.track;
    if (track) void focusAt(track, nx, ny);
  }, []);

  const handleClose = useCallback(() => {
    stopEverything();
    onClose();
  }, [onClose, stopEverything]);

  // Land the user on the exact file they just saved (File Inbox opens its
  // preview via the ?file= deep link). Falls back to a plain close if we have
  // no id yet (e.g. an offline scan that is still queued).
  const viewSavedFile = useCallback(() => {
    stopEverything();
    if (savedFileId !== null) {
      router.push(`/dashboard/files?file=${savedFileId}`);
    } else {
      onClose();
    }
  }, [onClose, router, savedFileId, stopEverything]);

  // Whether a gated tool/connector is available to this viewer. Defaults to
  // hidden if the map hasn't loaded or the key is unknown.
  const featureEnabled = useCallback(
    (key: string) => features[key]?.enabled ?? false,
    [features],
  );

  // Continue the just-saved scan into the SafeSend wizard with the
  // file preselected. No share/link is created here — the wizard owns all access
  // decisions and requires explicit confirmation.
  const shareSafely = useCallback(() => {
    if (savedFileId === null) return;
    stopEverything();
    router.push(`/dashboard/quick-share/new?file=${savedFileId}`);
  }, [router, savedFileId, stopEverything]);

  // Take the user to the bundles area to organize this scan into an application
  // pack. The scan is already saved in File Inbox; deep one-tap linking into a
  // specific requirement is intentionally deferred (see backlog), so we route
  // honestly rather than imply the file was auto-added.
  const addToBundle = useCallback(() => {
    stopEverything();
    router.push("/dashboard/bundles");
  }, [router, stopEverything]);

  // Help the user track an expiry/renewal for this scan. Reminders are derived
  // from a document's expiry date, so we route to the saved file in File Inbox
  // with reminder intent, which focuses the expiry field on its "create
  // document" form. No fake auto-extraction — the user enters the date.
  const addReminder = useCallback(() => {
    if (savedFileId === null) return;
    stopEverything();
    router.push(`/dashboard/files?file=${savedFileId}&intent=reminder`);
  }, [router, savedFileId, stopEverything]);

  // Open the prepared copy (a distinct inbox file) in File Inbox.
  const viewCopy = useCallback(() => {
    if (copySavedFileId === null) return;
    stopEverything();
    router.push(`/dashboard/files?file=${copySavedFileId}`);
  }, [copySavedFileId, router, stopEverything]);

  // Resolve which advanced connectors this viewer may see. setState lands in the
  // async .then (never synchronously in the effect body); failure leaves every
  // gated connector hidden, which is the safe default.
  useEffect(() => {
    let active = true;
    getFeatureMap()
      .then((map) => {
        if (active) setFeatures(map.features);
      })
      .catch(() => {
        /* keep connectors hidden if availability can't be resolved */
      });
    return () => {
      active = false;
    };
  }, []);

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
  // Import an existing PDF: rasterize every page, keep all but the last as
  // committed pages, and land the last one in review — so the imported document
  // flows into the same multi-page save / prepare-copy tools as a fresh scan.
  const importPdf = useCallback(
    async (file: File) => {
      setBusy(true);
      setProgress("Reading PDF…");
      announce("Reading PDF");
      try {
        let canvases = await rasterizePdf(await file.arrayBuffer());
        if (canvases.length === 0) throw new Error("empty");
        if (canvases.length > MAX_PAGES) {
          canvases = canvases.slice(0, MAX_PAGES);
          showToast(`Imported the first ${MAX_PAGES} pages.`, "info");
        }
        const last = canvases[canvases.length - 1];
        setPages(
          canvases.slice(0, -1).map((canvas) => ({
            id: makeId(),
            frozen: canvas,
            quad: fullQuad(canvas),
            base: canvas,
            filterId: DEFAULT_FILTER,
            adjust: NEUTRAL_ADJUST,
            thumb: makeThumbnail(canvas, DEFAULT_FILTER, NEUTRAL_ADJUST),
          })),
        );
        setEditingIndex(null);
        baseCanvasRef.current = last;
        const filtered = applyFilter(last, DEFAULT_FILTER);
        filteredBaseRef.current = filtered;
        setFrozenCanvas(last);
        setQuad(fullQuad(last));
        setFilterId(DEFAULT_FILTER);
        setAdjust(NEUTRAL_ADJUST);
        setEnhancedCanvas(applyAdjustments(filtered, NEUTRAL_ADJUST));
        setWarnings([]);
        setPdfSize(null);
        setPhase("enhancing");
        announce(
          `Imported ${canvases.length} page${canvases.length === 1 ? "" : "s"}`,
        );
      } catch {
        showToast("Couldn't import that PDF.", "error");
      } finally {
        setBusy(false);
        setProgress(null);
      }
    },
    [announce, showToast],
  );

  const onImportFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type === "application/pdf") {
      e.target.value = "";
      if (!featureEnabled("scan_pdf_import")) {
        showToast("PDF import isn't available yet.", "info");
        return;
      }
      void importPdf(file);
      return;
    }
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
  }, [announce, featureEnabled, importPdf, showToast]);

  // ---- apply warp, then non-destructive filters ------------------------
  // Warp/crop the captured frame ONCE into a base canvas; filters and rotation
  // are always re-derived from that base so nothing compounds or degrades.
  const buildBase = useCallback((): HTMLCanvasElement | null => {
    if (!frozenCanvas || !quad) return null;
    const cv = cvRef.current;
    return cv
      ? warpToCanvas(cv, frozenCanvas, quad)
      : cropBoundingBox(frozenCanvas, quad);
  }, [frozenCanvas, quad]);

  const applyCrop = useCallback(() => {
    if (!frozenCanvas || !quad) return;
    setBusy(true);
    announce("Processing scan");
    window.setTimeout(() => {
      try {
        const base = buildBase();
        if (!base) throw new Error("warp failed");
        baseCanvasRef.current = base;
        const filtered = applyFilter(base, filterId);
        filteredBaseRef.current = filtered;
        setEnhancedCanvas(applyAdjustments(filtered, adjust));
        setWarnings(analyzeCanvasQuality(base));
        setOcr(null);
        setOcrOpen(false);
        setPdfSize(null);
        setPhase("enhancing");
        announce("Scan ready to review");
      } catch {
        showToast("We couldn't process that scan. Try retaking it.", "error");
      } finally {
        setBusy(false);
      }
    }, 30);
  }, [adjust, announce, buildBase, filterId, frozenCanvas, quad, showToast]);

  // Switch filters live. Re-derives from the untouched base (non-destructive),
  // re-applies the current manual adjustments, and falls back to Original with a
  // friendly message if a filter throws.
  const changeFilter = useCallback(
    (id: FilterId) => {
      setFilterId(id);
      setMoreOpen(false);
      setPdfSize(null);
      const base = baseCanvasRef.current;
      if (!base) return;
      try {
        const filtered = applyFilter(base, id);
        filteredBaseRef.current = filtered;
        setEnhancedCanvas(applyAdjustments(filtered, adjust));
      } catch {
        setFilterId("original");
        const filtered = applyFilter(base, "original");
        filteredBaseRef.current = filtered;
        setEnhancedCanvas(applyAdjustments(filtered, adjust));
        showToast(
          "That filter couldn't be applied. We kept the original scan.",
          "error",
        );
      }
    },
    [adjust, showToast],
  );

  // Select a scan mode (a preset over filter + export quality). Safe to call in
  // the live camera phase, where there is no base canvas yet: it just sets the
  // intended filter/quality, which capture → applyCrop then apply on the frozen
  // frame. Re-used by the live overlay strip and the review screen.
  const selectScanMode = useCallback((mode: ScanMode) => {
    setScanMode(mode.id);
    setFilterId(mode.filterId);
    setExportQuality(mode.quality);
    const base = baseCanvasRef.current;
    if (!base) return;
    // In review, a base already exists — re-derive the preview non-destructively.
    try {
      const filtered = applyFilter(base, mode.filterId);
      filteredBaseRef.current = filtered;
      setEnhancedCanvas(applyAdjustments(filtered, adjust));
      setPdfSize(null);
    } catch {
      /* leave the current preview if the preset filter can't be applied */
    }
  }, [adjust]);

  // Clear the chosen scan mode and return to the neutral default look. Mirrors
  // selectScanMode so the strip has an honest "no preset" state.
  const clearScanMode = useCallback(() => {
    setScanMode(null);
    setFilterId(DEFAULT_FILTER);
    setExportQuality("standard");
    const base = baseCanvasRef.current;
    if (!base) return;
    try {
      const filtered = applyFilter(base, DEFAULT_FILTER);
      filteredBaseRef.current = filtered;
      setEnhancedCanvas(applyAdjustments(filtered, adjust));
      setPdfSize(null);
    } catch {
      /* leave the current preview if the default filter can't be applied */
    }
  }, [adjust]);

  // Live brightness/contrast: only re-runs a cheap LUT pass on the cached
  // filtered base, so dragging stays smooth even on large captures.
  const onAdjustChange = useCallback((next: Adjustments) => {
    setAdjust(next);
    setPdfSize(null);
    const filtered = filteredBaseRef.current;
    if (filtered) setEnhancedCanvas(applyAdjustments(filtered, next));
  }, []);

  // ---- OCR (on-device text extraction) ---------------------------------
  // Reads text from the page currently in review using Tesseract.js, entirely
  // in the browser (the image never leaves the device). User-triggered; the
  // result is shown for copy / use-as-name and never auto-applied.
  const runOcr = useCallback(async () => {
    if (!enhancedCanvas) return;
    setOcrOpen(true);
    setOcrBusy(true);
    setOcr(null);
    setOcrStatus("Starting…");
    announce("Extracting text");
    try {
      const result = await recognizeText(enhancedCanvas, (p) => {
        if (p.status === "recognizing text") setOcrStatus("Reading text…");
        else if (p.status.includes("load") || p.status.includes("initiali"))
          setOcrStatus("Loading text engine…");
      });
      setOcr(result);
      setOcrStatus(null);
      announce(hasUsableText(result) ? "Text extracted" : "No text found");
    } catch {
      setOcrStatus(null);
      showToast("Couldn't read text from this page.", "error");
    } finally {
      setOcrBusy(false);
    }
  }, [announce, enhancedCanvas, showToast]);

  const copyOcrText = useCallback(async () => {
    if (!ocr) return;
    try {
      await navigator.clipboard.writeText(ocr.text);
      showToast("Text copied to clipboard.", "success");
    } catch {
      showToast("Couldn't copy. Select and copy the text manually.", "error");
    }
  }, [ocr, showToast]);

  const useOcrAsName = useCallback(() => {
    if (!ocr) return;
    const firstLine = ocr.text
      .split("\n")
      .map((l) => l.trim())
      .find((l) => l.length > 0);
    if (!firstLine) return;
    setDocName(firstLine.slice(0, 80));
    setSaveOptionsOpen(true);
    showToast("Used the first text line as the document name.", "info");
  }, [ocr, showToast]);

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
  // All committed pages (rendered with their own filter), with the page on
  // screen now inserted at its slot (when re-editing) or appended. Shared by
  // the normal save and the "prepare copy" flow so they stay identical.
  const buildPageCanvases = useCallback((): HTMLCanvasElement[] => {
    const canvases = pages.map((p) => renderPage(p.base, p.filterId, p.adjust));
    if (enhancedCanvas) {
      if (editingIndex !== null && editingIndex <= canvases.length) {
        canvases.splice(editingIndex, 0, enhancedCanvas);
      } else {
        canvases.push(enhancedCanvas);
      }
    }
    return canvases;
  }, [pages, enhancedCanvas, editingIndex]);

  const saveAndUpload = useCallback(async () => {
    const canvases = buildPageCanvases();
    if (canvases.length === 0) return;
    setBusy(true);
    setProgress("Preparing PDF…");
    announce("Generating PDF");
    let blob: Blob;
    try {
      blob = await generatePdfBlob(canvases, {
        quality: exportQuality === "hd" ? 0.92 : 0.72,
      });
      setPdfSize(blob.size);
    } catch {
      setBusy(false);
      setProgress(null);
      showToast("PDF generation failed. Please try again.", "error");
      return;
    }

    const filename = `${buildScanBasename(docName)}.pdf`;

    if (!online) {
      setProgress("Saving offline…");
      await enqueueScan(blob, filename);
      await requestBackgroundFlush();
      await refreshQueue();
      setBusy(false);
      setProgress(null);
      setPhase("done");
      showToast(
        "You are offline. Scan saved locally and will upload when connection returns.",
        "info",
      );
      announce("Scan queued for upload when online");
      return;
    }

    try {
      setProgress("Uploading…");
      const result = await uploadScan(blob, filename);
      setSavedFileId(result.document_id);
      setBusy(false);
      setProgress(null);
      setPhase("done");
      showToast(
        canvases.length > 1
          ? `${canvases.length}-page scan saved to your File Inbox.`
          : "Scan saved to your File Inbox.",
        "success",
      );
      announce("Upload complete");
    } catch (err) {
      await enqueueScan(blob, filename);
      await refreshQueue();
      setBusy(false);
      setProgress(null);
      setPhase("done");
      const message = (err as Error).message || "Upload failed.";
      showToast(`${message} Saved locally to retry.`, "error");
      announce("Scan queued for upload when online");
    }
  }, [announce, buildPageCanvases, docName, exportQuality, online, refreshQueue, showToast]);

  // Create a prepared *copy* of the current scan as a new inbox file, with an
  // optional burned-in watermark. The original saved scan is never touched.
  const createPreparedCopy = useCallback(
    async (opts: PreparedCopyOptions) => {
      const all = buildPageCanvases();
      const chosen = opts.selectedIndices
        ? opts.selectedIndices.map((i) => all[i]).filter(Boolean)
        : all;
      if (chosen.length === 0) return;
      const watermark = opts.watermark;
      setBusy(true);
      setProgress(watermark ? "Adding watermark…" : "Preparing copy…");
      announce(watermark ? "Adding watermark" : "Preparing copy");
      try {
        const pagesOut = watermark
          ? chosen.map((c) => applyWatermark(c, watermark))
          : chosen;
        const blob = await generatePdfBlob(pagesOut, { quality: opts.quality });
        setProgress("Uploading…");
        const result = await uploadScan(
          blob,
          `${buildScanBasename(docName)}-copy.pdf`,
        );
        setCopySavedFileId(result.document_id);
        setCopySavedSize(blob.size);
        setPrepareCopyOpen(false);
        setBusy(false);
        setProgress(null);
        showToast("Saved as a new copy. Your original is unchanged.", "success");
        announce("Copy saved");
      } catch {
        setBusy(false);
        setProgress(null);
        showToast(
          "Couldn't create the copy. Your original is unchanged.",
          "error",
        );
      }
    },
    [announce, buildPageCanvases, docName, showToast],
  );

  // Snapshot the current pages and open the redaction editor.
  const openRedaction = useCallback(() => {
    const canvases = buildPageCanvases();
    if (canvases.length === 0) return;
    setRedactPages(canvases);
    setRedactOpen(true);
  }, [buildPageCanvases]);

  // Burn the chosen rectangles into each page (opaque, non-recoverable) and
  // upload the result as a new redacted copy. Original is never modified.
  const createRedactedCopy = useCallback(
    async (rectsPerPage: RedactionRect[][]) => {
      const source = redactPages;
      if (!source || source.length === 0) return;
      setBusy(true);
      setProgress("Creating redacted copy…");
      announce("Creating redacted copy");
      try {
        const pagesOut = source.map((c, i) =>
          applyRedactions(c, rectsPerPage[i] ?? []),
        );
        const blob = await generatePdfBlob(pagesOut, {
          quality: exportQuality === "hd" ? 0.92 : 0.72,
        });
        setProgress("Uploading…");
        const result = await uploadScan(
          blob,
          `${buildScanBasename(docName)}-redacted.pdf`,
        );
        setCopySavedFileId(result.document_id);
        setCopySavedSize(blob.size);
        setRedactOpen(false);
        setRedactPages(null);
        setBusy(false);
        setProgress(null);
        showToast(
          "Redacted copy created. Your original is unchanged.",
          "success",
        );
        announce("Redacted copy created");
      } catch {
        setBusy(false);
        setProgress(null);
        showToast(
          "Couldn't create the redacted copy. Your original is unchanged.",
          "error",
        );
      }
    },
    [announce, docName, exportQuality, redactPages, showToast],
  );

  // ---- navigation helpers ----------------------------------------------
  const goToCamera = useCallback(() => {
    setDetection("searching");
    setPhase("camera");
    setMoreOpen(false);
    stableSinceRef.current = null;
    rafRef.current = requestAnimationFrame(runDetection);
    announce("Camera ready");
  }, [announce, runDetection]);

  // Clear the in-progress capture (NOT the committed pages or the document name).
  const resetCurrentCapture = useCallback(() => {
    setFrozenCanvas(null);
    setEnhancedCanvas(null);
    baseCanvasRef.current = null;
    filteredBaseRef.current = null;
    setWarnings([]);
    setOcr(null);
    setOcrOpen(false);
    setOcrStatus(null);
    setFilterId(DEFAULT_FILTER);
    setAdjust(NEUTRAL_ADJUST);
    setAdjustOpen(false);
    setSaveOptionsOpen(false);
    setQuad(null);
  }, []);

  // Re-shoot the current page; committed pages and the document name are kept.
  const retake = useCallback(() => {
    resetCurrentCapture();
    goToCamera();
  }, [goToCamera, resetCurrentCapture]);

  // ---- multi-page -------------------------------------------------------
  // Commit the current working page into the page list. When re-editing, it
  // returns to its original slot; otherwise it is appended. Returns false if the
  // page limit is reached. Does NOT navigate (callers decide what to do next).
  const commitCurrentPage = useCallback((): boolean => {
    const base = baseCanvasRef.current;
    const frozen = frozenCanvas;
    if (!base || !frozen || !quad) return false;
    if (editingIndex === null && pages.length + 1 >= MAX_PAGES) {
      showToast(`A scan can hold up to ${MAX_PAGES} pages.`, "info");
      return false;
    }
    const page: ScanPage = {
      id:
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : `page-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      frozen,
      quad,
      base,
      filterId,
      adjust,
      thumb: makeThumbnail(base, filterId, adjust),
    };
    const slot = editingIndex;
    setPages((prev) => {
      if (slot !== null && slot <= prev.length) {
        const next = [...prev];
        next.splice(slot, 0, page);
        return next;
      }
      return [...prev, page];
    });
    setEditingIndex(null);
    return true;
  }, [adjust, editingIndex, filterId, frozenCanvas, pages.length, quad, showToast]);

  // Commit the current page and capture another into the same document/PDF.
  const addPage = useCallback(() => {
    if (!commitCurrentPage()) return;
    announce("Page added");
    resetCurrentCapture();
    // Resume live capture if the camera is running; otherwise (import-only flow)
    // return to the idle screen so the user can import the next page.
    if (cameraRef.current) {
      goToCamera();
    } else {
      setMoreOpen(false);
      setPhase("idle");
    }
  }, [announce, commitCurrentPage, goToCamera, resetCurrentCapture]);

  // Re-open a committed page to re-crop / re-rotate / re-filter / re-adjust. It
  // is pulled out of the list (remembering its slot) and loaded as the working
  // page; committing later drops it back into the same position.
  const startEditPage = useCallback(
    (index: number) => {
      const p = pages[index];
      if (!p) return;
      setPages((prev) => prev.filter((_, i) => i !== index));
      setEditingIndex(index);
      setFrozenCanvas(p.frozen);
      setQuad(p.quad);
      setFilterId(p.filterId);
      setAdjust(p.adjust);
      baseCanvasRef.current = p.base;
      const filtered = applyFilter(p.base, p.filterId);
      filteredBaseRef.current = filtered;
      setEnhancedCanvas(applyAdjustments(filtered, p.adjust));
      setWarnings(analyzeCanvasQuality(p.base));
      setOcr(null);
      setOcrOpen(false);
      setMoreOpen(false);
      setPdfSize(null);
      setPhase("enhancing");
      announce(`Editing page ${index + 1}`);
    },
    [announce, pages],
  );

  // Stop hands-free batching and move into the standard review/save screen with
  // every captured page present. The last committed page becomes the working
  // page (the rest stay in the page strip), so save / add / re-edit all work
  // exactly as they do after a normal multi-page scan.
  const finishHandsFree = useCallback(() => {
    setHandsFree(false);
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    if (pages.length > 0) startEditPage(pages.length - 1);
  }, [pages.length, startEditPage]);

  // Back to the corner editor for the current page (re-crop). Frozen frame and
  // quad are still in state, so this works for fresh captures and re-edits alike.
  const editCrop = useCallback(() => {
    if (!frozenCanvas || !quad) return;
    setMoreOpen(false);
    setPhase("cropping");
    announce("Adjust the document corners");
  }, [announce, frozenCanvas, quad]);

  const removePage = useCallback((index: number) => {
    setPages((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const movePage = useCallback((index: number, dir: -1 | 1) => {
    setPages((prev) => {
      const j = index + dir;
      if (j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[j]] = [next[j], next[index]];
      return next;
    });
  }, []);

  // Apply the current filter to every committed page (supports_batch_apply).
  const applyFilterToAllPages = useCallback(() => {
    setPages((prev) =>
      prev.map((p) => ({
        ...p,
        filterId,
        thumb: makeThumbnail(p.base, filterId, p.adjust),
      })),
    );
    showToast("Filter applied to all pages.", "success");
  }, [filterId, showToast]);

  // Start a brand-new document (clears committed pages + name). Used after save.
  const scanAnother = useCallback(() => {
    setPages([]);
    setDocName("");
    setEditingIndex(null);
    setSavedFileId(null);
    setCopySavedFileId(null);
    setCopySavedSize(null);
    setRedactOpen(false);
    setRedactPages(null);
    retake();
  }, [retake]);

  // Rotate the captured page 90° clockwise during cropping. Rotating the actual
  // source canvas (not just re-ordering quad corners) makes the change visible
  // immediately and persists it through both the OpenCV warp and the
  // bounding-box fallback. The quad is re-mapped so the crop selection is kept.
  const rotateCrop = useCallback(() => {
    if (!frozenCanvas) return;
    const h = frozenCanvas.height;
    setQuad((prev) =>
      prev ? (prev.map((p) => ({ x: h - p.y, y: p.x })) as Quad) : prev,
    );
    setFrozenCanvas(rotateCanvas90(frozenCanvas, true));
    haptic(20);
    announce("Rotated 90 degrees");
  }, [announce, frozenCanvas]);

  // Rotate the final enhanced preview. This updates the visible canvas (via the
  // repaint effect) and the saved/uploaded PDF, since both read enhancedCanvas.
  const rotatePreview = useCallback(
    (clockwise: boolean) => {
      // Rotate the base too, so switching filters after a rotation keeps the
      // orientation instead of snapping back to the un-rotated capture.
      const base = baseCanvasRef.current;
      if (base) {
        const rotated = rotateCanvas90(base, clockwise);
        baseCanvasRef.current = rotated;
        const filtered = applyFilter(rotated, filterId);
        filteredBaseRef.current = filtered;
        setEnhancedCanvas(applyAdjustments(filtered, adjust));
      } else {
        setEnhancedCanvas((prev) => (prev ? rotateCanvas90(prev, clockwise) : prev));
      }
      setPdfSize(null);
      haptic(20);
      announce(clockwise ? "Rotated right" : "Rotated left");
    },
    [adjust, announce, filterId],
  );

  // ---- edge-detection fallbacks (cropping phase) -----------------------
  // Stretch the crop to the entire frame — a one-tap escape from bad detection.
  const useFullImage = useCallback(() => {
    const c = frozenCanvas;
    if (!c) return;
    setQuad([
      { x: 0, y: 0 },
      { x: c.width, y: 0 },
      { x: c.width, y: c.height },
      { x: 0, y: c.height },
    ]);
    announce("Using the full image");
  }, [announce, frozenCanvas]);

  // Re-run edge detection on the captured frame (downscaled for speed).
  const retryDetect = useCallback(() => {
    const c = frozenCanvas;
    const cv = cvRef.current;
    if (!c) return;
    if (!cv) {
      showToast("Edge detection is still loading. Adjust the corners manually.", "info");
      return;
    }
    const scale = Math.min(1, 900 / c.width);
    const small = document.createElement("canvas");
    small.width = Math.round(c.width * scale);
    small.height = Math.round(c.height * scale);
    small.getContext("2d")?.drawImage(c, 0, 0, small.width, small.height);
    let found: Quad | null = null;
    try {
      found = detectQuadFromCanvas(cv, small);
    } catch {
      found = null;
    }
    if (found) {
      setQuad(found.map((p) => ({ x: p.x / scale, y: p.y / scale })) as Quad);
      haptic(20);
      showToast("Edges detected.", "success");
      announce("Edges detected");
    } else {
      showToast("Edges weren't found. Adjust the corners or use the full image.", "info");
      announce("Edges not detected");
    }
  }, [announce, frozenCanvas, showToast]);

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
            onDiscard={discardQueued}
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
              coaching={coaching}
              tilt={tilt}
              holdProgress={holdProgress}
              torchOn={torchOn}
              torchAvailable={torchAvailable}
              caps={caps}
              voiceOn={voiceOn}
              autoCapture={autoCapture}
              handsFree={handsFree}
              handsFreeEnabled={featureEnabled("scan_hands_free")}
              pageCount={pages.length}
              cvReady={cvReady}
              onToggleTorch={toggleTorch}
              onToggleVoice={toggleVoice}
              onToggleAuto={() => setAutoCapture((v) => !v)}
              onToggleHandsFree={() => setHandsFree((v) => !v)}
              onFinishHandsFree={finishHandsFree}
              onCapture={capture}
              onImport={() => fileInputRef.current?.click()}
              scanMode={scanMode}
              scanModesEnabled={featureEnabled("scan_modes")}
              onSelectMode={selectScanMode}
              onClearMode={clearScanMode}
              onFocusPoint={focusAtPoint}
            />
          )}
        </div>

        {phase === "cropping" && frozenCanvas && quad && (
          <div className="flex h-full flex-col">
            {/* Extra horizontal/bottom room so the corner handles, which extend
                ~22px beyond the image edges, never sit clipped or hidden behind
                the action bar — especially the bottom corners on a tall scan. */}
            <div className="flex-1 overflow-auto px-6 pt-4 pb-12">
              <p className="mb-3 text-center text-sm text-slate-300">
                Drag the corners to match the document edges.
              </p>
              <CropEditor source={frozenCanvas} quad={quad} onQuadChange={setQuad} />
            </div>
            <div className="space-y-3 border-t border-white/10 bg-slate-950/80 p-4 backdrop-blur-md">
              {/* Edge-detection escape hatches: subtle links, never competing
                  with the one obvious way forward. */}
              <div className="flex items-center justify-center gap-4 text-xs">
                <button
                  type="button"
                  onClick={retryDetect}
                  className="inline-flex items-center gap-1.5 text-teal-300 hover:underline focus-visible:ring-2 focus-visible:ring-teal-300 focus-visible:outline-none"
                >
                  <ScanSearch className="size-3.5" aria-hidden="true" /> Retry detection
                </button>
                <button
                  type="button"
                  onClick={() => frozenCanvas && resetQuad(frozenCanvas, setQuad)}
                  className="text-slate-300 hover:underline focus-visible:ring-2 focus-visible:ring-teal-300 focus-visible:outline-none"
                >
                  Reset corners
                </button>
              </div>
              {/* Alternative actions — subordinate to the primary below. */}
              <div className="grid grid-cols-3 gap-2">
                <Button variant="outline" size="sm" onClick={retake} className="border-white/20 bg-white/5 text-slate-100 hover:bg-white/10">
                  <RefreshCw className="size-4" aria-hidden="true" /> Retake
                </Button>
                <Button variant="outline" size="sm" onClick={rotateCrop} className="border-white/20 bg-white/5 text-slate-100 hover:bg-white/10">
                  <RotateCw className="size-4" aria-hidden="true" /> Rotate
                </Button>
                <Button variant="outline" size="sm" onClick={useFullImage} className="border-white/20 bg-white/5 text-slate-100 hover:bg-white/10">
                  <Maximize className="size-4" aria-hidden="true" /> Full image
                </Button>
              </div>
              {/* Primary — one obvious way forward. */}
              <Button onClick={applyCrop} disabled={busy} size="lg" className="w-full bg-teal-500 text-slate-950 hover:bg-teal-400">
                {busy ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Check className="size-4" aria-hidden="true" />}
                Looks good
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
            <div className="max-h-[62vh] space-y-3 overflow-y-auto border-t border-white/10 bg-slate-950/80 p-4 backdrop-blur-md">
              {warnings.length > 0 && (
                <div className="space-y-1.5">
                  {warnings.map((w) => (
                    <p
                      key={w.id}
                      className={cn(
                        "flex items-start gap-1.5 rounded-lg px-2.5 py-1.5 text-xs",
                        w.severity === "warn"
                          ? "bg-amber-500/15 text-amber-200"
                          : "bg-white/5 text-slate-300",
                      )}
                    >
                      <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                      <span>{w.message}</span>
                    </p>
                  ))}
                </div>
              )}
              {warnings.length === 0 && (
                <p className="flex items-center justify-center gap-1.5 text-xs text-teal-300">
                  <Check className="size-3.5" aria-hidden="true" /> Looks clear — ready to save
                </p>
              )}
              {featureEnabled("scan_modes") && (
                <div className="space-y-1">
                  <div
                    className="-mx-1 flex items-center gap-2 overflow-x-auto px-1 pb-1"
                    role="group"
                    aria-label="Scan mode"
                  >
                    <button
                      type="button"
                      onClick={clearScanMode}
                      aria-pressed={scanMode === null}
                      className={cn(
                        "inline-flex shrink-0 items-center rounded-full px-3 py-1.5 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:ring-teal-300 focus-visible:outline-none",
                        scanMode === null
                          ? "bg-teal-500/20 text-teal-100 ring-1 ring-teal-400/60"
                          : "bg-white/5 text-slate-200 hover:bg-white/10",
                      )}
                    >
                      None
                    </button>
                    {SCAN_MODES.map((mode) => (
                      <button
                        key={mode.id}
                        type="button"
                        onClick={() => selectScanMode(mode)}
                        aria-pressed={scanMode === mode.id}
                        className={cn(
                          "inline-flex shrink-0 items-center rounded-full px-3 py-1.5 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:ring-teal-300 focus-visible:outline-none",
                          scanMode === mode.id
                            ? "bg-teal-500/20 text-teal-100 ring-1 ring-teal-400/60"
                            : "bg-white/5 text-slate-200 hover:bg-white/10",
                        )}
                      >
                        {mode.label}
                      </button>
                    ))}
                  </div>
                  {scanMode !== null && (
                    <p className="text-center text-[0.7rem] text-slate-500">
                      {SCAN_MODES.find((m) => m.id === scanMode)?.hint}
                    </p>
                  )}
                </div>
              )}
              {pdfSize != null && (
                <p className="text-center text-xs text-slate-400">PDF size: {formatBytes(pdfSize)}</p>
              )}
              {/* Multi-page strip: reorder/delete committed pages → one PDF. */}
              {pages.length > 0 && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-slate-300">
                      {pages.length + 1} pages in this scan
                    </span>
                    <button
                      type="button"
                      onClick={applyFilterToAllPages}
                      className="text-xs text-teal-300 hover:underline focus-visible:ring-2 focus-visible:ring-teal-300 focus-visible:outline-none"
                    >
                      Apply filter to all
                    </button>
                  </div>
                  <ul className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
                    {pages.map((p, i) => (
                      <li key={p.id} className="shrink-0">
                        <div className="relative">
                          <button
                            type="button"
                            onClick={() => startEditPage(i)}
                            aria-label={`Edit page ${i + 1}`}
                            className="block rounded-md focus-visible:ring-2 focus-visible:ring-teal-300 focus-visible:outline-none"
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={p.thumb}
                              alt={`Page ${i + 1}`}
                              className="h-20 w-16 rounded-md object-cover ring-1 ring-white/15"
                            />
                          </button>
                          <span className="pointer-events-none absolute left-1 top-1 rounded bg-black/60 px-1 text-[0.6rem] font-medium text-white">
                            {i + 1}
                          </span>
                          <span className="pointer-events-none absolute inset-x-1 bottom-1 truncate rounded bg-black/60 px-1 text-center text-[0.55rem] font-medium text-slate-100">
                            {getFilterMeta(p.filterId).label}
                          </span>
                          <button
                            type="button"
                            onClick={() => removePage(i)}
                            aria-label={`Delete page ${i + 1}`}
                            className="absolute -right-1 -top-1 rounded-full bg-slate-900 p-0.5 text-slate-200 ring-1 ring-white/20 hover:text-white focus-visible:ring-2 focus-visible:ring-teal-300 focus-visible:outline-none"
                          >
                            <X className="size-3" aria-hidden="true" />
                          </button>
                        </div>
                        <div className="mt-1 flex justify-center gap-1">
                          <button
                            type="button"
                            onClick={() => movePage(i, -1)}
                            disabled={i === 0}
                            aria-label={`Move page ${i + 1} left`}
                            className="rounded p-0.5 text-slate-300 hover:text-white disabled:opacity-30 focus-visible:ring-2 focus-visible:ring-teal-300 focus-visible:outline-none"
                          >
                            <ChevronLeft className="size-3.5" aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            onClick={() => movePage(i, 1)}
                            disabled={i === pages.length - 1}
                            aria-label={`Move page ${i + 1} right`}
                            className="rounded p-0.5 text-slate-300 hover:text-white disabled:opacity-30 focus-visible:ring-2 focus-visible:ring-teal-300 focus-visible:outline-none"
                          >
                            <ChevronRight className="size-3.5" aria-hidden="true" />
                          </button>
                        </div>
                      </li>
                    ))}
                    <li className="shrink-0">
                      <div className="flex h-20 w-16 items-center justify-center rounded-md bg-teal-500/10 px-1 text-center text-[0.6rem] font-medium text-teal-200 ring-1 ring-teal-400/60">
                        {editingIndex !== null
                          ? `Editing page ${editingIndex + 1}`
                          : `Page ${pages.length + 1}`}
                      </div>
                    </li>
                  </ul>
                </div>
              )}
              {/* Tool dock — per-page edits consolidated into one labeled-icon
                  row (like a camera editor), so the screen reads as
                  "preview → dock → Save" instead of a scrolling stack. Each
                  edit stays non-destructive (re-derived from the base). */}
              <div
                className="-mx-1 flex items-stretch justify-center gap-1 overflow-x-auto px-1"
                role="toolbar"
                aria-label="Edit tools"
              >
                <ToolDockButton
                  icon={<Wand2 className="size-5" aria-hidden="true" />}
                  label="Filter"
                  active={moreOpen}
                  dot={filterId !== DEFAULT_FILTER}
                  onClick={() => setMoreOpen(true)}
                />
                <ToolDockButton
                  icon={<SlidersHorizontal className="size-5" aria-hidden="true" />}
                  label="Adjust"
                  active={adjustOpen}
                  dot={!isNeutralAdjust(adjust)}
                  onClick={() => setAdjustOpen((v) => !v)}
                />
                <ToolDockButton
                  icon={<RotateCcw className="size-5" aria-hidden="true" />}
                  label="Rotate L"
                  onClick={() => rotatePreview(false)}
                />
                <ToolDockButton
                  icon={<RotateCw className="size-5" aria-hidden="true" />}
                  label="Rotate R"
                  onClick={() => rotatePreview(true)}
                />
                <ToolDockButton
                  icon={<Crop className="size-5" aria-hidden="true" />}
                  label="Crop"
                  onClick={editCrop}
                />
                {featureEnabled("scan_ocr") && (
                  <ToolDockButton
                    icon={<ScanText className="size-5" aria-hidden="true" />}
                    label="Text"
                    active={ocrOpen}
                    dot={ocr !== null}
                    onClick={() => {
                      if (ocrOpen) {
                        setOcrOpen(false);
                        return;
                      }
                      setOcrOpen(true);
                      if (!ocr && !ocrBusy) void runOcr();
                    }}
                  />
                )}
              </div>
              {/* Name & quality — one quiet trigger; first-time users can skip
                  it and just tap Save. */}
              <button
                type="button"
                onClick={() => setSaveOptionsOpen((v) => !v)}
                aria-expanded={saveOptionsOpen}
                className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-white/5 px-3 py-2 text-xs font-medium text-slate-300 hover:bg-white/10 hover:text-white focus-visible:ring-2 focus-visible:ring-teal-300 focus-visible:outline-none"
              >
                Name &amp; quality
                {(docName.trim() !== "" || exportQuality !== "standard") && (
                  <span className="size-1.5 rounded-full bg-teal-300" aria-hidden="true" />
                )}
                <ChevronDown
                  className={cn("size-3.5 transition-transform", saveOptionsOpen && "rotate-180")}
                  aria-hidden="true"
                />
              </button>
              {adjustOpen && (
                <div className="space-y-3 rounded-lg bg-white/5 p-3">
                  <AdjustSlider
                    label="Brightness"
                    value={adjust.brightness}
                    onChange={(v) => onAdjustChange({ ...adjust, brightness: v })}
                  />
                  <AdjustSlider
                    label="Contrast"
                    value={adjust.contrast}
                    onChange={(v) => onAdjustChange({ ...adjust, contrast: v })}
                  />
                  <AdjustSlider
                    label="Sharpness"
                    min={0}
                    value={adjust.sharpness}
                    onChange={(v) => onAdjustChange({ ...adjust, sharpness: v })}
                  />
                  <label className="flex items-center justify-between text-xs text-slate-300">
                    <span>Denoise</span>
                    <input
                      type="checkbox"
                      checked={adjust.denoise}
                      onChange={(e) =>
                        onAdjustChange({ ...adjust, denoise: e.target.checked })
                      }
                      className="size-4 accent-teal-400"
                    />
                  </label>
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() => onAdjustChange(NEUTRAL_ADJUST)}
                      disabled={isNeutralAdjust(adjust)}
                      className="text-xs text-teal-300 hover:underline disabled:opacity-40 focus-visible:ring-2 focus-visible:ring-teal-300 focus-visible:outline-none"
                    >
                      Reset adjustments
                    </button>
                  </div>
                </div>
              )}
              {featureEnabled("scan_ocr") && ocrOpen && (
                <div className="space-y-2 rounded-lg bg-white/5 p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-slate-200">
                      Extracted text
                    </span>
                    <button
                      type="button"
                      onClick={() => setOcrOpen(false)}
                      className="text-xs text-slate-400 hover:text-white focus-visible:ring-2 focus-visible:ring-teal-300 focus-visible:outline-none"
                    >
                      Hide
                    </button>
                  </div>
                  {ocrBusy ? (
                    <p className="flex items-center gap-2 text-xs text-slate-300">
                      <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                      {ocrStatus ?? "Reading…"}
                    </p>
                  ) : ocr ? (
                    hasUsableText(ocr) ? (
                      <div className="space-y-2">
                        <textarea
                          readOnly
                          value={ocr.text}
                          aria-label="Extracted text"
                          className="h-32 w-full resize-y rounded-lg border border-white/15 bg-slate-950/40 px-3 py-2 text-xs text-slate-100 focus-visible:border-teal-300 focus-visible:ring-2 focus-visible:ring-teal-300 focus-visible:outline-none"
                        />
                        {ocr.confidence < 60 && (
                          <p className="text-[0.7rem] text-amber-300">
                            Low confidence — please check the text before using it.
                          </p>
                        )}
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-[0.7rem] text-slate-500">
                            {ocr.confidence}% confidence · stays on your device
                          </span>
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={copyOcrText}
                              className="inline-flex items-center gap-1 rounded-lg bg-white/10 px-2.5 py-1 text-xs text-slate-100 hover:bg-white/20 focus-visible:ring-2 focus-visible:ring-teal-300 focus-visible:outline-none"
                            >
                              <Copy className="size-3.5" aria-hidden="true" /> Copy
                            </button>
                            <button
                              type="button"
                              onClick={useOcrAsName}
                              className="rounded-lg bg-white/10 px-2.5 py-1 text-xs text-slate-100 hover:bg-white/20 focus-visible:ring-2 focus-visible:ring-teal-300 focus-visible:outline-none"
                            >
                              Use as name
                            </button>
                            <button
                              type="button"
                              onClick={runOcr}
                              className="rounded-lg bg-white/10 px-2.5 py-1 text-xs text-slate-100 hover:bg-white/20 focus-visible:ring-2 focus-visible:ring-teal-300 focus-visible:outline-none"
                            >
                              Redo
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <p className="text-xs text-slate-400">
                          No readable text found on this page.
                        </p>
                        <button
                          type="button"
                          onClick={runOcr}
                          className="rounded-lg bg-white/10 px-2.5 py-1 text-xs text-slate-100 hover:bg-white/20 focus-visible:ring-2 focus-visible:ring-teal-300 focus-visible:outline-none"
                        >
                          Try again
                        </button>
                      </div>
                    )
                  ) : (
                    <button
                      type="button"
                      onClick={runOcr}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-teal-500/20 px-3 py-1.5 text-xs font-medium text-teal-100 ring-1 ring-teal-400/40 hover:bg-teal-500/30 focus-visible:ring-2 focus-visible:ring-teal-300 focus-visible:outline-none"
                    >
                      <ScanText className="size-4" aria-hidden="true" /> Extract text
                    </button>
                  )}
                </div>
              )}
              {saveOptionsOpen && (
                <div className="space-y-3 rounded-lg bg-white/5 p-3">
                  <input
                    type="text"
                    value={docName}
                    onChange={(e) => setDocName(e.target.value)}
                    placeholder="Document name (optional)"
                    aria-label="Document name"
                    enterKeyHint="done"
                    className="w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-base text-slate-100 placeholder:text-slate-400 focus-visible:border-teal-300 focus-visible:ring-2 focus-visible:ring-teal-300 focus-visible:outline-none sm:text-sm"
                  />
                  {featureEnabled("filename_templates") && (
                    <div className="space-y-1.5">
                      <div className="flex flex-wrap gap-1.5">
                        {FILENAME_TYPE_CHIPS.map((type) => (
                          <button
                            key={type}
                            type="button"
                            onClick={() =>
                              setDocName(suggestFilename(type, { withYear: true }))
                            }
                            className="rounded-full border border-white/15 px-2.5 py-1 text-xs text-slate-200 hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-teal-300 focus-visible:outline-none"
                          >
                            {type}
                          </button>
                        ))}
                      </div>
                      {docName.trim() !== "" && (
                        <p className="text-[0.7rem] text-slate-500">
                          Saves as {buildScanBasename(docName)}.pdf
                        </p>
                      )}
                    </div>
                  )}
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-slate-400">PDF quality</span>
                    <div
                      className="inline-flex rounded-full bg-white/10 p-0.5"
                      role="group"
                      aria-label="PDF quality"
                    >
                      {(["standard", "hd"] as const).map((q) => (
                        <button
                          key={q}
                          type="button"
                          onClick={() => setExportQuality(q)}
                          aria-pressed={exportQuality === q}
                          className={cn(
                            "rounded-full px-3 py-1 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:ring-teal-300 focus-visible:outline-none",
                            exportQuality === q
                              ? "bg-teal-500 text-slate-950"
                              : "text-slate-200 hover:text-white",
                          )}
                        >
                          {q === "standard" ? "Standard" : "HD"}
                        </button>
                      ))}
                    </div>
                  </div>
                  {exportQuality === "hd" && (
                    <p className="text-right text-[0.68rem] text-slate-400">
                      HD keeps more detail and may create a larger file.
                    </p>
                  )}
                </div>
              )}
              {/* Advanced copy tools, also reachable here in review — not only
                  after save. Founder-gated, so normal users never see them.
                  Each produces a NEW file and never alters the page you save. */}
              {featureEnabled("scanner_advanced_tools") &&
                (featureEnabled("scan_safe_copy") ||
                  featureEnabled("scan_redaction")) && (
                  <div className="flex flex-wrap items-center justify-center gap-2 border-t border-white/10 pt-3">
                    {featureEnabled("scan_safe_copy") && (
                      <button
                        type="button"
                        onClick={() => setPrepareCopyOpen(true)}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-white/5 px-3 py-2 text-xs font-medium text-slate-200 hover:bg-white/10 hover:text-white focus-visible:ring-2 focus-visible:ring-teal-300 focus-visible:outline-none"
                      >
                        <Copy className="size-4" aria-hidden="true" /> Prepare copy
                      </button>
                    )}
                    {featureEnabled("scan_redaction") && (
                      <button
                        type="button"
                        onClick={openRedaction}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-white/5 px-3 py-2 text-xs font-medium text-slate-200 hover:bg-white/10 hover:text-white focus-visible:ring-2 focus-visible:ring-teal-300 focus-visible:outline-none"
                      >
                        <EyeOff className="size-4" aria-hidden="true" /> Redact area
                      </button>
                    )}
                  </div>
                )}
              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" onClick={retake} className="border-white/20 bg-white/5 text-slate-100 hover:bg-white/10">
                  <RefreshCw className="size-4" aria-hidden="true" /> Retake
                </Button>
                <Button variant="outline" onClick={addPage} className="border-white/20 bg-white/5 text-slate-100 hover:bg-white/10">
                  <Plus className="size-4" aria-hidden="true" /> Add page
                </Button>
              </div>
              <Button
                onClick={saveAndUpload}
                disabled={busy}
                className="w-full bg-teal-500 text-slate-950 hover:bg-teal-400"
              >
                {busy ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Upload className="size-4" aria-hidden="true" />}
                {busy
                  ? (progress ?? "Saving…")
                  : online
                    ? pages.length > 0
                      ? `Save to Inbox (${pages.length + 1} pages)`
                      : "Save to Inbox"
                    : "Save offline"}
              </Button>
            </div>

            {moreOpen && (
              <MoreFiltersSheet
                activeId={filterId}
                onSelect={changeFilter}
                onClose={() => setMoreOpen(false)}
              />
            )}
          </div>
        )}

        {phase === "done" && (
          <div className="flex h-full flex-col items-center justify-center gap-5 p-8 text-center">
            <div className="flex size-16 items-center justify-center rounded-full bg-teal-500/15">
              <Check className="size-8 text-teal-300" aria-hidden="true" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">{online ? "Saved to File Inbox" : "Scan queued"}</h2>
              <p className="mt-1 max-w-xs text-sm text-slate-400">
                {online
                  ? "It's saved privately in your File Inbox. Open it any time to add a date, reminder, or category."
                  : "It will upload automatically when you're back online."}
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-2">
              <Button variant="outline" onClick={scanAnother} className="border-white/20 bg-white/5 text-slate-100 hover:bg-white/10">
                <FileText className="size-4" aria-hidden="true" /> Scan another
              </Button>
              {online && savedFileId !== null ? (
                <Button onClick={viewSavedFile} className="bg-teal-500 text-slate-950 hover:bg-teal-400">
                  View file
                </Button>
              ) : (
                <Button onClick={handleClose} className="bg-teal-500 text-slate-950 hover:bg-teal-400">
                  {online ? "Go to File Inbox" : "Done"}
                </Button>
              )}
            </div>

            {/* Optional next steps — each stays hidden unless its feature flag
                is enabled for this viewer, so normal users never see an
                unlaunched tool. */}
            {online &&
              savedFileId !== null &&
              (featureEnabled("scan_to_safesend") ||
                featureEnabled("scan_to_bundle") ||
                featureEnabled("scan_to_reminder")) && (
                <div className="flex flex-col items-center gap-3 border-t border-white/10 pt-4">
                  <div className="flex flex-wrap items-center justify-center gap-2">
                    {featureEnabled("scan_to_safesend") && (
                      <Button
                        variant="ghost"
                        onClick={shareSafely}
                        className="text-slate-200 hover:bg-white/5 hover:text-white"
                      >
                        <Share2 className="size-4" aria-hidden="true" /> Share safely
                      </Button>
                    )}
                    {featureEnabled("scan_to_bundle") && (
                      <Button
                        variant="ghost"
                        onClick={addToBundle}
                        className="text-slate-200 hover:bg-white/5 hover:text-white"
                      >
                        <Layers className="size-4" aria-hidden="true" /> Add to bundle
                      </Button>
                    )}
                    {featureEnabled("scan_to_reminder") && (
                      <Button
                        variant="ghost"
                        onClick={addReminder}
                        className="text-slate-200 hover:bg-white/5 hover:text-white"
                      >
                        <Bell className="size-4" aria-hidden="true" /> Add reminder
                      </Button>
                    )}
                  </div>
                  {featureEnabled("scan_to_safesend") && (
                    <p className="max-w-xs text-xs text-slate-500">
                      No public link is created — you&apos;ll review who can access it before sharing.
                    </p>
                  )}
                </div>
              )}

            {/* Advanced document tools (master-gated). Every tool here produces
                a NEW file and never touches the original. */}
            {online &&
              savedFileId !== null &&
              featureEnabled("scanner_advanced_tools") &&
              (featureEnabled("scan_safe_copy") ||
                featureEnabled("scan_redaction")) &&
              (copySavedFileId !== null ? (
                <div className="flex flex-col items-center gap-2 border-t border-white/10 pt-4">
                  <p className="text-sm text-slate-300">
                    Saved as a new copy.{" "}
                    <span className="text-slate-500">Original preserved.</span>
                  </p>
                  {pdfSize !== null && copySavedSize !== null && (
                    <p className="text-xs text-slate-500">
                      {formatBytes(pdfSize)} → {formatBytes(copySavedSize)}
                    </p>
                  )}
                  <Button
                    variant="ghost"
                    onClick={viewCopy}
                    className="text-slate-200 hover:bg-white/5 hover:text-white"
                  >
                    <FileText className="size-4" aria-hidden="true" /> View copy
                  </Button>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-1 border-t border-white/10 pt-4">
                  <div className="flex flex-wrap items-center justify-center gap-2">
                    {featureEnabled("scan_safe_copy") && (
                      <Button
                        variant="ghost"
                        onClick={() => setPrepareCopyOpen(true)}
                        className="text-slate-200 hover:bg-white/5 hover:text-white"
                      >
                        <Copy className="size-4" aria-hidden="true" /> Prepare copy
                      </Button>
                    )}
                    {featureEnabled("scan_redaction") && (
                      <Button
                        variant="ghost"
                        onClick={openRedaction}
                        className="text-slate-200 hover:bg-white/5 hover:text-white"
                      >
                        <EyeOff className="size-4" aria-hidden="true" /> Redact area
                      </Button>
                    )}
                  </div>
                  <p className="max-w-xs text-xs text-slate-500">
                    Make a copy for sharing or submission. This won&apos;t change
                    your original.
                  </p>
                </div>
              ))}
          </div>
        )}

        {prepareCopyOpen && (
          <PrepareCopySheet
            pageCount={pages.length + (enhancedCanvas ? 1 : 0)}
            pageExportEnabled={featureEnabled("scan_page_export")}
            compressionEnabled={featureEnabled("scan_compression")}
            watermarkEnabled={featureEnabled("scan_watermark")}
            busy={busy}
            onClose={() => setPrepareCopyOpen(false)}
            onCreate={createPreparedCopy}
          />
        )}

        {redactOpen && redactPages && (
          <RedactionEditor
            pages={redactPages}
            busy={busy}
            onCancel={() => {
              setRedactOpen(false);
              setRedactPages(null);
            }}
            onCreate={createRedactedCopy}
          />
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
  coaching: string | null;
  tilt: TiltState;
  holdProgress: number;
  torchOn: boolean;
  torchAvailable: boolean;
  caps: ScannerCapabilities;
  voiceOn: boolean;
  autoCapture: boolean;
  handsFree: boolean;
  handsFreeEnabled: boolean;
  pageCount: number;
  cvReady: boolean;
  scanMode: string | null;
  scanModesEnabled: boolean;
  onToggleTorch: () => void;
  onToggleVoice: () => void;
  onToggleAuto: () => void;
  onToggleHandsFree: () => void;
  onFinishHandsFree: () => void;
  onCapture: () => void;
  onImport: () => void;
  onSelectMode: (mode: ScanMode) => void;
  onClearMode: () => void;
  onFocusPoint: (nx: number, ny: number) => void;
}) {
  const detected = props.detection === "detected" || props.detection === "hold-steady";
  const activeMode = props.scanMode
    ? SCAN_MODES.find((m) => m.id === props.scanMode)
    : null;
  // Rule-of-thirds guide, toggled locally — pure presentation, no need to lift.
  const [showGrid, setShowGrid] = useState(false);
  // Transient focus ring at the last tapped point (pixel coords within the feed).
  const [focusRing, setFocusRing] = useState<{ x: number; y: number; id: number } | null>(null);
  const focusTimeoutRef = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (focusTimeoutRef.current) window.clearTimeout(focusTimeoutRef.current);
    },
    [],
  );
  const handleTapFocus = (e: React.MouseEvent<HTMLButtonElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    props.onFocusPoint(px / rect.width, py / rect.height);
    setFocusRing({ x: px, y: py, id: Date.now() });
    if (focusTimeoutRef.current) window.clearTimeout(focusTimeoutRef.current);
    focusTimeoutRef.current = window.setTimeout(() => setFocusRing(null), 900);
  };
  return (
    <>
      {/* Tap-to-focus catcher — full-area button beneath the controls (which
          paint later and capture their own taps). Central taps drive the lens. */}
      <button
        type="button"
        onClick={handleTapFocus}
        aria-label="Tap to focus"
        className="absolute inset-0 cursor-default focus:outline-none"
      />

      {/* Rule-of-thirds grid */}
      {showGrid && (
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute inset-y-0 left-1/3 w-px bg-white/20" />
          <div className="absolute inset-y-0 left-2/3 w-px bg-white/20" />
          <div className="absolute inset-x-0 top-1/3 h-px bg-white/20" />
          <div className="absolute inset-x-0 top-2/3 h-px bg-white/20" />
        </div>
      )}

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
            detected && !props.coaching
              ? "bg-teal-500/20 text-teal-100"
              : "bg-black/40 text-slate-200",
          )}
        >
          {/* Specific framing guidance when the page isn't well placed yet,
              otherwise the detection status. */}
          {props.coaching ?? DETECTION_COPY[props.detection]}
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

      {/* Tap-to-focus ring */}
      {focusRing && (
        <div
          key={focusRing.id}
          className="pointer-events-none absolute size-16 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-teal-300/90 animate-in fade-in zoom-in-75 duration-200"
          style={{ left: focusRing.x, top: focusRing.y }}
          aria-hidden="true"
        />
      )}

      {/* Bottom controls */}
      <div className="absolute inset-x-0 bottom-0 flex flex-col gap-3 bg-gradient-to-t from-black/80 to-transparent px-6 pb-7 pt-12">
        {/* Live scan-mode strip — choose the look while framing, like a camera
            mode dial. The choice carries through capture into the review/save,
            so framing and tool choice happen in one place. The filter is applied
            on capture (not per video frame) to keep the preview cheap. */}
        {props.scanModesEnabled && (
          <div className="flex flex-col items-center gap-1">
            <div
              className="-mx-1 flex max-w-full items-center gap-2 overflow-x-auto px-1 pb-0.5"
              role="group"
              aria-label="Scan mode"
            >
              <button
                type="button"
                onClick={props.onClearMode}
                aria-pressed={props.scanMode === null}
                className={cn(
                  "inline-flex shrink-0 items-center rounded-full px-3 py-1.5 text-xs font-medium backdrop-blur-md transition-colors focus-visible:ring-2 focus-visible:ring-teal-300 focus-visible:outline-none",
                  props.scanMode === null
                    ? "bg-teal-500/30 text-teal-50 ring-1 ring-teal-300/70"
                    : "bg-white/10 text-slate-200 hover:bg-white/20",
                )}
              >
                None
              </button>
              {SCAN_MODES.map((mode) => (
                <button
                  key={mode.id}
                  type="button"
                  onClick={() => props.onSelectMode(mode)}
                  aria-pressed={props.scanMode === mode.id}
                  className={cn(
                    "inline-flex shrink-0 items-center rounded-full px-3 py-1.5 text-xs font-medium backdrop-blur-md transition-colors focus-visible:ring-2 focus-visible:ring-teal-300 focus-visible:outline-none",
                    props.scanMode === mode.id
                      ? "bg-teal-500/30 text-teal-50 ring-1 ring-teal-300/70"
                      : "bg-white/10 text-slate-200 hover:bg-white/20",
                  )}
                >
                  {mode.label}
                </button>
              ))}
            </div>
            {activeMode && (
              <p className="text-[0.7rem] text-slate-300">{activeMode.hint}</p>
            )}
          </div>
        )}
        {props.handsFree && (
          <div className="flex items-center justify-between gap-3 rounded-xl bg-teal-500/15 px-3 py-2 ring-1 ring-teal-300/40 backdrop-blur-md">
            <span className="text-xs font-medium text-teal-50">
              {props.pageCount > 0
                ? `${props.pageCount} page${props.pageCount === 1 ? "" : "s"} captured — place the next one`
                : "Hands-free on — frame a page and hold steady"}
            </span>
            <button
              type="button"
              onClick={props.onFinishHandsFree}
              disabled={props.pageCount === 0}
              className="shrink-0 rounded-full bg-teal-400 px-3 py-1 text-xs font-semibold text-slate-950 transition-colors hover:bg-teal-300 disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none"
            >
              Finish{props.pageCount > 0 ? ` (${props.pageCount})` : ""}
            </button>
          </div>
        )}
        <div className="flex items-center justify-center gap-3 text-xs text-slate-300">
          <button
            type="button"
            onClick={props.onToggleAuto}
            aria-pressed={props.autoCapture}
            className="rounded-full bg-white/10 px-3 py-1 backdrop-blur-md"
          >
            Auto-capture: {props.autoCapture ? "On" : "Off"}
          </button>
          <button
            type="button"
            onClick={() => setShowGrid((v) => !v)}
            aria-pressed={showGrid}
            className="rounded-full bg-white/10 px-3 py-1 backdrop-blur-md"
          >
            Grid: {showGrid ? "On" : "Off"}
          </button>
          {props.handsFreeEnabled && (
            <button
              type="button"
              onClick={props.onToggleHandsFree}
              aria-pressed={props.handsFree}
              className={cn(
                "rounded-full px-3 py-1 backdrop-blur-md",
                props.handsFree
                  ? "bg-teal-500/30 text-teal-50 ring-1 ring-teal-300/70"
                  : "bg-white/10",
              )}
            >
              Hands-free: {props.handsFree ? "On" : "Off"}
            </button>
          )}
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
  onDiscard: (id: string) => void;
}) {
  // Which queued draft is mid-discard-confirm (inline, no modal in the scanner).
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  return (
    <div className="mx-auto flex h-full max-w-md flex-col items-center justify-center gap-6 p-8 text-center">
      <div className="flex size-16 items-center justify-center rounded-2xl bg-teal-500/15">
        <FileText className="size-8 text-teal-300" aria-hidden="true" />
      </div>
      <div>
        <h1 className="text-xl font-semibold">Scan a document</h1>
        <p className="mt-2 text-sm text-slate-400">
          Point your camera at any document — DueNest cleans it up and saves a
          clean PDF to your File Inbox.
        </p>
        <p className="mt-3 inline-flex items-center gap-1.5 text-xs text-slate-500">
          <ShieldCheck className="size-3.5 text-teal-300/80" aria-hidden="true" />
          Processed on your device
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
          <div className="mb-1 flex items-center justify-between">
            <span className="text-xs font-medium text-slate-300">
              {props.queued.length} scan{props.queued.length > 1 ? "s" : ""} waiting to upload
            </span>
            <button type="button" onClick={props.onRetryQueue} className="text-xs text-teal-300 hover:underline">
              Retry now
            </button>
          </div>
          <p className="mb-2 text-[0.7rem] text-slate-500">
            Not uploaded yet — they&apos;ll upload automatically when you&apos;re back online, or you can discard a draft.
          </p>
          <ul className="space-y-1.5 text-xs text-slate-400">
            {props.queued.slice(0, 5).map((item) => (
              <li key={item.id} className="rounded-md bg-white/5 px-2 py-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="min-w-0 flex-1 truncate">{item.filename}</span>
                  <span className="shrink-0 text-slate-500">{formatBytes(item.sizeBytes)}</span>
                </div>
                {confirmingId === item.id ? (
                  <div className="mt-1 flex items-center justify-between gap-2">
                    <span className="text-[0.7rem] text-slate-500">
                      Discard this draft? Uploaded files aren&apos;t affected.
                    </span>
                    <span className="flex shrink-0 gap-3">
                      <button
                        type="button"
                        onClick={() => {
                          props.onDiscard(item.id);
                          setConfirmingId(null);
                        }}
                        className="font-medium text-rose-300 hover:underline"
                      >
                        Discard
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmingId(null)}
                        className="text-slate-300 hover:underline"
                      >
                        Keep
                      </button>
                    </span>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmingId(item.id)}
                    aria-label={`Discard ${item.filename}`}
                    className="mt-1 text-[0.7rem] text-slate-400 hover:text-rose-300"
                  >
                    Discard draft
                  </button>
                )}
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

/** Return a new canvas rotated 90° (clockwise by default), swapping dimensions. */
function rotateCanvas90(
  source: HTMLCanvasElement,
  clockwise = true,
): HTMLCanvasElement {
  const out = document.createElement("canvas");
  out.width = source.height;
  out.height = source.width;
  const ctx = out.getContext("2d");
  if (ctx) {
    if (clockwise) {
      ctx.translate(out.width, 0);
      ctx.rotate(Math.PI / 2);
    } else {
      ctx.translate(0, out.height);
      ctx.rotate(-Math.PI / 2);
    }
    ctx.drawImage(source, 0, 0);
  }
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

/** Small filtered+adjusted JPEG data-URL for a multi-page thumbnail strip. */
function makeThumbnail(
  source: HTMLCanvasElement,
  id: FilterId,
  adj: Adjustments,
): string {
  const maxW = 120;
  const scale = Math.min(1, maxW / Math.max(1, source.width));
  const w = Math.max(1, Math.round(source.width * scale));
  const h = Math.max(1, Math.round(source.height * scale));
  const rendered = renderPage(source, id, adj);
  const thumb = document.createElement("canvas");
  thumb.width = w;
  thumb.height = h;
  thumb.getContext("2d")?.drawImage(rendered, 0, 0, w, h);
  try {
    return thumb.toDataURL("image/jpeg", 0.6);
  } catch {
    return "";
  }
}

/** A clean PDF basename from the optional user name; backend re-sanitizes too. */
function makeId(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `page-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

// A quad covering the whole canvas — imported PDF pages are already flat, so no
// perspective crop is applied.
function fullQuad(canvas: HTMLCanvasElement): Quad {
  return [
    { x: 0, y: 0 },
    { x: canvas.width, y: 0 },
    { x: canvas.width, y: canvas.height },
    { x: 0, y: canvas.height },
  ];
}

function buildScanBasename(name: string): string {
  const cleaned = name
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
  if (cleaned) return cleaned;
  return `scan-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "")}`;
}

function AdjustSlider({
  label,
  value,
  onChange,
  min = -100,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
}) {
  return (
    <label className="block">
      <span className="mb-1 flex items-center justify-between text-xs text-slate-300">
        <span>{label}</span>
        <span className="tabular-nums text-slate-400">{value > 0 ? `+${value}` : value}</span>
      </span>
      <input
        type="range"
        min={min}
        max={100}
        step={1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label={label}
        className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-white/15 accent-teal-400"
      />
    </label>
  );
}

/** A labeled icon tool in the review dock. `dot` flags a non-default edit. */
function ToolDockButton({
  icon,
  label,
  onClick,
  active,
  dot,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  active?: boolean;
  dot?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "relative flex min-w-[3.75rem] shrink-0 flex-col items-center gap-1 rounded-xl px-2 py-2 text-[0.65rem] font-medium transition-colors focus-visible:ring-2 focus-visible:ring-teal-300 focus-visible:outline-none",
        active
          ? "bg-teal-500/15 text-teal-100 ring-1 ring-teal-400/50"
          : "text-slate-200 hover:bg-white/10",
      )}
    >
      {icon}
      {label}
      {dot && (
        <span
          className="absolute right-2 top-1.5 size-1.5 rounded-full bg-teal-300"
          aria-hidden="true"
        />
      )}
    </button>
  );
}

/**
 * Bottom sheet of all filters with descriptions. Advanced filters carry a subtle
 * "Pro" tag (descriptive only — nothing is gated/blocked in this branch).
 */
function MoreFiltersSheet({
  activeId,
  onSelect,
  onClose,
}: {
  activeId: FilterId;
  onSelect: (id: FilterId) => void;
  onClose: () => void;
}) {
  return (
    <div
      className="absolute inset-0 z-40 flex flex-col justify-end bg-black/60"
      role="dialog"
      aria-modal="true"
      aria-label="Choose a filter"
      onClick={onClose}
    >
      <div
        className="max-h-[80%] overflow-y-auto rounded-t-2xl border-t border-white/10 bg-slate-900 p-4"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 1rem)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-100">Filters</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close filters"
            className="rounded-md p-1 text-slate-300 hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-teal-300 focus-visible:outline-none"
          >
            <X className="size-5" aria-hidden="true" />
          </button>
        </div>
        <ul className="space-y-1.5">
          {FILTERS.map((f) => (
            <li key={f.id}>
              <button
                type="button"
                onClick={() => onSelect(f.id)}
                aria-pressed={activeId === f.id}
                className={cn(
                  "flex w-full items-start gap-3 rounded-xl border p-3 text-left transition-colors focus-visible:ring-2 focus-visible:ring-teal-300 focus-visible:outline-none",
                  activeId === f.id
                    ? "border-teal-400/60 bg-teal-500/10"
                    : "border-white/10 bg-white/5 hover:bg-white/10",
                )}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-slate-100">{f.label}</span>
                    {f.planTier === "pro" && (
                      <span className="rounded-full bg-amber-400/15 px-1.5 py-0.5 text-[0.6rem] font-semibold uppercase tracking-wide text-amber-300">
                        Pro
                      </span>
                    )}
                    {!f.preservesColor && (
                      <span className="rounded-full bg-white/10 px-1.5 py-0.5 text-[0.6rem] font-medium text-slate-300">
                        No color
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs leading-relaxed text-slate-400">
                    {f.description}
                  </p>
                </div>
                {activeId === f.id && (
                  <Check className="mt-0.5 size-4 shrink-0 text-teal-300" aria-hidden="true" />
                )}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
