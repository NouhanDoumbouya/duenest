import { UseCasePage } from "@/components/marketing/use-case-page";
import { buildUseCaseMetadata, getUseCase } from "@/lib/use-cases";

export const metadata = buildUseCaseMetadata("secure-document-sharing");
const useCase = getUseCase("secure-document-sharing")!;

export default function Page() {
  return <UseCasePage useCase={useCase} />;
}
