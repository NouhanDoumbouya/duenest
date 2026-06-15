"use client";

import { useEffect, useMemo, useState } from "react";
import { Download, Loader2, Printer, QrCode } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { generateQrDataUrl } from "@/components/quick-share/shared";
import {
  DEFAULT_CARD_OPTIONS,
  PRINT_FORMATS,
  type PrintFormat,
  type PrintableCardOptions,
  buildPrintableCardData,
  getPrintFormatDimensions,
} from "@/lib/emergency-protocol";
import { cn } from "@/lib/utils";
import type { EmergencyPack } from "@/types/emergency";

interface Props {
  pack: EmergencyPack;
  /** Absolute public viewer URL encoded into the QR; null while inactive. */
  viewerUrl: string | null;
  contactName?: string;
  contactPhone?: string;
  note?: string;
  code?: string;
}

const PRIVACY_TOGGLES: { key: keyof PrintableCardOptions; label: string }[] = [
  { key: "includeQr", label: "QR code" },
  { key: "includeCode", label: "Access code" },
  { key: "includeName", label: "My name" },
  { key: "includeContactName", label: "Trusted contact name" },
  { key: "includeContactPhone", label: "Trusted contact phone" },
  { key: "includeNote", label: "Emergency note" },
];

/**
 * Emergency QR + printable card. The QR encodes the public request page (it does
 * not unlock documents by itself unless the pack uses instant-with-code). Print
 * uses an isolated window so the dashboard chrome never appears on the card.
 */
