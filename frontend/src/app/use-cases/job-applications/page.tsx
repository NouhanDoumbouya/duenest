import type { Metadata } from "next";

import { UseCasePage } from "@/components/marketing/use-case-page";
import { getUseCase } from "@/lib/use-cases";

const useCase = getUseCase("job-applications")!;

export const metadata: Metadata = {
  title: { absolute: useCase.metaTitle },
  description: useCase.metaDescription,
  alternates: { canonical: "/use-cases/job-applications" },
};

export default function Page() {
  return <UseCasePage useCase={useCase} />;
}
