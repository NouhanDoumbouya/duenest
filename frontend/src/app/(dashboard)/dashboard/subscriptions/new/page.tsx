"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, Search, Sparkles, X } from "lucide-react";

import {
  SubscriptionForm,
  type SubscriptionPrefill,
} from "@/components/subscriptions/subscription-form";
import { SubscriptionAvatar } from "@/components/subscriptions/subscription-avatar";
import { Input } from "@/components/ui/input";
import { PageContainer } from "@/components/ui/page-container";
import { Skeleton } from "@/components/ui/skeleton";
import {
  createSubscription,
  listSubscriptionCategories,
} from "@/lib/subscriptions";
import {
  findSubscriptionTemplates,
  groupTemplates,
  type SubscriptionTemplate,
} from "@/lib/subscription-templates";
import type { SubscriptionCategory } from "@/types/subscriptions";

export default function NewSubscriptionPage() {
  const router = useRouter();
  const [categories, setCategories] = useState<SubscriptionCategory[] | null>(
    null,
  );
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<SubscriptionTemplate | null>(null);

  useEffect(() => {
    listSubscriptionCategories()
      .then(setCategories)
      .catch(() => setCategories([]));
  }, []);

  const filteredTemplates = useMemo(
    () => findSubscriptionTemplates(search),
    [search],
  );
  const popularTemplates = useMemo(
    () => filteredTemplates.filter((t) => t.isPopular),
    [filteredTemplates],
  );

  const prefill: SubscriptionPrefill | undefined = useMemo(() => {
    if (!selected || !categories) return undefined;
    const category = categories.find((c) => c.slug === selected.categorySlug);
    return {
      name: selected.name,
      provider: selected.provider,
      provider_key: selected.key,
      category: category ? String(category.id) : "",
      website_url: selected.website_url,
      billing_cycle: selected.billing_cycle,
      reminder_days_before: selected.reminder_days_before,
      auto_renew: selected.auto_renew,
    };
  }, [selected, categories]);

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
          DueNest stores renewal dates and reminders only - never full card or
          banking details.
        </p>
      </div>

      {categories === null ? (
        <Skeleton className="h-[28rem] rounded-2xl" />
      ) : (
        <>
          {/* Quick-add templates */}
          <section className="rounded-2xl border border-border bg-card p-4 shadow-card sm:p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="size-4 text-primary" />
                <h2 className="text-sm font-semibold">Start from a template</h2>
              </div>
              <div className="relative sm:w-64">
                <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search templates..."
                  className="pl-8"
                />
              </div>
            </div>

            {selected ? (
              <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-primary/25 bg-primary/5 px-3 py-2">
                <p className="text-sm">
                  Prefilled from{" "}
                  <span className="font-semibold">
                    {selected.name}
                  </span>
                  . Edit any field below before saving.
                </p>
                <button
                  type="button"
                  onClick={() => setSelected(null)}
                  className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
                >
                  <X className="size-3.5" />
                  Clear
                </button>
              </div>
            ) : (
              <div className="mt-4 space-y-4">
                {!search && popularTemplates.length > 0 && (
                  <div>
                    <p className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                      Popular
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {popularTemplates.map((template) => (
                        <TemplateChip
                          key={`popular-${template.key}`}
                          template={template}
                          onSelect={() => setSelected(template)}
                        />
                      ))}
                    </div>
                  </div>
                )}
                {groupTemplates(filteredTemplates).map(({ group, items }) => (
                  <div key={group}>
                    <p className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                      {group}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {items.map((template) => (
                        <TemplateChip
                          key={template.key}
                          template={template}
                          onSelect={() => setSelected(template)}
                        />
                      ))}
                    </div>
                  </div>
                ))}
                {filteredTemplates.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    No templates match your search. You can still fill the form
                    manually below.
                  </p>
                )}
              </div>
            )}
            <p className="mt-3 text-xs text-muted-foreground">
              Templates pre-fill the details but never the price — you always
              enter your own amount and currency. DueNest is not affiliated with
              these brands.
            </p>
          </section>

          <SubscriptionForm
            // Remount when the chosen template changes so prefilled defaults apply.
            key={selected?.key ?? "blank"}
            prefill={prefill}
            categories={categories}
            submitLabel="Add subscription"
            cancelHref="/dashboard/subscriptions"
            onSubmit={async (input) => {
              const created = await createSubscription(input);
              router.push(`/dashboard/subscriptions/${created.id}`);
            }}
          />
        </>
      )}
    </PageContainer>
  );
}

function TemplateChip({
  template,
  onSelect,
}: {
  template: SubscriptionTemplate;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className="inline-flex items-center gap-2 rounded-full border border-border bg-card py-1 pr-3 pl-1 text-sm transition-colors hover:border-primary/40 hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <SubscriptionAvatar
        name={template.name}
        providerKey={template.key}
        size={24}
      />
      {template.name}
    </button>
  );
}
