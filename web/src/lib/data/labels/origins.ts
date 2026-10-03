import type { Sensitivity, Trust } from "../types";

// Where content came in, named by the part of the origin before its first colon
export type OriginKind = "user" | "system" | "tool" | "web" | "email" | "mcp" | "file" | "agent" | "unknown";

type Mapping = { trust: Trust; sensitivity: Sensitivity };

// The SDK's defaults, as in packages/shared/labels/mapping.ts
export const DEFAULT_MAPPING: Record<OriginKind, Mapping> = {
    user: { trust: "trusted", sensitivity: "internal" },
    // System and developer instructions, as the SDK labels them
    system: { trust: "trusted", sensitivity: "internal" },
    tool: { trust: "trusted", sensitivity: "internal" },
    web: { trust: "untrusted", sensitivity: "public" },
    email: { trust: "untrusted", sensitivity: "public" },
    mcp: { trust: "untrusted", sensitivity: "public" },
    file: { trust: "untrusted", sensitivity: "internal" },
    // The fallback for an agent whose content labels are unknown
    agent: { trust: "untrusted", sensitivity: "internal" },
    unknown: { trust: "untrusted", sensitivity: "internal" },
};

// An override set with quard.configure({ origins }), where a side it left out keeps its default
export type OriginOverride = {
    origin: string;
    trust: Trust;
    sensitivity: Sensitivity;
    defaultTrust: Trust;
    defaultSensitivity: Sensitivity;
    // Agents whose runs set it
    agents: string[];
    // The start of the newest run that set it
    seenAt: number;
};

export function originKind(origin: string): OriginKind {
    const kind = origin.split(":")[0];
    // Own keys only, so an origin like constructor stays unknown
    return Object.hasOwn(DEFAULT_MAPPING, kind) ? (kind as OriginKind) : "unknown";
}
