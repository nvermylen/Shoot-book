import { Image } from "lucide-react";
import { ComingSoon } from "@/components/coming-soon";

export default function GalleriesPage() {
  return (
    <ComingSoon
      page="galleries"
      eyebrow="Delivery"
      title="Galleries"
      description="Gallery delivery and download tracking for every session."
      icon={Image}
    />
  );
}
