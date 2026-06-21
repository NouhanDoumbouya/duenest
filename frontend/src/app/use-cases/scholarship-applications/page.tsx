import { UseCasePage } from "@/components/marketing/use-case-page";
import { buildUseCaseMetadata, getUseCase } from "@/lib/use-cases";

export const metadata = buildUseCaseMetadata("scholarship-applications");
const useCase = getUseCase("scholarship-applications")!;

export default function Page() {
  return <UseCasePage useCase={useCase} />;
}
