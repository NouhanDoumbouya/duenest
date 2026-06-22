import type { Metadata } from "next";

/**
 * CertaNest — internal brand preview (DRAFT).
 *
 * This route is an ISOLATED review surface for the proposed CertaNest rebrand.
 * It intentionally does NOT use the live CertaNest design tokens from globals.css —
 * every CertaNest color is inlined here so the brand foundation can be reviewed
 * without touching the shipping app. Nothing here changes the live product.
 *
 * View at: /brand-preview
 */

export const metadata: Metadata = {
  title: "CertaNest Brand Preview (Draft)",
  robots: { index: false, follow: false },
};

// --- CertaNest palette ------------------------------------------------------
const C = {
  ink: "#0B1220",
  teal: "#0F766E",
  emerald: "#10B981",
  ivory: "#F8F6F1",
  sand: "#EFE7DA",
  slate: "#64748B",
  mist: "#E2E8F0",
  gold: "#D6A85A",
  danger: "#DC2626",
  white: "#FFFFFF",
};

const HEADING_FONT = "Manrope, var(--font-heading), Inter, system-ui, sans-serif";
const BODY_FONT = "Inter, var(--font-sans), system-ui, sans-serif";
const MONO_FONT = "'Geist Mono', 'JetBrains Mono', ui-monospace, monospace";

