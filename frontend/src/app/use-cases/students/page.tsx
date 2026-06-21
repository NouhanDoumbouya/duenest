import type { Metadata } from "next";

import { UseCasePage } from "@/components/marketing/use-case-page";
import { getUseCase } from "@/lib/use-cases";

const useCase = getUseCase("students")!;

export const metadata: Metadata = {
  title: { absolute: useCase.metaTitle },
  description: useCase.metaDescription,
  alternates: { canonical: "/use-cases/students" },
};

export default function Page() {
  return <UseCasePage useCase={useCase} />;
}
