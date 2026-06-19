export interface CameraHandle {
  stream: MediaStream;
  track: MediaStreamTrack;
  stop: () => void;
}

export class CameraError extends Error {
  readonly kind: "denied" | "unavailable" | "insecure" | "unknown";
  constructor(kind: CameraError["kind"], message: string) {
    super(message);
    this.name = "CameraError";
    this.kind = kind;
  }
}

/**
 * Start the rear ("environment") camera at a document-friendly resolution.
 * Throws a typed {@link CameraError} so the UI can show the right message.
 */
export async function startCamera(): Promise<CameraHandle> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    throw new CameraError("unavailable", "Camera is not available on this device.");
  }
  if (typeof window !== "undefined" && !window.isSecureContext) {
    throw new CameraError(
      "insecure",
      "Camera requires a secure (HTTPS) connection.",
    );
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: "environment" },
        // Documents are detail-dense (small print, signatures), so ask for a
        // high capture resolution. `ideal` degrades gracefully on weaker
        // cameras instead of failing.
        width: { ideal: 2560 },
        height: { ideal: 1440 },
        // Continuous autofocus is the key fix for a soft live preview: without
        // it, close-up documents stay out of focus until something forces a
        // refocus. `advanced` entries are best-effort — ignored, never fatal,
        // on devices that don't expose focus control.
        advanced: [
          { focusMode: "continuous" },
        ] as unknown as MediaTrackConstraintSet[],
      },
      audio: false,
    });
    const track = stream.getVideoTracks()[0];
    // Re-apply focus after the track is live; some browsers honour
    // applyConstraints better than the initial getUserMedia advanced set.
    await applyContinuousFocus(track);
    return {
      stream,
      track,
      stop: () => stream.getTracks().forEach((t) => t.stop()),
    };
  } catch (err) {
    const name = (err as DOMException)?.name;
    if (name === "NotAllowedError" || name === "SecurityError") {
      throw new CameraError(
        "denied",
        "Camera access was denied. Enable camera permission to scan documents.",
      );
    }
    if (name === "NotFoundError" || name === "OverconstrainedError") {
      throw new CameraError("unavailable", "No usable camera was found.");
    }
    throw new CameraError("unknown", "Could not start the camera.");
  }
}

/**
 * Best-effort request for continuous autofocus on a live track. Silently does
 * nothing where the capability is unsupported, so it never breaks scanning.
 */
async function applyContinuousFocus(track: MediaStreamTrack): Promise<void> {
  try {
    const caps = track.getCapabilities?.() as
      | (MediaTrackCapabilities & { focusMode?: string[] })
      | undefined;
    if (caps?.focusMode?.includes("continuous")) {
      await track.applyConstraints({
        advanced: [
          { focusMode: "continuous" },
        ] as unknown as MediaTrackConstraintSet[],
      });
    }
  } catch {
    /* focus control is optional — ignore and keep scanning */
  }
}

/**
 * Drive autofocus toward a normalized point (0..1, top-left origin) the user
 * tapped on the live preview. Uses `pointsOfInterest` where supported (mainly
 * Android Chrome); best-effort and silent elsewhere. Returns whether a focus
 * constraint was actually applied, so the UI can decide whether to show a ring.
 */
export async function focusAt(
  track: MediaStreamTrack,
  x: number,
  y: number,
): Promise<boolean> {
  try {
    const caps = track.getCapabilities?.() as
      | (MediaTrackCapabilities & {
          focusMode?: string[];
          pointsOfInterest?: unknown;
        })
      | undefined;
    if (!caps || caps.pointsOfInterest === undefined) return false;
    const cx = Math.min(1, Math.max(0, x));
    const cy = Math.min(1, Math.max(0, y));
    const supportsSingle = caps.focusMode?.includes("single-shot");
    await track.applyConstraints({
      advanced: [
        {
          pointsOfInterest: [{ x: cx, y: cy }],
          ...(supportsSingle ? { focusMode: "single-shot" } : {}),
        },
      ] as unknown as MediaTrackConstraintSet[],
    });
    return true;
  } catch {
    return false;
  }
}

type TorchCapableTrack = {
  getCapabilities?: () => MediaTrackCapabilities & { torch?: boolean };
};

/** Whether the live track actually exposes a torch (only knowable post-start). */
export function trackSupportsTorch(track: MediaStreamTrack): boolean {
  try {
    const caps = (track as unknown as TorchCapableTrack).getCapabilities?.();
    return !!caps && caps.torch === true;
  } catch {
    return false;
  }
}

/**
 * Toggle the torch via a track constraint. Returns the new on/off state, or
 * throws if the device rejects the constraint.
 */
export async function setTorch(track: MediaStreamTrack, on: boolean): Promise<boolean> {
  if (!trackSupportsTorch(track)) {
    throw new Error("Torch is not available on this device.");
  }
  await track.applyConstraints({
    advanced: [{ torch: on } as MediaTrackConstraintSet & { torch: boolean }],
  });
  return on;
}
