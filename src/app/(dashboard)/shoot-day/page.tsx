import { Camera } from "lucide-react";
import { ComingSoon } from "@/components/coming-soon";

export default function ShootDayPage() {
  return (
    <ComingSoon
      page="shoot-day"
      eyebrow="Operations"
      title="Shoot day"
      description="Your day-of run sheet: schedule, gear, weather, and client details."
      icon={Camera}
    />
  );
}
