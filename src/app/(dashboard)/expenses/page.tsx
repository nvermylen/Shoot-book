import { Tag } from "lucide-react";
import { ComingSoon } from "@/components/coming-soon";

export default function ExpensesPage() {
  return (
    <ComingSoon
      page="expenses"
      eyebrow="Books"
      title="Expenses"
      description="Expense capture, categorization, and mileage — ready for accounting export."
      icon={Tag}
    />
  );
}
