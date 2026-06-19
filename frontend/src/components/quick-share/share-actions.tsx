"use client";

// SafeSend distribution surface: app share buttons (native share, WhatsApp,
// Telegram, email, SMS), copy actions (link, code, full message), QR download,
// and a downloadable branded share card. Never sends the raw file — only the
// secure link, DueNest code, QR, and access instructions.

import { useMemo, useState } from "react";
import {
  Check,
  Clipboard,
  Copy,
  Download,
  IdCard,
  Image as ImageIcon,
  Link2,
  Loader2,
  Mail,
  MessageSquare,
  Share2,
} from "lucide-react";
import { siWhatsapp, siTelegram } from "simple-icons";

import { Button } from "@/components/ui/button";
import {
  generateQrDataUrl,
  generateQrSvg,
  type QrStyle,
} from "@/components/quick-share/shared";
import {
  buildEmailSubject,
  buildShareMessage,
  canUseNativeShare,
  copyToClipboardWithFallback,
  emailUrl,
  MESSAGE_TEMPLATES,
  smsUrl,
  telegramUrl,
  whatsAppUrl,
  type MessageTemplate,
} from "@/lib/safesend";
import { cn } from "@/lib/utils";

type SimpleIcon = { title: string; hex: string; path: string };

function BrandGlyph({ icon, className }: { icon: SimpleIcon; className?: string }) {
  return (
    <svg
      role="img"
      viewBox="0 0 24 24"
      aria-hidden
      className={cn("size-4", className)}
      fill="currentColor"
    >
      <path d={icon.path} />
    </svg>
  );
}

export interface ShareActionsProps {
  /** The secure claim URL (always present — also what the QR encodes). */
  shareUrl: string;
  /** Secure link to surface in messages (omit for code-only packages). */
  link?: string;
  /** DueNest code to surface in messages (omit when not part of the package). */
  code?: string;
  title?: string;
  purpose?: string;
  recipient?: string;
  permissionLabel: string;
  expiryLabel: string;
  /** Item summary for the share card, e.g. "3 files". */
  itemSummary: string;
  /** Optional QR styling applied to the QR download + share card. */
  qrStyle?: QrStyle;
  /** Called with a transient confirmation message after any action. */
  onFlash?: (message: string) => void;
}

/**
 * Primary distribution actions. Falls back gracefully when native share or the
 * clipboard is unavailable, and never fails silently.
 */
