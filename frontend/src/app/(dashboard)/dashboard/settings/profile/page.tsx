"use client";

import { useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Check,
  CreditCard,
  Database,
  Loader2,
  Lock,
  ShieldCheck,
  Trash2,
  Upload,
  UserRound,
} from "lucide-react";

import {
  useDashboardUser,
  useSetDashboardUser,
} from "@/components/dashboard/user-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageContainer } from "@/components/ui/page-container";
import { PageHeader } from "@/components/ui/page-header";
import { SectionCard } from "@/components/ui/section-card";
import { ApiError } from "@/lib/api";
import { removeAvatar, updateProfile, uploadAvatar } from "@/lib/auth";

const ACCOUNT_AREAS = [
  { label: "Plan & Billing", href: "/dashboard/settings/billing", icon: CreditCard },
  { label: "Data & privacy", href: "/dashboard/settings/data", icon: Database },
  { label: "AI settings", href: "/dashboard/settings/ai", icon: Lock },
  { label: "Trust & security", href: "/dashboard/trust", icon: ShieldCheck },
];

export default function ProfilePage() {
  const user = useDashboardUser();
  const setUser = useSetDashboardUser();

  const [firstName, setFirstName] = useState(user.first_name ?? "");
  const [lastName, setLastName] = useState(user.last_name ?? "");
  const [savingName, setSavingName] = useState(false);
  const [nameSaved, setNameSaved] = useState(false);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const avatar = user.profile_image_url ?? "";
  const hasUploaded = avatar.startsWith("data:");

  async function handlePick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-picking the same file
    if (!file) return;
    setAvatarBusy(true);
    setError(null);
    try {
      setUser(await uploadAvatar(file));
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Couldn't upload that image.",
      );
    } finally {
      setAvatarBusy(false);
    }
  }

  async function handleRemove() {
    setAvatarBusy(true);
    setError(null);
    try {
      setUser(await removeAvatar());
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Couldn't remove your photo.",
      );
    } finally {
      setAvatarBusy(false);
    }
  }

  async function handleSaveName(e: FormEvent) {
    e.preventDefault();
    setSavingName(true);
    setError(null);
    setNameSaved(false);
    try {
      setUser(
        await updateProfile({
          first_name: firstName.trim(),
          last_name: lastName.trim(),
        }),
      );
      setNameSaved(true);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Couldn't save your name.",
      );
    } finally {
      setSavingName(false);
    }
  }

  return (
    <PageContainer width="narrow">
      <PageHeader
        eyebrow="Account"
        title="Profile"
        description="Your identity in DueNest. Update your photo and name — manage the rest from the areas below."
      />

      {error && (
        <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <SectionCard title="Profile picture">
        <div className="flex flex-wrap items-center gap-5">
          <span className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-full bg-brand-navy text-white ring-2 ring-brand-teal/20">
            {avatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatar} alt="" className="size-full object-cover" />
            ) : (
              <UserRound className="size-9" aria-hidden />
            )}
          </span>
          <div className="space-y-2">
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => fileRef.current?.click()}
                disabled={avatarBusy}
              >
                {avatarBusy ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Upload className="size-4" />
                )}
                {hasUploaded ? "Change photo" : "Upload photo"}
              </Button>
              {hasUploaded && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive"
                  onClick={handleRemove}
                  disabled={avatarBusy}
                >
                  <Trash2 className="size-4" /> Remove
                </Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              JPG or PNG, up to 8 MB. We resize it for you.
            </p>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handlePick}
          />
        </div>
      </SectionCard>

      <SectionCard title="Name">
        <form onSubmit={handleSaveName} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="first-name">First name</Label>
              <Input
                id="first-name"
                value={firstName}
                onChange={(e) => {
                  setFirstName(e.target.value);
                  setNameSaved(false);
                }}
                autoComplete="given-name"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="last-name">Last name</Label>
              <Input
                id="last-name"
                value={lastName}
                onChange={(e) => {
                  setLastName(e.target.value);
                  setNameSaved(false);
                }}
                autoComplete="family-name"
              />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="email">Email</Label>
            <Input id="email" value={user.email} readOnly disabled />
            <p className="text-xs text-muted-foreground">
              Your email is your sign-in identity and can&apos;t be changed here.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Button type="submit" disabled={savingName}>
              {savingName ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Check className="size-4" />
              )}
              Save changes
            </Button>
            {nameSaved && (
              <span className="inline-flex items-center gap-1.5 text-sm text-brand-success">
                <Check className="size-4" /> Saved
              </span>
            )}
          </div>
        </form>
      </SectionCard>

      <SectionCard
        title="Account areas"
        description="Billing, privacy, AI, and security each have their own place."
      >
        <div className="grid gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-2">
          {ACCOUNT_AREAS.map((area) => {
            const Icon = area.icon;
            return (
              <Link
                key={area.href}
                href={area.href}
                className="group flex items-center gap-3 bg-card p-4 transition-colors hover:bg-muted/50"
              >
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                  <Icon className="size-4" />
                </span>
                <span className="flex-1 text-sm font-medium">{area.label}</span>
                <ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
              </Link>
            );
          })}
        </div>
      </SectionCard>

      <p className="px-1 text-xs leading-relaxed text-muted-foreground">
        Coming soon: save details like your address and document numbers here, so
        DueNest can offer to fill them into forms for you — always with your
        confirmation, never shared automatically.
      </p>
    </PageContainer>
  );
}
