"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Building2, Loader2 } from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageContainer } from "@/components/ui/page-container";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/lib/api";
import {
  ORGANIZATION_TYPE_LABELS,
  createOrganization,
} from "@/lib/organizations";
import { cn } from "@/lib/utils";
import type { OrganizationType } from "@/types/organizations";

const ORGANIZATION_TYPES = Object.entries(ORGANIZATION_TYPE_LABELS) as Array<
  [OrganizationType, string]
>;

export default function NewOrganizationPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [organizationType, setOrganizationType] =
    useState<OrganizationType>("student_association");
  const [description, setDescription] = useState("");
  const [country, setCountry] = useState("");
  const [website, setWebsite] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const organization = await createOrganization({
        name,
        organization_type: organizationType,
        description,
        country,
        website,
      });
      router.push(`/dashboard/organizations/${organization.id}`);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Unable to create organization.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <PageContainer width="narrow">
      <Link
        href="/dashboard/organizations"
        className={cn(buttonVariants({ variant: "ghost" }), "w-fit")}
      >
        <ArrowLeft className="size-4" />
        Organizations
      </Link>

      <div>
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          New workspace
        </p>
        <h1 className="mt-2 font-heading text-3xl font-semibold tracking-tight">
          Create organization
        </h1>
        <p className="mt-1.5 text-muted-foreground">
          Set up a shared workspace for documents, requests, bundles, and team
          deadlines.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-xl">
            <Building2 className="size-5 text-primary" />
            Workspace details
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form className="space-y-5" onSubmit={handleSubmit}>
            {error && (
              <p
                className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
                role="alert"
              >
                {error}
              </p>
            )}

            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
                placeholder="CertaNest Student Association"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="organization_type">Type</Label>
                <select
                  id="organization_type"
                  value={organizationType}
                  onChange={(event) =>
                    setOrganizationType(event.target.value as OrganizationType)
                  }
                  className="h-10 w-full rounded-lg border border-border bg-card px-3 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  {ORGANIZATION_TYPES.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
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
              <Label htmlFor="website">Website</Label>
              <Input
                id="website"
                type="url"
                value={website}
                onChange={(event) => setWebsite(event.target.value)}
                placeholder="https://example.org"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="What this team manages in CertaNest."
                rows={4}
              />
            </div>

            <Button type="submit" size="lg" disabled={submitting || !name.trim()}>
              {submitting && <Loader2 className="size-4 animate-spin" />}
              Create organization
            </Button>
          </form>
        </CardContent>
      </Card>
    </PageContainer>
  );
}
