import type { OriginOverride } from "@/lib/data/settings";
import { HOUR, MINUTE, NOW } from "../time";

// Two overrides as the runs reported them, sorted by origin
export const ORIGINS: OriginOverride[] = [
    {
        origin: "file:/srv/invoices",
        trust: "trusted",
        sensitivity: "internal",
        defaultTrust: "untrusted",
        defaultSensitivity: "internal",
        agents: ["billing"],
        seenAt: NOW - 3 * HOUR,
    },
    {
        origin: "mcp:crm.internal",
        trust: "trusted",
        sensitivity: "public",
        defaultTrust: "untrusted",
        defaultSensitivity: "public",
        agents: ["billing", "support"],
        seenAt: NOW - 12 * MINUTE,
    },
];
