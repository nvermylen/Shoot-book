import { Route } from "lucide-react";
import { ComingSoon } from "@/components/coming-soon";

export default function JourneyPage() {
  return (
    <ComingSoon
      page="journey"
      eyebrow="Coordinator"
      title="Journey tracker"
      description="Every client's progress through their session journey, stage by stage."
      icon={Route}
    />
  );
}
