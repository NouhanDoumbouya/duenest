import type { TiltState } from "./types";

export interface OrientationReading {
  /** Smoothed left/right tilt in degrees (gamma). */
  roll: number;
  /** Smoothed front/back tilt in degrees (beta, offset so flat ≈ 0). */
  pitch: number;
  state: TiltState;
}

interface DeviceOrientationEventStatic {
  requestPermission?: () => Promise<"granted" | "denied">;
}

/**
 * iOS Safari requires a user-gesture permission request before orientation
 * events fire. Returns true when listening is allowed (or no permission gate
 * exists), false when denied/unsupported.
 */
export async function requestOrientationPermission(): Promise<boolean> {
  if (typeof window === "undefined" || typeof window.DeviceOrientationEvent === "undefined") {
    return false;
  }
  const ctor = window.DeviceOrientationEvent as unknown as DeviceOrientationEventStatic;
  if (typeof ctor.requestPermission === "function") {
    try {
      return (await ctor.requestPermission()) === "granted";
    } catch {
      return false;
    }
  }
  return true;
}

function classify(roll: number, pitch: number): TiltState {
  const worst = Math.max(Math.abs(roll), Math.abs(pitch));
  if (worst <= 4) return "level";
  if (worst <= 12) return "slight";
  return "tilted";
}

/**
 * Subscribe to smoothed device-orientation readings. Returns an unsubscribe
 * function. Values are low-pass filtered to avoid jitter. No-op (and reports a
 * single `unavailable` reading) when the API is missing.
 */
export function subscribeOrientation(
  onReading: (reading: OrientationReading) => void,
  smoothing = 0.18,
): () => void {
  if (typeof window === "undefined" || typeof window.DeviceOrientationEvent === "undefined") {
    onReading({ roll: 0, pitch: 0, state: "unavailable" });
    return () => {};
  }

  let roll = 0;
  let pitch = 0;
  let seen = false;

  const handler = (event: DeviceOrientationEvent) => {
    if (event.gamma == null && event.beta == null) return;
    const rawRoll = event.gamma ?? 0;
    // beta is 0 when flat face-up but ~ -90 when the phone points at a desk;
    // documents are typically scanned with the phone roughly flat, so we treat
    // small beta as level.
    const rawPitch = (event.beta ?? 0) - 0;
    roll = seen ? roll + (rawRoll - roll) * smoothing : rawRoll;
    pitch = seen ? pitch + (rawPitch - pitch) * smoothing : rawPitch;
    seen = true;
    onReading({ roll, pitch, state: classify(roll, pitch) });
  };

  window.addEventListener("deviceorientation", handler, true);
  return () => window.removeEventListener("deviceorientation", handler, true);
}

export function tiltLabel(state: TiltState): string {
  switch (state) {
    case "level":
      return "Level";
    case "slight":
      return "Slightly tilted";
    case "tilted":
      return "Tilted — align phone";
    default:
      return "Orientation unavailable";
  }
}
