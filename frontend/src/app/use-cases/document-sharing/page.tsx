import { UseCasePage } from "@/components/marketing/use-case-page";
import { buildUseCaseMetadata, getUseCase } from "@/lib/use-cases";

export const metadata = buildUseCaseMetadata("document-sharing");
const useCase = getUseCase("document-sharing")!;

export default function Page() {
  return <UseCasePage useCase={useCase} />;
}
