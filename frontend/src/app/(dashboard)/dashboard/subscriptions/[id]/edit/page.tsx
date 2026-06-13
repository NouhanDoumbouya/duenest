"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";

import { SubscriptionForm } from "@/components/subscriptions/subscription-form";
import { PageContainer } from "@/components/ui/page-container";
import { InlineAlert } from "@/components/ui/product-ui";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError } from "@/lib/api";
import {
  getSubscription,
  listSubscriptionCategories,
  updateSubscription,
} from "@/lib/subscriptions";
import type {
  Subscription,
  SubscriptionCategory,
} from "@/types/subscriptions";

export default function EditSubscriptionPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const validId = Number.isFinite(id);

  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [categories, setCategories] = useState<SubscriptionCategory[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!validId) return;
    let active = true;
    Promise.all([getSubscription(id), listSubscriptionCategories()])
      .then(([sub, cats]) => {
        if (!active) return;
        setSubscription(sub);
        setCategories(cats);
      })
      .catch((err) => {
        if (!active) return;
        setError(
          err instanceof ApiError
            ? err.message
            : "Could not load this subscription.",
        );
      });
    return () => {
      active = false;
    };
  }, [id, validId]);

  return (
    <PageContainer width="default" className="space-y-6">
      <div>
        <Link
          href={validId ? `/dashboard/subscriptions/${id}` : "/dashboard/subscriptions"}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronLeft className="size-4" />
          Back
        </Link>
        <h1 className="mt-2 text-page-title">Edit subscription</h1>
      </div>

      {!validId && (
        <InlineAlert>This subscription could not be found.</InlineAlert>
      )}
      {error && <InlineAlert>{error}</InlineAlert>}

      {validId && !error && subscription === null ? (
        <Skeleton className="h-[28rem] rounded-2xl" />
      ) : subscription ? (
        <SubscriptionForm
          subscription={subscription}
          categories={categories}
          submitLabel="Save changes"
          cancelHref={`/dashboard/subscriptions/${id}`}
          onSubmit={async (input) => {
            await updateSubscription(id, input);
            router.push(`/dashboard/subscriptions/${id}`);
          }}
        />
      ) : null}
    </PageContainer>
  );
}
