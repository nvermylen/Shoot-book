import { Mail } from "lucide-react";
import { ComingSoon } from "@/components/coming-soon";

export default function AutomationsPage() {
  return (
    <ComingSoon
      page="automations"
      eyebrow="Delivery"
      title="Email Automations"
      description="Automated client email sequences, drafted and tracked for you."
      icon={Mail}
    />
  );
}
