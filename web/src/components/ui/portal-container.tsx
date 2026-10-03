"use client";

import { createContext, useContext } from "react";

// Menus portal into this element, and the drawer provides itself so its menus stay above it
const PortalContainerContext = createContext<HTMLElement | null>(null);

export const PortalContainerProvider = PortalContainerContext.Provider;

export function usePortalContainer(): HTMLElement | undefined {
    return useContext(PortalContainerContext) ?? undefined;
}
