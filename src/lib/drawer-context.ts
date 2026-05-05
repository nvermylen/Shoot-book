"use client";

import { createContext, useContext } from "react";

export const DrawerContext = createContext({
  open: false,
  openDrawer: () => {},
  closeDrawer: () => {},
});

export function useDrawer() {
  return useContext(DrawerContext);
}
