import { Globe } from "lucide-react";

/**
 * A calm, scrolling strip of the document types CertaNest is built around —
 * inspired by the "global coverage" marquee on premium SaaS sites, but framed
 * honestly: CertaNest is country-agnostic, so this signals breadth ("works with
 * the documents that matter, from anywhere") rather than a coverage claim.
 *
 * Pure CSS marquee (see `.marquee` / `.marquee-track` in globals.css): the chip
 * list is rendered twice so the loop is seamless, pauses on hover, and freezes
 * under `prefers-reduced-motion`. Server component — no client JS.
 */
const DOCUMENTS = [
  "Passport",
  "Visa",
  "National ID",
  "Driver's license",
  "Residence permit",
  "Birth certificate",
  "Insurance",
  "Degree certificate",
  "Bank statement",
  "Tenancy agreement",
  "Tax document",
  "Vaccination record",
];

function Chip({ label }: { label: string }) {
  return (
    <span className="inline-flex shrink-0 items-center rounded-full border border-border bg-card px-4 py-1.5 text-sm font-medium text-foreground/80 shadow-xs">
      {label}
    </span>
  );
}

export function CoverageStrip() {
  return (
    <section
      aria-label="Document types CertaNest is built for"
      className="overflow-hidden border-y border-border bg-card/40 py-12 sm:py-14"
    >
      <div className="mx-auto mb-8 flex w-full max-w-6xl items-center justify-center gap-2 px-4 text-center sm:px-6">
        <Globe className="size-4 shrink-0 text-brand-teal" aria-hidden />
        <p className="text-sm font-medium text-muted-foreground">
          Built for the documents that matter — from anywhere in the world.
        </p>
      </div>

      <div className="marquee">
        {/* aria-hidden: this is decorative motion; the heading above conveys the
            meaning, and the full list is not essential reading. */}
        <div className="marquee-track gap-3" aria-hidden>
          {[...DOCUMENTS, ...DOCUMENTS].map((doc, i) => (
            <Chip key={`${doc}-${i}`} label={doc} />
          ))}
        </div>
      </div>
    </section>
  );
}
