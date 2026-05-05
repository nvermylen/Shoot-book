"use client";

import { useState } from "react";
import { Sidebar } from "@/components/sidebar";
import { TopBar } from "@/components/top-bar";
import { ClientDrawer } from "@/components/client-drawer";
import { DrawerContext } from "@/lib/drawer-context";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <DrawerContext.Provider value={{ open: drawerOpen, openDrawer: () => setDrawerOpen(true), closeDrawer: () => setDrawerOpen(false) }}>
      <div style={{ display: "grid", gridTemplateColumns: "248px 1fr", minHeight: "100vh" }}>
        <Sidebar />
        <main style={{ minWidth: 0, background: "var(--paper)" }}>
          <TopBar />
          <div>{children}</div>
        </main>
        <ClientDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
      </div>
    </DrawerContext.Provider>
  );
}