// --- Logo concepts (inline SVG) --------------------------------------------
function SecureNestMark({ size = 64 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" role="img" aria-label="CertaNest">
      <path d="M9 27 C9 47 55 47 55 27" stroke={C.teal} strokeWidth="4.5" strokeLinecap="round" />
      <path d="M18 29 C18 41 46 41 46 29" stroke={C.teal} strokeWidth="4.5" strokeLinecap="round" opacity="0.5" />
      <path d="M25 28 L30.5 34 L42 19" stroke={C.emerald} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// Refined Concept 1: raised vertical walls (no smile), 6px wall spacing,
// uniform 4px stroke, and a smaller, centered checkmark.
function SecureNestMarkRefined({ size = 64 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" role="img" aria-label="CertaNest">
      <path d="M11 19 C11 39 15 45 32 45 C49 45 53 39 53 19" stroke={C.teal} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M17 22 C17 36 20 39 32 39 C44 39 47 36 47 22" stroke={C.teal} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" opacity="0.45" />
      <path d="M25.5 28 L30 33 L40 20" stroke={C.emerald} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SecureNestMarkRefinedDark({ size = 64 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" role="img" aria-label="CertaNest">
      <path d="M11 19 C11 39 15 45 32 45 C49 45 53 39 53 19" stroke="#5EEAD4" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M17 22 C17 36 20 39 32 39 C44 39 47 36 47 22" stroke="#5EEAD4" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" opacity="0.4" />
      <path d="M25.5 28 L30 33 L40 20" stroke={C.emerald} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// Simplified single-wall favicon tile for small-size legibility.
function RefinedFaviconTile({ size = 48 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" role="img" aria-label="CertaNest favicon">
      <rect width="64" height="64" rx="16" fill={C.ink} />
      <path d="M14 23 C14 42 18 47 32 47 C46 47 50 42 50 23" stroke="#5EEAD4" strokeWidth="5.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M24.5 31 L30 37 L41 23" stroke={C.emerald} strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function VaultedDocumentMark({ size = 64 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" role="img" aria-label="CertaNest">
      <rect x="7" y="7" width="50" height="50" rx="15" stroke={C.teal} strokeWidth="4.5" />
      <path
        d="M24 20 H35 L43 28 V42 a2 2 0 0 1 -2 2 H24 a2 2 0 0 1 -2 -2 V22 a2 2 0 0 1 2 -2 Z"
        stroke={C.teal}
        strokeWidth="3"
        strokeLinejoin="round"
        opacity="0.55"
      />
      <path d="M35 20 V28 H43" stroke={C.teal} strokeWidth="3" strokeLinejoin="round" opacity="0.55" />
      <path d="M27.5 35 L31.5 39 L39 30.5" stroke={C.emerald} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CertaintyLoopMark({ size = 64 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" role="img" aria-label="CertaNest">
      <path d="M46 18 A22 22 0 1 0 46 46" stroke={C.teal} strokeWidth="5" strokeLinecap="round" />
      <path d="M27 42 L41 22" stroke={C.emerald} strokeWidth="5" strokeLinecap="round" />
      <path d="M27 42 V27" stroke={C.teal} strokeWidth="5" strokeLinecap="round" opacity="0.55" />
      <path d="M41 22 V37" stroke={C.teal} strokeWidth="5" strokeLinecap="round" opacity="0.55" />
    </svg>
  );
}

function Wordmark({ dark = false }: { dark?: boolean }) {
  return (
    <span style={{ fontFamily: HEADING_FONT, fontWeight: 700, fontSize: 28, letterSpacing: "-0.02em" }}>
      <span style={{ color: dark ? C.ivory : C.ink }}>Certa</span>
      <span style={{ color: dark ? "#5EEAD4" : C.teal }}>Nest</span>
    </span>
  );
}

// --- Small presentational helpers ------------------------------------------
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginTop: 56 }}>
      <h2
        style={{
          fontFamily: HEADING_FONT,
          fontWeight: 600,
          fontSize: 13,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: C.slate,
          marginBottom: 20,
        }}
      >
        {title}
      </h2>
      {children}
    </section>
  );
}

function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div
      style={{
        background: C.white,
        border: `1px solid ${C.mist}`,
        borderRadius: 16,
        boxShadow: "0 1px 3px rgba(11,18,32,0.06), 0 1px 2px rgba(11,18,32,0.04)",
        padding: 24,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function Badge({ label, fg, bg }: { label: string; fg: string; bg: string }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        fontFamily: BODY_FONT,
        fontSize: 12,
        fontWeight: 600,
        color: fg,
        background: bg,
        border: `1px solid ${fg}22`,
        borderRadius: 999,
        padding: "4px 10px",
      }}
    >
      {label}
    </span>
  );
}

function Swatch({ name, hex, role }: { name: string; hex: string; role: string }) {
  return (
    <div style={{ borderRadius: 12, overflow: "hidden", border: `1px solid ${C.mist}`, background: C.white }}>
      <div style={{ background: hex, height: 72 }} />
      <div style={{ padding: "10px 12px" }}>
        <div style={{ fontFamily: BODY_FONT, fontSize: 13, fontWeight: 600, color: C.ink }}>{name}</div>
        <div style={{ fontFamily: MONO_FONT, fontSize: 12, color: C.slate, marginTop: 2 }}>{hex.toUpperCase()}</div>
        <div style={{ fontFamily: BODY_FONT, fontSize: 12, color: C.slate, marginTop: 4 }}>{role}</div>
      </div>
    </div>
  );
}

function PrimaryButton({ children, color = C.teal }: { children: React.ReactNode; color?: string }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        background: color,
        color: C.white,
        fontFamily: BODY_FONT,
        fontWeight: 600,
        fontSize: 15,
        padding: "11px 20px",
        borderRadius: 10,
        boxShadow: "0 1px 2px rgba(11,18,32,0.12)",
      }}
    >
      {children}
    </span>
  );
}

// --- Page -------------------------------------------------------------------
export default function BrandPreviewPage() {
  return (
    <main style={{ background: C.ivory, minHeight: "100vh", color: C.ink, fontFamily: BODY_FONT }}>
      <div style={{ maxWidth: 1040, margin: "0 auto", padding: "48px 24px 96px" }}>
        {/* Draft banner */}
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            fontFamily: MONO_FONT,
            fontSize: 12,
            color: C.gold,
            background: "#FFFFFF",
            border: `1px solid ${C.gold}55`,
            borderRadius: 999,
            padding: "5px 12px",
            marginBottom: 28,
          }}
        >
          DRAFT · INTERNAL BRAND PREVIEW · NOT LIVE
        </div>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <SecureNestMark size={56} />
          <Wordmark />
        </div>
        <h1 style={{ fontFamily: HEADING_FONT, fontWeight: 700, fontSize: 40, letterSpacing: "-0.025em", marginTop: 28, lineHeight: 1.1 }}>
          Life documents, deadlines, and proof —<br />ready when life asks.
        </h1>
        <p style={{ fontFamily: BODY_FONT, fontSize: 18, lineHeight: 1.6, color: C.slate, maxWidth: 620, marginTop: 16 }}>
          CertaNest is the secure nest for your life-admin — important documents, deadlines, renewals,
          subscriptions, and reusable application packs, organized and ready before life asks for them.
        </p>

        {/* Logo concepts */}
        <Section title="Logo concepts">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16 }}>
            <Card>
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <SecureNestMark />
                <Wordmark />
              </div>
              <div style={{ marginTop: 16, fontFamily: HEADING_FONT, fontWeight: 600, fontSize: 16 }}>
                1 · Secure Nest Mark
                <span style={{ marginLeft: 8, fontFamily: BODY_FONT, fontWeight: 600, fontSize: 11, color: C.emerald, background: `${C.emerald}1a`, padding: "2px 8px", borderRadius: 999 }}>
                  Recommended
                </span>
              </div>
              <p style={{ fontSize: 14, color: C.slate, marginTop: 8, lineHeight: 1.55 }}>
                Abstract protective nest with a nested checkmark. Secure + certain, no clichés.
              </p>
            </Card>
            <Card>
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <VaultedDocumentMark />
                <Wordmark />
              </div>
              <div style={{ marginTop: 16, fontFamily: HEADING_FONT, fontWeight: 600, fontSize: 16 }}>2 · Vaulted Document</div>
              <p style={{ fontSize: 14, color: C.slate, marginTop: 8, lineHeight: 1.55 }}>
                Rounded vault holding a folded document and a check. Clear and practical.
              </p>
            </Card>
            <Card>
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <CertaintyLoopMark />
                <Wordmark />
              </div>
              <div style={{ marginTop: 16, fontFamily: HEADING_FONT, fontWeight: 600, fontSize: 16 }}>3 · Certainty Loop</div>
              <p style={{ fontSize: 14, color: C.slate, marginTop: 8, lineHeight: 1.55 }}>
                Abstract protective loop suggesting C and N. Premium and tech-forward.
              </p>
            </Card>
          </div>

          {/* Dark + mono lockups for concept 1 */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 16 }}>
            <div style={{ background: C.ink, borderRadius: 16, padding: 24, display: "flex", alignItems: "center", gap: 14 }}>
              <SecureNestMarkDark />
              <Wordmark dark />
            </div>
            <Card style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <SecureNestMarkMono />
              <span style={{ fontFamily: HEADING_FONT, fontWeight: 700, fontSize: 28, letterSpacing: "-0.02em", color: C.ink }}>
                CertaNest
              </span>
            </Card>
          </div>
        </Section>

        {/* Concept 1 refinement: old vs refined */}
        <Section title="Concept 1 — refinement (old vs refined)">
          <Card>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 28 }}>
              {/* Original */}
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontFamily: HEADING_FONT, fontWeight: 600, fontSize: 15 }}>Original</span>
                  <Badge label="v1" fg={C.slate} bg={`${C.slate}1a`} />
                </div>
                <div style={{ display: "flex", alignItems: "flex-end", gap: 18, marginTop: 18, minHeight: 80 }}>
                  {[24, 32, 48, 64].map((s) => (
                    <div key={s} style={{ textAlign: "center" }}>
                      <SecureNestMark size={s} />
                      <div style={{ fontFamily: MONO_FONT, fontSize: 11, color: C.slate, marginTop: 6 }}>{s}px</div>
                    </div>
                  ))}
                </div>
              </div>
              {/* Refined */}
              <div style={{ borderLeft: `1px solid ${C.mist}`, paddingLeft: 28 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontFamily: HEADING_FONT, fontWeight: 600, fontSize: 15 }}>Refined</span>
                  <Badge label="v2 · recommended" fg={C.emerald} bg={`${C.emerald}1a`} />
                </div>
                <div style={{ display: "flex", alignItems: "flex-end", gap: 18, marginTop: 18, minHeight: 80 }}>
                  {[24, 32, 48, 64].map((s) => (
                    <div key={s} style={{ textAlign: "center" }}>
                      <SecureNestMarkRefined size={s} />
                      <div style={{ fontFamily: MONO_FONT, fontSize: 11, color: C.slate, marginTop: 6 }}>{s}px</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* What changed */}
            <ul style={{ margin: "24px 0 0", padding: 0, listStyle: "none", display: "grid", gap: 8 }}>
              {[
                "Checkmark ~15% smaller and re-centered — it nests inside the mark instead of dominating it.",
                "Walls rise vertically before curving in, so the mark reads as a protective vault-nest, not a smile.",
                "Side endpoints raised (y27 → y19) for a more enclosing, secure container.",
                "Uniform 4px stroke across all three paths (was 4.5 / 4.5 / 5) for consistent weight and spacing.",
              ].map((t, i) => (
                <li key={i} style={{ display: "flex", gap: 10, fontFamily: BODY_FONT, fontSize: 14, color: C.ink, lineHeight: 1.5 }}>
                  <span style={{ color: C.emerald, fontWeight: 700 }}>✓</span>
                  <span>{t}</span>
                </li>
              ))}
            </ul>
          </Card>
        </Section>

        {/* Pixel test at all requested sizes */}
        <Section title="Refined icon · pixel test (16 → 512px)">
          <Card>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 28, overflowX: "auto", paddingBottom: 8 }}>
              {[16, 24, 32, 48, 128, 512].map((s) => (
                <div key={s} style={{ textAlign: "center", flex: "0 0 auto" }}>
                  <SecureNestMarkRefined size={s} />
                  <div style={{ fontFamily: MONO_FONT, fontSize: 11, color: C.slate, marginTop: 8 }}>{s}px</div>
                </div>
              ))}
            </div>
            <p style={{ fontFamily: BODY_FONT, fontSize: 13, color: C.slate, marginTop: 14 }}>
              The full two-wall mark holds down to ~24px. Below that, the dedicated single-wall favicon is used.
            </p>
          </Card>
        </Section>

        {/* Favicon + app icon */}
        <Section title="Refined favicon &amp; app icon">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 16 }}>
            <Card>
              <div style={{ fontFamily: HEADING_FONT, fontWeight: 600, fontSize: 15, marginBottom: 16 }}>
                Simplified favicon
              </div>
              <div style={{ display: "flex", alignItems: "flex-end", gap: 16 }}>
                {[16, 24, 32, 48].map((s) => (
                  <div key={s} style={{ textAlign: "center" }}>
                    <RefinedFaviconTile size={s} />
                    <div style={{ fontFamily: MONO_FONT, fontSize: 11, color: C.slate, marginTop: 6 }}>{s}px</div>
                  </div>
                ))}
              </div>
            </Card>
            <Card style={{ background: C.ink }}>
              <div style={{ fontFamily: HEADING_FONT, fontWeight: 600, fontSize: 15, marginBottom: 16, color: C.ivory }}>
                Refined mark on ink
              </div>
              <div style={{ display: "flex", alignItems: "flex-end", gap: 20 }}>
                <SecureNestMarkRefinedDark size={48} />
                <SecureNestMarkRefinedDark size={96} />
              </div>
            </Card>
          </div>
        </Section>

        {/* Color palette */}
        <Section title="Color palette">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12 }}>
            <Swatch name="Primary Ink" hex={C.ink} role="Text / dark surfaces" />
            <Swatch name="Certa Teal" hex={C.teal} role="Primary action" />
            <Swatch name="Secure Emerald" hex={C.emerald} role="Success / ready" />
            <Swatch name="Warm Ivory" hex={C.ivory} role="Page background" />
            <Swatch name="Soft Sand" hex={C.sand} role="Warm section fill" />
            <Swatch name="Slate Text" hex={C.slate} role="Secondary text" />
            <Swatch name="Border Mist" hex={C.mist} role="Borders / dividers" />
            <Swatch name="Premium Gold" hex={C.gold} role="Accent (sparingly)" />
            <Swatch name="Danger Red" hex={C.danger} role="Errors / overdue" />
            <Swatch name="White" hex={C.white} role="Cards / surfaces" />
          </div>
        </Section>

        {/* Typography */}
        <Section title="Typography">
          <Card>
            <div style={{ fontFamily: HEADING_FONT, fontWeight: 700, fontSize: 36, letterSpacing: "-0.025em" }}>
              Manrope — Headings
            </div>
            <div style={{ fontFamily: HEADING_FONT, fontWeight: 600, fontSize: 22, marginTop: 8 }}>
              Premium, calm, organized.
            </div>
            <p style={{ fontFamily: BODY_FONT, fontSize: 16, lineHeight: 1.6, color: C.ink, marginTop: 16, maxWidth: 640 }}>
              Inter — Body / UI. The quick brown fox jumps over the lazy dog. CertaNest keeps important
              documents, deadlines, renewals, and proof organized and ready when life asks.
            </p>
            <div style={{ fontFamily: MONO_FONT, fontSize: 13, color: C.slate, marginTop: 16 }}>
              Geist&nbsp;Mono — EXPIRES_2026-09-14 · REF#CN-48213 · STATUS: READY
            </div>
            <p style={{ fontFamily: BODY_FONT, fontSize: 12, color: C.slate, marginTop: 12 }}>
              (Manrope is the target heading face. If not yet installed in this preview environment it
              falls back to the app heading font — the live rebrand will load Manrope properly.)
            </p>
          </Card>
        </Section>

        {/* Buttons */}
        <Section title="Buttons">
          <Card>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
              <PrimaryButton>Get started</PrimaryButton>
              <span style={{ display: "inline-flex", alignItems: "center", background: C.white, color: C.ink, fontFamily: BODY_FONT, fontWeight: 600, fontSize: 15, padding: "11px 20px", borderRadius: 10, border: `1px solid ${C.mist}` }}>
                Secondary
              </span>
              <span style={{ display: "inline-flex", alignItems: "center", color: C.slate, fontFamily: BODY_FONT, fontWeight: 600, fontSize: 15, padding: "11px 14px", borderRadius: 10 }}>
                Ghost
              </span>
              <PrimaryButton color={C.emerald}>Mark ready</PrimaryButton>
              <span style={{ display: "inline-flex", alignItems: "center", color: C.danger, fontFamily: BODY_FONT, fontWeight: 600, fontSize: 15, padding: "11px 20px", borderRadius: 10, border: `1px solid ${C.danger}55` }}>
                Delete
              </span>
            </div>
          </Card>
        </Section>

        {/* Cards */}
        <Section title="Cards">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 16 }}>
            <Card>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}>
                <div style={{ fontFamily: HEADING_FONT, fontWeight: 600, fontSize: 17 }}>Passport</div>
                <Badge label="Due soon" fg={C.gold} bg={`${C.gold}1f`} />
              </div>
              <div style={{ fontFamily: MONO_FONT, fontSize: 12, color: C.slate, marginTop: 10 }}>RENEWS · 2026-09-14</div>
              <p style={{ fontSize: 14, color: C.slate, marginTop: 8, lineHeight: 1.55 }}>
                Everything you need is in your nest and ready to go.
              </p>
              <div style={{ marginTop: 16 }}>
                <PrimaryButton>Review renewal</PrimaryButton>
              </div>
            </Card>
            <Card>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}>
                <div style={{ fontFamily: HEADING_FONT, fontWeight: 600, fontSize: 17 }}>Tenancy pack</div>
                <Badge label="Ready" fg={C.emerald} bg={`${C.emerald}1a`} />
              </div>
              <p style={{ fontSize: 14, color: C.slate, marginTop: 10, lineHeight: 1.55 }}>
                5 documents · reusable application pack. Private until you share it.
              </p>
              <div style={{ marginTop: 16 }}>
                <span style={{ display: "inline-flex", alignItems: "center", background: C.white, color: C.ink, fontFamily: BODY_FONT, fontWeight: 600, fontSize: 14, padding: "9px 16px", borderRadius: 10, border: `1px solid ${C.mist}` }}>
                  Share safely
                </span>
              </div>
            </Card>
            <Card style={{ background: C.sand, border: `1px solid ${C.mist}` }}>
              <div style={{ fontFamily: HEADING_FONT, fontWeight: 600, fontSize: 17 }}>Emergency access</div>
              <p style={{ fontSize: 14, color: C.slate, marginTop: 10, lineHeight: 1.55 }}>
                The right people can reach the right documents when it matters. You stay in control.
              </p>
            </Card>
          </div>
        </Section>

        {/* Inputs */}
        <Section title="Input fields">
          <Card style={{ maxWidth: 460 }}>
            <label style={{ fontFamily: BODY_FONT, fontSize: 13, fontWeight: 600, color: C.ink }}>Document name</label>
            <div
              style={{
                marginTop: 6,
                background: C.white,
                border: `1px solid ${C.mist}`,
                borderRadius: 10,
                padding: "11px 14px",
                color: C.slate,
                fontFamily: BODY_FONT,
                fontSize: 15,
              }}
            >
              e.g. Passport, Tenancy agreement…
            </div>
            <label style={{ fontFamily: BODY_FONT, fontSize: 13, fontWeight: 600, color: C.ink, marginTop: 16, display: "block" }}>
              Renewal date
            </label>
            <div
              style={{
                marginTop: 6,
                background: C.white,
                border: `2px solid ${C.teal}`,
                boxShadow: `0 0 0 4px ${C.teal}1f`,
                borderRadius: 10,
                padding: "10px 13px",
                color: C.ink,
                fontFamily: MONO_FONT,
                fontSize: 15,
              }}
            >
              2026-09-14
            </div>
            <div style={{ fontFamily: BODY_FONT, fontSize: 12, color: C.slate, marginTop: 8 }}>
              Focused field state · Certa Teal ring.
            </div>
            <label style={{ fontFamily: BODY_FONT, fontSize: 13, fontWeight: 600, color: C.ink, marginTop: 16, display: "block" }}>
              Reference
            </label>
            <div
              style={{
                marginTop: 6,
                background: C.white,
                border: `1px solid ${C.danger}`,
                borderRadius: 10,
                padding: "11px 14px",
                color: C.ink,
                fontFamily: BODY_FONT,
                fontSize: 15,
              }}
            >
              &nbsp;
            </div>
            <div style={{ fontFamily: BODY_FONT, fontSize: 12, color: C.danger, marginTop: 6 }}>
              This field is required.
            </div>
          </Card>
        </Section>

        {/* Status badges */}
        <Section title="Status badges">
          <Card>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
              <Badge label="Ready" fg={C.emerald} bg={`${C.emerald}1a`} />
              <Badge label="Verified" fg={C.emerald} bg={`${C.emerald}1a`} />
              <Badge label="Due soon" fg="#9A6B16" bg={`${C.gold}26`} />
              <Badge label="Overdue" fg={C.danger} bg={`${C.danger}14`} />
              <Badge label="Draft" fg={C.slate} bg={`${C.slate}1a`} />
              <Badge label="Private" fg={C.teal} bg={`${C.teal}14`} />
            </div>
          </Card>
        </Section>

        {/* Email header/footer */}
        <Section title="Email header / footer">
          <Card style={{ padding: 0, overflow: "hidden", maxWidth: 600 }}>
            <div style={{ padding: "20px 24px", borderBottom: `1px solid ${C.mist}`, display: "flex", alignItems: "center", gap: 12 }}>
              <SecureNestMark size={36} />
              <span style={{ fontFamily: HEADING_FONT, fontWeight: 700, fontSize: 20, letterSpacing: "-0.02em" }}>
                <span style={{ color: C.ink }}>Certa</span>
                <span style={{ color: C.teal }}>Nest</span>
              </span>
            </div>
            <div style={{ padding: 24 }}>
              <div style={{ fontFamily: HEADING_FONT, fontWeight: 600, fontSize: 18 }}>Your passport renewal is coming up</div>
              <p style={{ fontFamily: BODY_FONT, fontSize: 15, lineHeight: 1.6, color: C.ink, marginTop: 10 }}>
                Hi Alex — your passport is set to renew on{" "}
                <span style={{ fontFamily: MONO_FONT }}>2026-09-14</span> (in 84 days). Everything you need
                is already in your nest and ready to go.
              </p>
              <div style={{ marginTop: 16 }}>
                <PrimaryButton>Review renewal</PrimaryButton>
              </div>
            </div>
            <div style={{ background: C.sand, padding: "16px 24px", fontFamily: BODY_FONT, fontSize: 12, color: C.slate }}>
              Private until you share it · Original documents preserved.<br />
              You&apos;re receiving this because you set a renewal reminder in CertaNest. Manage · Unsubscribe
            </div>
          </Card>
        </Section>

        {/* Landing hero copy sample */}
        <Section title="Landing hero copy sample">
          <div style={{ background: C.ink, borderRadius: 20, padding: 40 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
              <SecureNestMarkDark size={40} />
              <Wordmark dark />
            </div>
            <div style={{ fontFamily: HEADING_FONT, fontWeight: 700, fontSize: 38, letterSpacing: "-0.025em", color: C.ivory, lineHeight: 1.12, maxWidth: 720 }}>
              Life documents, deadlines, and proof — ready when life asks.
            </div>
            <p style={{ fontFamily: BODY_FONT, fontSize: 17, lineHeight: 1.6, color: "#B8C0CC", maxWidth: 560, marginTop: 16 }}>
              Your life-admin, securely organized. Important documents, deadlines, renewals, subscriptions,
              and reusable application packs — calm, secure, and ready.
            </p>
            <div style={{ display: "flex", gap: 12, marginTop: 24, alignItems: "center" }}>
              <PrimaryButton>Get started</PrimaryButton>
              <span style={{ fontFamily: BODY_FONT, fontSize: 13, color: "#8A93A3" }}>Private until you share it.</span>
            </div>
          </div>
        </Section>

        <p style={{ marginTop: 64, fontFamily: BODY_FONT, fontSize: 13, color: C.slate, textAlign: "center" }}>
          CertaNest brand foundation — draft for review. Source: <span style={{ fontFamily: MONO_FONT }}>brand/certanest/</span>
        </p>
      </div>
    </main>
  );
}

// Dark / mono variants of the recommended mark, kept local to the preview.
function SecureNestMarkDark({ size = 64 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" role="img" aria-label="CertaNest">
      <path d="M9 27 C9 47 55 47 55 27" stroke="#5EEAD4" strokeWidth="4.5" strokeLinecap="round" />
      <path d="M18 29 C18 41 46 41 46 29" stroke="#5EEAD4" strokeWidth="4.5" strokeLinecap="round" opacity="0.45" />
      <path d="M25 28 L30.5 34 L42 19" stroke={C.emerald} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SecureNestMarkMono({ size = 64 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" role="img" aria-label="CertaNest">
      <path d="M9 27 C9 47 55 47 55 27" stroke={C.ink} strokeWidth="4.5" strokeLinecap="round" />
      <path d="M18 29 C18 41 46 41 46 29" stroke={C.ink} strokeWidth="4.5" strokeLinecap="round" opacity="0.45" />
      <path d="M25 28 L30.5 34 L42 19" stroke={C.ink} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
