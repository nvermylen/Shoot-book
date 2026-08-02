"use client";

import { useState } from "react";
import { Sidebar } from "@/components/sidebar";
import { TopBar } from "@/components/top-bar";
import { ClientDrawer } from "@/components/client-drawer";
import { DrawerContext } from "@/lib/drawer-context";
import type { Client } from "@/types/erp";

/** The signed-in photographer as the chrome (sidebar, top bar) displays it. */
export interface PhotographerIdentity {
  displayName: string;
  businessName: string;
  timezone: string;
}

export function DashboardShell({
  identity,
  children,
}: {
  identity: PhotographerIdentity;
  children: React.ReactNode;
}) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerClient, setDrawerClient] = useState<Client | null>(null);

  const openDrawer = (client?: Client) => {
    setDrawerClient(client ?? null);
    setDrawerOpen(true);
  };
  const closeDrawer = () => setDrawerOpen(false);

  return (
    <DrawerContext.Provider value={{ open: drawerOpen, client: drawerClient, openDrawer, closeDrawer }}>
      <div style={{ display: "grid", gridTemplateColumns: "248px 1fr", minHeight: "100vh" }}>
        <Sidebar identity={identity} />
        <main style={{ minWidth: 0, background: "var(--paper)" }}>
          <TopBar identity={identity} />
          <div>{children}</div>
        </main>
        <ClientDrawer key={drawerClient?.id ?? "none"} client={drawerClient} open={drawerOpen} timezone={identity.timezone} onClose={closeDrawer} />
      </div>
    </DrawerContext.Provider>
  );
}
