import { UseCasePage } from "@/components/marketing/use-case-page";
import { buildUseCaseMetadata, getUseCase } from "@/lib/use-cases";

export const metadata = buildUseCaseMetadata("passport-renewal-reminders");
const useCase = getUseCase("passport-renewal-reminders")!;

export default function Page() {
  return <UseCasePage useCase={useCase} />;
}
