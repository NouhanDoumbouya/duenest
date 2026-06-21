import { UseCasePage } from "@/components/marketing/use-case-page";
import { buildUseCaseMetadata, getUseCase } from "@/lib/use-cases";

export const metadata = buildUseCaseMetadata("visa-documents");
const useCase = getUseCase("visa-documents")!;

export default function Page() {
  return <UseCasePage useCase={useCase} />;
}
