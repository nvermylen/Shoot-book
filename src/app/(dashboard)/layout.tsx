import { createClient } from "@/lib/supabase/server";
import { getPhotographer } from "@/lib/erp/photographer";
import { DashboardShell, type PhotographerIdentity } from "@/components/dashboard-shell";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: photographer, error } = await getPhotographer(supabase);

  // Profile read failed (or the row is missing for a legacy account): fall
  // back to the auth email so the chrome stays honest — never a made-up name.
  let identity: PhotographerIdentity;
  if (photographer) {
    identity = {
      displayName: photographer.display_name,
      businessName: photographer.business_name,
      timezone: photographer.timezone,
    };
  } else {
    if (error) {
      console.error("dashboard.layout.photographer_read_failed", { code: error.code });
    }
    const { data: userData } = await supabase.auth.getUser();
    identity = {
      displayName: userData.user?.email ?? "Signed in",
      businessName: "",
      timezone: "",
    };
  }

  return <DashboardShell identity={identity}>{children}</DashboardShell>;
}
