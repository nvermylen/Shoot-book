import { MapPin } from "lucide-react";
import { ComingSoon } from "@/components/coming-soon";

export default function LocationsPage() {
  return (
    <ComingSoon
      page="locations"
      eyebrow="Scout"
      title="Locations"
      description="Your shoot location library — permits, golden hour, and directions."
      icon={MapPin}
    />
  );
}
