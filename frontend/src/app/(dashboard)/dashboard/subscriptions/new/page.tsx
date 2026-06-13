"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";

import { SubscriptionForm } from "@/components/subscriptions/subscription-form";
import { PageContainer } from "@/components/ui/page-container";
import { Skeleton } from "@/components/ui/skeleton";
import {
  createSubscription,
  listSubscriptionCategories,
} from "@/lib/subscriptions";
import type { SubscriptionCategory } from "@/types/subscriptions";

export default function NewSubscriptionPage() {
  const router = useRouter();
  const [categories, setCategories] = useState<SubscriptionCategory[] | null>(
    null,
  );

  useEffect(() => {
    listSubscriptionCategories()
      .then(setCategories)
      .catch(() => setCategories([]));
  }, []);

  return (
    <PageContainer width="default" className="space-y-6">
      <div>
        <Link
          href="/dashboard/subscriptions"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronLeft className="size-4" />
          Subscriptions
        </Link>
        <h1 className="mt-2 text-page-title">Add subscription</h1>
        <p className="mt-1 text-page-subtitle">
          Track a recurring payment so DueNest can remind you before it renews.
          DueNest stores renewal dates and reminders only — never full card or
          banking details.
        </p>
      </div>

      {categories === null ? (
        <Skeleton className="h-[28rem] rounded-2xl" />
      ) : (
        <SubscriptionForm
          categories={categories}
          submitLabel="Add subscription"
          cancelHref="/dashboard/subscriptions"
          onSubmit={async (input) => {
            const created = await createSubscription(input);
            router.push(`/dashboard/subscriptions/${created.id}`);
          }}
        />
      )}
    </PageContainer>
  );
}
