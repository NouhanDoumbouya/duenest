import { UseCasePage } from "@/components/marketing/use-case-page";
import { buildUseCaseMetadata, getUseCase } from "@/lib/use-cases";

export const metadata = buildUseCaseMetadata("client-document-collection");
const useCase = getUseCase("client-document-collection")!;

export default function Page() {
  return <UseCasePage useCase={useCase} />;
}
