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
        width: { ideal: 1920 },
        height: { ideal: 1080 },
      },
      audio: false,
    });
    const track = stream.getVideoTracks()[0];
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
