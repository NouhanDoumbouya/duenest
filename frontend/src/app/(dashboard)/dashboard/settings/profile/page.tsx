"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
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
import {
  clearProfileDetails,
  getProfileDetails,
  removeAvatar,
  updateProfile,
  updateProfileDetails,
  uploadAvatar,
} from "@/lib/auth";
import type { ProfileDetails } from "@/types/auth";

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
        description="Your identity in CertaNest. Update your photo and name — manage the rest from the areas below."
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

      <ProfileDetailsSection />
    </PageContainer>
  );
}

const EMPTY_DETAILS: ProfileDetails = {
  legal_name: "",
  preferred_name: "",
  date_of_birth: "",
  nationality: "",
  phone: "",
  address_street: "",
  address_city: "",
  address_region: "",
  address_postal_code: "",
  address_country: "",
  passport_number: "",
  national_id: "",
};

const DETAIL_GROUPS: {
  title: string;
  fields: {
    key: keyof ProfileDetails;
    label: string;
    type?: string;
    autoComplete?: string;
  }[];
}[] = [
  {
    title: "Identity",
    fields: [
      { key: "legal_name", label: "Full legal name", autoComplete: "name" },
      { key: "preferred_name", label: "Preferred name" },
      { key: "date_of_birth", label: "Date of birth", type: "date" },
      { key: "nationality", label: "Nationality" },
    ],
  },
  {
    title: "Contact & address",
    fields: [
      { key: "phone", label: "Phone", type: "tel", autoComplete: "tel" },
      { key: "address_street", label: "Street address", autoComplete: "address-line1" },
      { key: "address_city", label: "City", autoComplete: "address-level2" },
      { key: "address_region", label: "State / region", autoComplete: "address-level1" },
      { key: "address_postal_code", label: "Postal code", autoComplete: "postal-code" },
      { key: "address_country", label: "Country", autoComplete: "country-name" },
    ],
  },
  {
    title: "Document numbers",
    fields: [
      { key: "passport_number", label: "Passport number" },
      { key: "national_id", label: "National ID number" },
    ],
  },
];

/**
 * Optional saved details for pre-filling the user's own forms. Loaded and saved
 * via the owner-only, encrypted profile-details API. Everything is opt-in and
 * clearable; we're explicit that nothing is shared or used without confirmation.
 */
function ProfileDetailsSection() {
  const [details, setDetails] = useState<ProfileDetails | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let active = true;
    getProfileDetails()
      .then((d) => active && setDetails(d))
      .catch(() => active && setLoadError(true));
    return () => {
      active = false;
    };
  }, []);

  function update(key: keyof ProfileDetails, value: string) {
    setDetails((d) => ({ ...(d ?? EMPTY_DETAILS), [key]: value }));
    setSaved(false);
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    if (!details) return;
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      setDetails(await updateProfileDetails(details));
      setSaved(true);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Couldn't save your details.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleClear() {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      setDetails(await clearProfileDetails());
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Couldn't clear your details.",
      );
    } finally {
      setSaving(false);
    }
  }

  const hasAny =
    details != null && Object.values(details).some((v) => v.trim() !== "");

  return (
    <SectionCard
      title="Your details"
      description="Optional. Saved securely to help pre-fill your own forms later."
    >
      <p className="mb-4 flex items-start gap-2 rounded-lg border border-primary/15 bg-primary/[0.04] px-3 py-2 text-xs leading-relaxed text-muted-foreground">
        <Lock className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden />
        <span>
          Encrypted at rest and visible only to you. CertaNest never shares these
          or fills them in without asking. Leave anything blank, or clear it all
          whenever you like.
        </span>
      </p>

      {loadError ? (
        <p className="text-sm text-destructive">
          Couldn&apos;t load your saved details. Please refresh and try again.
        </p>
      ) : details === null ? (
        <div className="space-y-2">
          <div className="h-9 w-full animate-pulse rounded-md bg-muted" />
          <div className="h-9 w-2/3 animate-pulse rounded-md bg-muted" />
        </div>
      ) : (
        <form onSubmit={handleSave} className="space-y-6">
          {DETAIL_GROUPS.map((group) => (
            <fieldset key={group.title} className="space-y-3">
              <legend className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                {group.title}
              </legend>
              <div className="grid gap-4 sm:grid-cols-2">
                {group.fields.map((f) => (
                  <div key={f.key} className="grid gap-1.5">
                    <Label htmlFor={`detail-${f.key}`}>{f.label}</Label>
                    <Input
                      id={`detail-${f.key}`}
                      type={f.type ?? "text"}
                      value={details[f.key]}
                      onChange={(e) => update(f.key, e.target.value)}
                      autoComplete={f.autoComplete}
                    />
                  </div>
                ))}
              </div>
            </fieldset>
          ))}

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={saving}>
              {saving ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Check className="size-4" />
              )}
              Save details
            </Button>
            {saved && (
              <span className="inline-flex items-center gap-1.5 text-sm text-brand-success">
                <Check className="size-4" /> Saved
              </span>
            )}
            {hasAny && (
              <Button
                type="button"
                variant="ghost"
                className="text-destructive hover:text-destructive"
                onClick={handleClear}
                disabled={saving}
              >
                <Trash2 className="size-4" /> Clear all
              </Button>
            )}
          </div>
        </form>
      )}
    </SectionCard>
  );
}
