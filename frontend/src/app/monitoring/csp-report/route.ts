// CSP violation collector.
//
// The report-only Content-Security-Policy (next.config.ts) points here, so when
// the policy *would* have blocked something, the browser POSTs a violation
// report to this endpoint. We log a compact summary to the server logs (visible
// in the Vercel dashboard) so we can see exactly what a real *enforcing* CSP
// needs to allow — then promote the policy from Report-Only to enforced safely.
//
// Deliberately minimal and side-effect-free: store nothing, always answer 204,
// never throw. Reports are unauthenticated by spec, so we cap the body size and
// don't trust the payload shape.

export const dynamic = "force-dynamic";

const MAX_BODY = 16 * 1024; // drop oversized/spam payloads

function pick(obj: unknown, ...keys: string[]): string | undefined {
  if (!obj || typeof obj !== "object") return undefined;
  const rec = obj as Record<string, unknown>;
  for (const k of keys) {
    const v = rec[k];
    if (typeof v === "string" && v) return v;
  }
  return undefined;
}

export async function POST(request: Request): Promise<Response> {
  try {
    const text = await request.text();
    if (text && text.length <= MAX_BODY) {
      let parsed: unknown = null;
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = null;
      }
      // Two shapes: report-uri sends {"csp-report": {...}}; the Reporting API
      // sends an array of {type, body}. Normalize to the few useful fields.
      const reports = Array.isArray(parsed) ? parsed : [parsed];
      for (const report of reports) {
        const body = pick(report, "type")
          ? (report as Record<string, unknown>).body
          : ((report as Record<string, unknown> | null)?.["csp-report"] ??
            report);
        const directive = pick(
          body,
          "violated-directive",
          "effectiveDirective",
          "effective-directive",
        );
        const blocked = pick(body, "blocked-uri", "blockedURL", "blocked-url");
        const doc = pick(body, "document-uri", "documentURL", "document-url");
        if (directive || blocked) {
          console.warn(
            `[csp-report] directive=${directive ?? "?"} blocked=${blocked ?? "?"} doc=${doc ?? "?"}`,
          );
        }
      }
    }
  } catch {
    // A reporting sink must never error — swallow and acknowledge.
  }
  return new Response(null, { status: 204 });
}

export function GET(): Response {
  return new Response(null, { status: 405, headers: { Allow: "POST" } });
}
