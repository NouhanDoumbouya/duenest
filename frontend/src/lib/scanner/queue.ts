import localforage from "localforage";

import type { QueuedScan } from "./types";

/**
 * Offline upload queue for scanned PDFs.
 *
 * Encryption: when Web Crypto is available, each queued PDF is encrypted with
 * AES-256-GCM under a **non-extractable** CryptoKey that is generated once and
 * stored in IndexedDB. The raw key bytes are never exposed to JavaScript, so the
 * stored blob cannot be read by inspecting IndexedDB or by another origin.
 *
 * Honest limitation: a non-extractable key still lives in this origin and can be
 * *used* (not exported) by same-origin script, so this is not protection against
 * a malicious script already running on the page — it protects queued scans at
 * rest from casual inspection / disk forensics. When Web Crypto is unavailable
 * the blob is stored unencrypted and `encrypted` is `false`.
 *
 * Lifecycle: items auto-delete after a successful upload, and `purgeStale`
 * removes anything older than the retention window so sensitive scans never
 * linger indefinitely.
 */

const STALE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

const queueStore = localforage.createInstance({
  name: "duenest-scanner",
  storeName: "upload_queue",
});

const keyStore = localforage.createInstance({
  name: "duenest-scanner",
  storeName: "crypto_key",
});

const KEY_ID = "queue-aes-key";

function subtle(): SubtleCrypto | null {
  if (typeof crypto === "undefined" || !crypto.subtle) return null;
  return crypto.subtle;
}

async function getOrCreateKey(): Promise<CryptoKey | null> {
  const s = subtle();
  if (!s) return null;
  const existing = await keyStore.getItem<CryptoKey>(KEY_ID);
  if (existing) return existing;
  const key = await s.generateKey({ name: "AES-GCM", length: 256 }, false, [
    "encrypt",
    "decrypt",
  ]);
  // Non-extractable CryptoKey objects are structured-cloneable into IndexedDB.
  await keyStore.setItem(KEY_ID, key);
  return key;
}

async function encryptBlob(
  blob: Blob,
): Promise<{ blob: Blob; iv: number[] | null; encrypted: boolean }> {
  const s = subtle();
  const key = await getOrCreateKey();
  if (!s || !key) return { blob, iv: null, encrypted: false };
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = await blob.arrayBuffer();
  const ciphertext = await s.encrypt({ name: "AES-GCM", iv }, key, plaintext);
  return {
    blob: new Blob([ciphertext], { type: "application/octet-stream" }),
    iv: Array.from(iv),
    encrypted: true,
  };
}

async function decryptBlob(item: QueuedScan): Promise<Blob> {
  if (!item.encrypted || !item.iv) return item.blob;
  const s = subtle();
  const key = await getOrCreateKey();
  if (!s || !key) throw new Error("Cannot decrypt queued scan: key unavailable.");
  const ciphertext = await item.blob.arrayBuffer();
  const plaintext = await s.decrypt(
    { name: "AES-GCM", iv: new Uint8Array(item.iv) },
    key,
    ciphertext,
  );
  return new Blob([plaintext], { type: "application/pdf" });
}

export async function enqueueScan(blob: Blob, filename: string): Promise<QueuedScan> {
  const { blob: stored, iv, encrypted } = await encryptBlob(blob);
  const item: QueuedScan = {
    id:
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `scan-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    createdAt: Date.now(),
    sizeBytes: blob.size,
    filename,
    status: "queued",
    encrypted,
    iv,
    blob: stored,
    attempts: 0,
  };
  await queueStore.setItem(item.id, item);
  return item;
}

export async function listQueuedScans(): Promise<QueuedScan[]> {
  const items: QueuedScan[] = [];
  await queueStore.iterate<QueuedScan, void>((value) => {
    items.push(value);
  });
  return items.sort((a, b) => b.createdAt - a.createdAt);
}

export async function removeScan(id: string): Promise<void> {
  await queueStore.removeItem(id);
}

export async function updateScan(id: string, patch: Partial<QueuedScan>): Promise<void> {
  const item = await queueStore.getItem<QueuedScan>(id);
  if (item) await queueStore.setItem(id, { ...item, ...patch });
}

export async function getDecryptedScanBlob(item: QueuedScan): Promise<Blob> {
  return decryptBlob(item);
}

/** Remove queued scans older than the retention window. Returns count removed. */
export async function purgeStale(): Promise<number> {
  const now = Date.now();
  let removed = 0;
  const stale: string[] = [];
  await queueStore.iterate<QueuedScan, void>((value, key) => {
    if (now - value.createdAt > STALE_MS) stale.push(String(key));
  });
  for (const id of stale) {
    await queueStore.removeItem(id);
    removed += 1;
  }
  return removed;
}
