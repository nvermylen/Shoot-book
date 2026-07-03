"use client";

import { useState } from "react";
import { Sidebar } from "@/components/sidebar";
import { TopBar } from "@/components/top-bar";
import { ClientDrawer } from "@/components/client-drawer";
import { DrawerContext } from "@/lib/drawer-context";
import type { Client } from "@/types/erp";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
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
        <Sidebar />
        <main style={{ minWidth: 0, background: "var(--paper)" }}>
          <TopBar />
          <div>{children}</div>
        </main>
        <ClientDrawer key={drawerClient?.id ?? "none"} client={drawerClient} open={drawerOpen} onClose={closeDrawer} />
      </div>
    </DrawerContext.Provider>
  );
}
