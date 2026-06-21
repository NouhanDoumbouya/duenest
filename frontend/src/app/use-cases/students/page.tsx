import { UseCasePage } from "@/components/marketing/use-case-page";
import { buildUseCaseMetadata, getUseCase } from "@/lib/use-cases";

export const metadata = buildUseCaseMetadata("students");
const useCase = getUseCase("students")!;

export default function Page() {
  return <UseCasePage useCase={useCase} />;
}