export function EmergencyQrCard({
  pack,
  viewerUrl,
  contactName,
  contactPhone,
  note,
  code,
}: Props) {
  const [format, setFormat] = useState<PrintFormat>("wallet");
  const [options, setOptions] = useState<PrintableCardOptions>(DEFAULT_CARD_OPTIONS);
  // QR is cached by the URL it encodes. `generating` is derived (no synchronous
  // setState inside the effect) — setState only happens in the async callbacks.
  const [qr, setQr] = useState<{ key: string; url: string | null }>({
    key: "",
    url: null,
  });
  const qrUrl = options.includeQr ? qr.url : null;
  const generating =
    !!viewerUrl && options.includeQr && qr.key !== viewerUrl;

  const dims = getPrintFormatDimensions(format);
  const cardData = useMemo(
    () =>
      buildPrintableCardData(pack, options, {
        code,
        name: pack.title,
        contactName,
        contactPhone,
        note,
      }),
    [pack, options, code, contactName, contactPhone, note],
  );

  useEffect(() => {
    if (!viewerUrl || !options.includeQr) return;
    if (qr.key === viewerUrl) return; // already generated for this URL
    let active = true;
    generateQrDataUrl(viewerUrl, 420)
      .then((url) => active && setQr({ key: viewerUrl, url }))
      .catch(() => active && setQr({ key: viewerUrl, url: null }));
    return () => {
      active = false;
    };
  }, [viewerUrl, options.includeQr, qr.key]);

  function toggle(key: keyof PrintableCardOptions) {
    setOptions((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function downloadPng() {
    if (!qrUrl) return;
    const a = document.createElement("a");
    a.href = qrUrl;
    a.download = `emergency-qr-${pack.id}.png`;
    a.click();
  }

  function printCard() {
    const win = window.open("", "_blank", "width=720,height=900");
    if (!win) return;
    const rows: string[] = [];
    if (cardData.name) rows.push(`<p class="row">${escapeHtml(cardData.name)}</p>`);
    rows.push(`<p class="muted">${escapeHtml(cardData.instruction)}</p>`);
    rows.push(`<p class="muted">${escapeHtml(cardData.lockedMessage)}</p>`);
    if (cardData.code) rows.push(`<p class="code">Code: ${escapeHtml(cardData.code)}</p>`);
    if (cardData.contactName)
      rows.push(`<p class="row">Contact: ${escapeHtml(cardData.contactName)}</p>`);
    if (cardData.contactPhone)
      rows.push(`<p class="row">${escapeHtml(cardData.contactPhone)}</p>`);
    if (cardData.note) rows.push(`<p class="muted">${escapeHtml(cardData.note)}</p>`);
    rows.push(`<p class="muted small">${escapeHtml(cardData.selectedOnlyMessage)}</p>`);
    win.document.write(`<!doctype html><html><head><meta charset="utf-8" />
      <title>${escapeHtml(cardData.heading)}</title>
      <style>
        @page { size: ${dims.widthMm}mm ${dims.heightMm}mm; margin: 6mm; }
        * { box-sizing: border-box; font-family: system-ui, sans-serif; }
        body { margin: 0; color: #0b1220; }
        .card { width: 100%; text-align: center; padding: 4mm; }
        h1 { font-size: 13pt; margin: 0 0 3mm; }
        img { width: 42mm; height: 42mm; }
        .row { font-size: 10pt; margin: 1mm 0; font-weight: 600; }
        .muted { font-size: 9pt; color: #475569; margin: 1mm 0; }
        .small { font-size: 7.5pt; }
        .code { font-size: 12pt; font-weight: 700; letter-spacing: 0.5px; margin: 2mm 0; }
      </style></head><body>
      <div class="card">
        <h1>${escapeHtml(cardData.heading)}</h1>
        ${options.includeQr && qrUrl ? `<img src="${qrUrl}" alt="Emergency QR" />` : ""}
        ${rows.join("\n")}
      </div>
      <script>window.onload = function(){ setTimeout(function(){ window.print(); }, 200); };</script>
      </body></html>`);
    win.document.close();
  }

  return (
    <div className="space-y-5">
      {!viewerUrl && (
        <p className="rounded-lg border border-dashed border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          Activate emergency access to generate the QR and printable card.
        </p>
      )}

      <div className="grid gap-5 sm:grid-cols-[auto_1fr]">
        {/* QR preview */}
        <div className="flex flex-col items-center gap-2">
          <div className="flex size-40 items-center justify-center rounded-xl border border-border bg-white p-2">
            {generating ? (
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            ) : qrUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={qrUrl} alt="Emergency QR code" className="size-full" />
            ) : (
              <QrCode className="size-10 text-muted-foreground" />
            )}
          </div>
          <p className="max-w-40 text-center text-xs text-muted-foreground">
            {pack.unlock_mode === "instant_code"
              ? "Scanning opens selected documents with the code."
              : "Scanning starts a request — it does not unlock documents immediately."}
          </p>
        </div>

        {/* Controls */}
        <div className="space-y-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="card-format">Print format</Label>
            <select
              id="card-format"
              value={format}
              onChange={(e) => setFormat(e.target.value as PrintFormat)}
              className="h-10 w-full rounded-lg border border-input bg-card px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              {PRINT_FORMATS.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">{dims.description}</p>
          </div>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">What to print</legend>
            <div className="grid grid-cols-2 gap-2">
              {PRIVACY_TOGGLES.map((t) => (
                <label
                  key={t.key}
                  className="flex items-center gap-2 text-xs text-muted-foreground"
                >
                  <input
                    type="checkbox"
                    checked={options[t.key]}
                    onChange={() => toggle(t.key)}
                    className="size-4 rounded border-input"
                  />
                  {t.label}
                </label>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Privacy-safe by default. We never print document contents, ID
              numbers, or your location.
            </p>
          </fieldset>

          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" onClick={printCard} disabled={!viewerUrl}>
              <Printer className="size-4" />
              Print card
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={downloadPng}
              disabled={!qrUrl}
            >
              <Download className="size-4" />
              Download QR (PNG)
            </Button>
          </div>
        </div>
      </div>

      <p
        className={cn(
          "rounded-lg bg-accent/40 px-3 py-2 text-xs text-accent-foreground",
        )}
      >
        Regenerating the QR makes previously printed or shared cards stop working.
        Test access before printing, and keep printed cards with people or places
        you trust.
      </p>
    </div>
  );
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
