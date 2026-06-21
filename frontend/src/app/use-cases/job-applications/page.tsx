import { UseCasePage } from "@/components/marketing/use-case-page";
import { buildUseCaseMetadata, getUseCase } from "@/lib/use-cases";

export const metadata = buildUseCaseMetadata("job-applications");
const useCase = getUseCase("job-applications")!;

export default function Page() {
  return <UseCasePage useCase={useCase} />;
}