export function ShareDistributionActions(props: ShareActionsProps) {
  const {
    shareUrl,
    link,
    code,
    title,
    permissionLabel,
    expiryLabel,
    onFlash,
  } = props;

  const [copied, setCopied] = useState<string | null>(null);
  const [downloading, setDownloading] = useState<
    "qr" | "svg" | "card" | null
  >(null);
  // The `sms:` scheme only does anything on phones — gate the button to touch
  // devices so it never shows as a dead action on desktop.
  const canUseSms =
    typeof navigator !== "undefined" &&
    (navigator.maxTouchPoints > 0 ||
      /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent));
  const canCopyImage =
    typeof window !== "undefined" &&
    typeof window.ClipboardItem !== "undefined" &&
    typeof navigator !== "undefined" &&
    !!navigator.clipboard &&
    typeof navigator.clipboard.write === "function";

  const message = useMemo(
    () =>
      buildShareMessage({
        template: "friendly",
        link,
        code,
        permissionLabel,
        expiryLabel,
        title,
      }),
    [link, code, permissionLabel, expiryLabel, title],
  );

  const flash = (msg: string) => onFlash?.(msg);

  async function copy(value: string, key: string, label: string) {
    const ok = await copyToClipboardWithFallback(value);
    if (ok) {
      setCopied(key);
      setTimeout(() => setCopied((c) => (c === key ? null : c)), 1800);
      flash(label);
    } else {
      flash("Copy is unavailable in this browser. Select and copy manually.");
    }
  }

  async function nativeShare() {
    if (!canUseNativeShare()) {
      // Fall back to copying the secure link rather than failing silently.
      await copy(link ?? shareUrl, "native", "Sharing unavailable — link copied instead.");
      return;
    }
    try {
      await navigator.share({
        title: title || "Secure DueNest share",
        text: message,
        url: link ?? shareUrl,
      });
    } catch {
      /* user dismissed the share sheet — nothing to do */
    }
  }

  async function downloadQr() {
    setDownloading("qr");
    try {
      const dataUrl = await generateQrDataUrl(shareUrl, 720, props.qrStyle);
      triggerDownload(dataUrl, `duenest-share-qr.png`);
      flash("QR downloaded.");
    } catch {
      flash("Could not generate the QR image.");
    } finally {
      setDownloading(null);
    }
  }

  async function copyQrImage() {
    if (!canCopyImage) {
      await downloadQr();
      flash("Copy isn't supported here — QR downloaded instead.");
      return;
    }
    try {
      const dataUrl = await generateQrDataUrl(shareUrl, 720, props.qrStyle);
      const blob = await (await fetch(dataUrl)).blob();
      await navigator.clipboard.write([
        new ClipboardItem({ [blob.type]: blob }),
      ]);
      flash("QR image copied.");
    } catch {
      flash("Could not copy the QR image. Try downloading it instead.");
    }
  }

  async function downloadQrSvg() {
    setDownloading("svg");
    try {
      const svg = await generateQrSvg(shareUrl, props.qrStyle);
      const dataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
      triggerDownload(dataUrl, "duenest-share-qr.svg");
      flash("QR (SVG) downloaded.");
    } catch {
      flash("Could not generate the SVG.");
    } finally {
      setDownloading(null);
    }
  }

  async function downloadCard() {
    setDownloading("card");
    try {
      const dataUrl = await buildShareCardDataUrl({
        title: title || "Secure share",
        itemSummary: props.itemSummary,
        permissionLabel,
        expiryLabel,
        purpose: props.purpose,
        recipient: props.recipient,
        shareUrl,
        qrStyle: props.qrStyle,
      });
      triggerDownload(dataUrl, "duenest-share-card.png");
      flash("Share card downloaded.");
    } catch {
      flash("Could not generate the share card.");
    } finally {
      setDownloading(null);
    }
  }

  const emailHref = emailUrl(buildEmailSubject(title), message);

  return (
    <div className="space-y-4">
      {/* App share row */}
      <div>
        <p className="mb-2 text-xs font-medium text-muted-foreground">
          Send via
        </p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <Button variant="outline" onClick={nativeShare} className="justify-start">
            <Share2 className="size-4" />
            Share…
          </Button>
          <ExternalShareButton
            href={whatsAppUrl(message)}
            label="WhatsApp"
            icon={<BrandGlyph icon={siWhatsapp} className="text-[#25D366]" />}
          />
          <ExternalShareButton
            href={telegramUrl(link, message)}
            label="Telegram"
            icon={<BrandGlyph icon={siTelegram} className="text-[#26A5E4]" />}
          />
          <ExternalShareButton
            href={emailHref}
            label="Email"
            icon={<Mail className="size-4" />}
          />
          {canUseSms && (
            <ExternalShareButton
              href={smsUrl(message)}
              label="SMS"
              icon={<MessageSquare className="size-4" />}
            />
          )}
        </div>
      </div>

      {/* Copy row */}
      <div>
        <p className="mb-2 text-xs font-medium text-muted-foreground">Copy</p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {link && (
            <Button
              variant="outline"
              onClick={() => copy(link, "link", "Secure link copied.")}
              className="justify-start"
            >
              {copied === "link" ? (
                <Check className="size-4 text-brand-success" />
              ) : (
                <Link2 className="size-4" />
              )}
              {copied === "link" ? "Copied" : "Secure link"}
            </Button>
          )}
          {code && (
            <Button
              variant="outline"
              onClick={() => copy(code, "code", "DueNest code copied.")}
              className="justify-start font-mono"
            >
              {copied === "code" ? (
                <Check className="size-4 text-brand-success" />
              ) : (
                <IdCard className="size-4" />
              )}
              {copied === "code" ? "Copied" : "DueNest code"}
            </Button>
          )}
          <Button
            variant="outline"
            onClick={() => copy(message, "message", "Message copied.")}
            className="justify-start"
          >
            {copied === "message" ? (
              <Check className="size-4 text-brand-success" />
            ) : (
              <Copy className="size-4" />
            )}
            {copied === "message" ? "Copied" : "Full message"}
          </Button>
        </div>
      </div>

      {/* Download row */}
      <div>
        <p className="mb-2 text-xs font-medium text-muted-foreground">Download</p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Button
            variant="outline"
            onClick={downloadQr}
            disabled={downloading !== null}
            className="justify-start"
          >
            {downloading === "qr" ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Download className="size-4" />
            )}
            QR image (PNG)
          </Button>
          <Button
            variant="outline"
            onClick={downloadQrSvg}
            disabled={downloading !== null}
            className="justify-start"
          >
            {downloading === "svg" ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Download className="size-4" />
            )}
            QR vector (SVG)
          </Button>
          <Button
            variant="outline"
            onClick={copyQrImage}
            disabled={downloading !== null}
            className="justify-start"
          >
            <Clipboard className="size-4" />
            Copy QR
          </Button>
          <Button
            variant="outline"
            onClick={downloadCard}
            disabled={downloading !== null}
            className="justify-start"
          >
            {downloading === "card" ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <ImageIcon className="size-4" />
            )}
            Share card
          </Button>
        </div>
      </div>
    </div>
  );
}

