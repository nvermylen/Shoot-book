import { Calendar } from "lucide-react";
import { ComingSoon } from "@/components/coming-soon";

export default function CalendarPage() {
  return (
    <ComingSoon
      page="calendar"
      eyebrow="Operations"
      title="Calendar"
      description="A month and week view of your booked sessions, synced from Google Calendar."
      icon={Calendar}
    />
  );
}
