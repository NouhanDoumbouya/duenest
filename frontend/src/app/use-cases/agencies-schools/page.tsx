import type { Metadata } from "next";

import { UseCasePage } from "@/components/marketing/use-case-page";
import { getUseCase } from "@/lib/use-cases";

const useCase = getUseCase("agencies-schools")!;

export const metadata: Metadata = {
  title: { absolute: useCase.metaTitle },
  description: useCase.metaDescription,
  alternates: { canonical: "/use-cases/agencies-schools" },
};

export default function Page() {
  return <UseCasePage useCase={useCase} />;
}