function ExternalShareButton({
  href,
  label,
  icon,
}: {
  href: string;
  label: string;
  icon: React.ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`Share via ${label}`}
      className={cn(
        "inline-flex h-9 items-center justify-start gap-1.5 rounded-lg border border-border bg-card px-3.5 text-sm font-medium shadow-xs transition-all hover:bg-muted hover:text-foreground active:translate-y-px",
      )}
    >
      {icon}
      {label}
    </a>
  );
}

// ---- Message editor --------------------------------------------------------

export function ShareMessageEditor({
  link,
  code,
  permissionLabel,
  expiryLabel,
  title,
  onFlash,
}: {
  link?: string;
  code?: string;
  permissionLabel: string;
  expiryLabel: string;
  title?: string;
  onFlash?: (message: string) => void;
}) {
  const [template, setTemplate] = useState<MessageTemplate>("friendly");
  const [draft, setDraft] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const generated = useMemo(
    () =>
      buildShareMessage({ template, link, code, permissionLabel, expiryLabel, title }),
    [template, link, code, permissionLabel, expiryLabel, title],
  );

  // The textarea is editable; switching templates resets the draft.
  const value = draft ?? generated;

  async function copy() {
    const ok = await copyToClipboardWithFallback(value);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
      onFlash?.("Message copied.");
    } else {
      onFlash?.("Copy is unavailable. Select and copy manually.");
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Message tone">
        {MESSAGE_TEMPLATES.map((t) => (
          <button
            key={t.id}
            type="button"
            role="radio"
            aria-checked={template === t.id}
            onClick={() => {
              setTemplate(t.id);
              setDraft(null);
            }}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
              template === t.id
                ? "border-primary bg-primary/10 text-primary"
                : "border-border bg-card text-muted-foreground hover:bg-muted",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      <textarea
        value={value}
        onChange={(e) => setDraft(e.target.value)}
        rows={7}
        aria-label="Share message"
        className="w-full resize-y rounded-xl border border-border bg-card p-3 text-sm leading-relaxed shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
      />
      <Button variant="outline" onClick={copy} className="w-full sm:w-auto">
        {copied ? (
          <Check className="size-4 text-brand-success" />
        ) : (
          <Copy className="size-4" />
        )}
        {copied ? "Copied" : "Copy message"}
      </Button>
    </div>
  );
}

// ---- Helpers ---------------------------------------------------------------

function triggerDownload(dataUrl: string, filename: string) {
  const anchor = document.createElement("a");
  anchor.href = dataUrl;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

interface ShareCardInput {
  title: string;
  itemSummary: string;
  permissionLabel: string;
  expiryLabel: string;
  purpose?: string;
  recipient?: string;
  shareUrl: string;
  qrStyle?: QrStyle;
}

/**
 * Render a clean, premium branded share card to a PNG data URL via canvas.
 * Drawn at 2x for crisp output. The QR encodes only the secure URL — the card
 * carries no file bytes, paths, or tokens beyond the intended secure link.
 */
async function buildShareCardDataUrl(input: ShareCardInput): Promise<string> {
  const scale = 2;
  const W = 640;
  const H = 860;
  const canvas = document.createElement("canvas");
  canvas.width = W * scale;
  canvas.height = H * scale;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable");
  ctx.scale(scale, scale);

  const navy = "#0b1220";
  const muted = "#64748b";
  const accent = "#1f6feb";

  // Background
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, H);
  // Soft border
  ctx.strokeStyle = "#e2e8f0";
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, W - 2, H - 2);
  // Top accent bar
  ctx.fillStyle = accent;
  ctx.fillRect(0, 0, W, 6);

  const cx = W / 2;
  let y = 64;

  ctx.textAlign = "center";
  ctx.fillStyle = navy;
  ctx.font = "700 34px system-ui, -apple-system, sans-serif";
  ctx.fillText("DueNest", cx, y);

  y += 34;
  ctx.fillStyle = accent;
  ctx.font = "600 16px system-ui, -apple-system, sans-serif";
  ctx.fillText("SECURE SHARE", cx, y);

  y += 44;
  ctx.fillStyle = navy;
  ctx.font = "600 22px system-ui, -apple-system, sans-serif";
  fillWrapped(ctx, input.title, cx, y, W - 96, 28);

  if (input.recipient) {
    y += 28;
    ctx.fillStyle = muted;
    ctx.font = "500 14px system-ui, -apple-system, sans-serif";
    ctx.fillText(`For: ${input.recipient}`, cx, y);
  }

  // QR
  const qrDataUrl = await generateQrDataUrl(input.shareUrl, 600, input.qrStyle);
  const qrImg = await loadImage(qrDataUrl);
  const qrSize = 300;
  const qrX = cx - qrSize / 2;
  const qrY = 240;
  ctx.fillStyle = "#ffffff";
  ctx.strokeStyle = "#e2e8f0";
  ctx.lineWidth = 1;
  ctx.strokeRect(qrX - 12, qrY - 12, qrSize + 24, qrSize + 24);
  ctx.drawImage(qrImg, qrX, qrY, qrSize, qrSize);

  y = qrY + qrSize + 48;
  ctx.fillStyle = muted;
  ctx.font = "500 15px system-ui, -apple-system, sans-serif";
  ctx.fillText("Scan the QR or open the secure link", cx, y);

  // Summary line
  y += 36;
  ctx.fillStyle = navy;
  ctx.font = "600 17px system-ui, -apple-system, sans-serif";
  const summaryParts = [input.itemSummary, input.permissionLabel].filter(Boolean);
  ctx.fillText(summaryParts.join("  ·  "), cx, y);

  y += 26;
  ctx.fillStyle = muted;
  ctx.font = "500 15px system-ui, -apple-system, sans-serif";
  const metaParts = [`Expires in ${input.expiryLabel}`];
  if (input.purpose) metaParts.push(input.purpose);
  ctx.fillText(metaParts.join("  ·  "), cx, y);

  // Revoke reassurance
  y += 44;
  ctx.fillStyle = accent;
  ctx.font = "600 15px system-ui, -apple-system, sans-serif";
  ctx.fillText("You can revoke access anytime.", cx, y);

  // Footer
  ctx.fillStyle = muted;
  ctx.font = "500 13px system-ui, -apple-system, sans-serif";
  ctx.fillText("Shared securely through DueNest", cx, H - 36);

  return canvas.toDataURL("image/png");
}

function fillWrapped(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
) {
  const words = text.split(/\s+/);
  let line = "";
  let curY = y;
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, curY);
      line = word;
      curY += lineHeight;
    } else {
      line = test;
    }
  }
  if (line) ctx.fillText(line, x, curY);
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}
