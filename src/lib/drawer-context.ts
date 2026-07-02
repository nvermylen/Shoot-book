"use client";

import { createContext, useContext } from "react";
import type { Client } from "@/types/erp";

export interface DrawerContextValue {
  open: boolean;
  /** The client whose detail is shown. Null when opened without one (e.g. mock dashboard rows). */
  client: Client | null;
  openDrawer: (client?: Client) => void;
  closeDrawer: () => void;
}

export const DrawerContext = createContext<DrawerContextValue>({
  open: false,
  client: null,
  openDrawer: () => {},
  closeDrawer: () => {},
});

export function useDrawer() {
  return useContext(DrawerContext);
}
