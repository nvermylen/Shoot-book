import { FileText } from "lucide-react";
import { ComingSoon } from "@/components/coming-soon";

export default function NotesPage() {
  return (
    <ComingSoon
      page="notes"
      eyebrow="Coordinator"
      title="Notes & Files"
      description="Session notes, style guides, and files for every client in one place."
      icon={FileText}
    />
  );
}
