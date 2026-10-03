import { vi } from "vitest";
import { getFleet } from "@/lib/data/fleet";
import type { FleetData } from "@/lib/data/fleet";

// jsdom has no ResizeObserver; charts keep their first width
class StillObserver {
    observe() {}
    disconnect() {}
}

// Stubs the browser APIs the charts need. Reduced motion stops the loading sweep.
export function stubBrowser() {
    vi.stubGlobal("ResizeObserver", StillObserver);
    vi.stubGlobal("matchMedia", () => ({ matches: true }));
}

// The sample fleet the Summary page shows, with fields swapped as a test needs
export async function sampleFleet(changes: Partial<FleetData> = {}): Promise<FleetData> {
    return { ...(await getFleet()), ...changes };
}
