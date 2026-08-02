import { BookOpen } from "lucide-react";
import { ComingSoon } from "@/components/coming-soon";

export default function FinancesPage() {
  return (
    <ComingSoon
      page="finances"
      eyebrow="Books"
      title="Finances"
      description="Revenue, profit, and the health of the business at a glance."
      icon={BookOpen}
    />
  );
}
