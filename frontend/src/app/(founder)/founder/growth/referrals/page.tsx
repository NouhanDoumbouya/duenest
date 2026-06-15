"use client";

import { useEffect, useState } from "react";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  EmptyGrowthState,
  GrowthPageHeader,
  GrowthTabs,
} from "@/components/founder/growth/growth-ui";
import { ApiError } from "@/lib/api";
import {
  createAmbassador,
  getReferrals,
  type AmbassadorLeaderRow,
  type ReferralRow,
} from "@/lib/founder-growth";

export default function ReferralsPage() {
  const [referrals, setReferrals] = useState<ReferralRow[]>([]);
  const [ambassadors, setAmbassadors] = useState<AmbassadorLeaderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = () =>
    getReferrals()
      .then((d) => {
        setReferrals(d.referrals);
        setAmbassadors(d.ambassadors);
      })
      .catch(() => setError("Could not load referrals."));

  useEffect(() => {
    let active = true;
    getReferrals()
      .then((d) => {
        if (!active) return;
        setReferrals(d.referrals);
        setAmbassadors(d.ambassadors);
      })
      .catch(() => active && setError("Could not load referrals."))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="space-y-5">
      <GrowthPageHeader title="Referrals & Ambassadors" subtitle="Who is bringing you activated users.">
        <Button onClick={() => setShowForm((s) => !s)}>
          <Plus className="size-4" aria-hidden="true" /> New ambassador
        </Button>
      </GrowthPageHeader>
      <GrowthTabs />

      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

      {showForm && (
        <AmbassadorForm
          onCreated={() => {
            setShowForm(false);
            void reload();
          }}
          onCancel={() => setShowForm(false)}
        />
      )}

      {loading ? (
        <Skeleton className="h-48 w-full rounded-xl" />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader><CardTitle className="text-base">Ambassador leaderboard</CardTitle></CardHeader>
            <CardContent>
              {ambassadors.length === 0 ? (
                <EmptyGrowthState title="No ambassadors yet" body="Add an ambassador and assign a referral code." />
              ) : (
                <LeaderTable
                  rows={ambassadors.map((a) => ({ name: `${a.name}${a.community ? ` · ${a.community}` : ""}`, signups: a.signups, activated: a.activated }))}
                />
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-base">Top referrers</CardTitle></CardHeader>
            <CardContent>
              {referrals.length === 0 ? (
                <p className="text-sm text-muted-foreground">Referral activity will appear after users share invite links.</p>
              ) : (
                <LeaderTable rows={referrals.map((r) => ({ name: r.referrer_email, signups: r.signups, activated: r.activated }))} />
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

function LeaderTable({ rows }: { rows: { name: string; signups: number; activated: number }[] }) {
  return (
    <table className="w-full text-sm">
      <caption className="sr-only">Referral leaderboard</caption>
      <thead>
        <tr className="text-left text-xs text-muted-foreground">
          <th scope="col" className="pb-2 font-medium">Name</th>
          <th scope="col" className="pb-2 text-right font-medium">Signups</th>
          <th scope="col" className="pb-2 text-right font-medium">Activated</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} className="border-t border-border">
            <td className="truncate py-2 pr-2">{r.name}</td>
            <td className="py-2 text-right tabular-nums">{r.signups}</td>
            <td className="py-2 text-right tabular-nums">{r.activated}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function AmbassadorForm({ onCreated, onCancel }: { onCreated: () => void; onCancel: () => void }) {
  const [name, setName] = useState("");
  const [community, setCommunity] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!name.trim()) {
      setError("Add a name.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await createAmbassador({ name, community, referral_code: code });
      onCreated();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create ambassador.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">New ambassador</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="a-name">Name</Label>
            <Input id="a-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Campus lead" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="a-community">Community / campus</Label>
            <Input id="a-community" value={community} onChange={(e) => setCommunity(e.target.value)} placeholder="ABC University" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="a-code">Referral code</Label>
            <Input id="a-code" value={code} onChange={(e) => setCode(e.target.value)} placeholder="abcuni" />
          </div>
        </div>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <div className="flex gap-2">
          <Button variant="ghost" onClick={onCancel} className="flex-1">Cancel</Button>
          <Button onClick={submit} disabled={busy} className="flex-1">{busy ? "Creating…" : "Create"}</Button>
        </div>
      </CardContent>
    </Card>
  );
}
