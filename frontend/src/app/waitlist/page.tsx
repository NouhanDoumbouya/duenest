"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  Clock3,
  FileCheck2,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/lib/api";
import { joinWaitlist } from "@/lib/private-beta";
import type { WaitlistPersona } from "@/types/private-beta";

const personaOptions: { value: WaitlistPersona; label: string }[] = [
  { value: "international_student", label: "International student" },
  { value: "visa_holder", label: "Visa holder" },
  { value: "scholarship_applicant", label: "Scholarship applicant" },
  { value: "freelancer", label: "Freelancer" },
  { value: "family_documents", label: "Family documents" },
  { value: "traveler", label: "Traveler" },
  { value: "student_leader", label: "Student leader" },
  { value: "other", label: "Other" },
];

export default function WaitlistPage() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [persona, setPersona] = useState<WaitlistPersona>("international_student");
  const [country, setCountry] = useState("");
  const [message, setMessage] = useState("");
  const [referralSource, setReferralSource] = useState("");
  const [submittedEmail, setSubmittedEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const result = await joinWaitlist({
        full_name: fullName,
        email,
        persona,
        country: country || undefined,
        message: message || undefined,
        referral_source: referralSource || undefined,
      });
      setSubmittedEmail(result.email);
      setFullName("");
      setEmail("");
      setCountry("");
      setMessage("");
      setReferralSource("");
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Unable to join the waitlist. Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <SiteHeader />
      <main className="min-h-dvh bg-background">
        <section className="border-b border-border bg-card/50">
          <div className="mx-auto grid w-full max-w-6xl gap-10 px-4 py-14 sm:px-6 lg:grid-cols-[0.95fr_1.05fr] lg:py-20">
            <div className="flex flex-col justify-center">
              <span className="inline-flex w-fit items-center gap-2 rounded-full border border-border bg-background px-3 py-1 text-xs font-medium text-muted-foreground">
                <Clock3 className="size-3.5 text-primary" />
                Private beta access
              </span>
              <h1 className="mt-5 max-w-2xl font-heading text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
                Join the DueNest private beta waitlist
              </h1>
              <p className="mt-5 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
                DueNest is opening carefully to people managing visas,
                scholarships, renewals, applications, and family documents. Tell
                us what you are organizing so the beta stays focused.
              </p>
              <div className="mt-8 grid gap-3 text-sm text-muted-foreground sm:grid-cols-3">
                <span className="flex items-center gap-2">
                  <FileCheck2 className="size-4 text-brand-success" />
                  Documents
                </span>
                <span className="flex items-center gap-2">
                  <ShieldCheck className="size-4 text-brand-success" />
                  Private by design
                </span>
                <span className="flex items-center gap-2">
                  <Sparkles className="size-4 text-brand-success" />
                  Founder reviewed
                </span>
              </div>
            </div>

            <Card className="shadow-elevated">
              <CardContent className="p-6 sm:p-8">
                {submittedEmail ? (
                  <div className="flex min-h-[520px] flex-col items-center justify-center text-center">
                    <span className="flex size-14 items-center justify-center rounded-xl bg-brand-success/10 text-brand-success">
                      <CheckCircle2 className="size-7" />
                    </span>
                    <h2 className="mt-5 font-heading text-2xl font-semibold">
                      You are on the private beta waitlist
                    </h2>
                    <p className="mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">
                      We received your request for {submittedEmail}. If there is
                      a strong fit for the current beta cohort, you will receive
                      an invite code from the founder.
                    </p>
                    <div className="mt-7 flex flex-col gap-3 sm:flex-row">
                      <Button onClick={() => setSubmittedEmail("")}>
                        Add another person
                      </Button>
                      <Link href="/" className={buttonVariants({ variant: "outline" })}>
                        Back to home
                      </Link>
                    </div>
                  </div>
                ) : (
                  <form className="space-y-5" onSubmit={handleSubmit} noValidate>
                    <div>
                      <h2 className="font-heading text-2xl font-semibold">
                        Request beta access
                      </h2>
                      <p className="mt-2 text-sm text-muted-foreground">
                        Short applications are easier to review. Share only what
                        helps us understand your document workflow.
                      </p>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="full_name">Full name</Label>
                        <Input
                          id="full_name"
                          required
                          value={fullName}
                          onChange={(event) => setFullName(event.target.value)}
                          placeholder="Amina Yusuf"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="email">Email</Label>
                        <Input
                          id="email"
                          type="email"
                          required
                          value={email}
                          onChange={(event) => setEmail(event.target.value)}
                          placeholder="you@example.com"
                        />
                      </div>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="persona">Main use case</Label>
                        <select
                          id="persona"
                          className="flex h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                          value={persona}
                          onChange={(event) =>
                            setPersona(event.target.value as WaitlistPersona)
                          }
                        >
                          {personaOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="country">Country</Label>
                        <Input
                          id="country"
                          value={country}
                          onChange={(event) => setCountry(event.target.value)}
                          placeholder="Malaysia"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="message">What are you organizing?</Label>
                      <Textarea
                        id="message"
                        value={message}
                        onChange={(event) => setMessage(event.target.value)}
                        placeholder="Visa renewals, scholarship paperwork, family IDs, insurance renewals..."
                        rows={4}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="referral_source">How did you hear about DueNest?</Label>
                      <Input
                        id="referral_source"
                        value={referralSource}
                        onChange={(event) => setReferralSource(event.target.value)}
                        placeholder="Founder, university group, friend, LinkedIn..."
                      />
                    </div>

                    {error && (
                      <p
                        className="rounded-lg bg-destructive/10 px-3 py-2.5 text-sm text-destructive"
                        role="alert"
                      >
                        {error}
                      </p>
                    )}

                    <Button type="submit" className="h-11 w-full" disabled={submitting}>
                      {submitting ? "Joining waitlist..." : "Join the waitlist"}
                      <ArrowRight className="size-4" />
                    </Button>
                  </form>
                )}
              </CardContent>
            </Card>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
