import { UseCasePage } from "@/components/marketing/use-case-page";
import { buildUseCaseMetadata, getUseCase } from "@/lib/use-cases";

export const metadata = buildUseCaseMetadata("families");
const useCase = getUseCase("families")!;

export default function Page() {
  return <UseCasePage useCase={useCase} />;
}
