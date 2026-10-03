import type { Label, Sensitivity, Trust } from "../types";

// Where content came in, named by the part of the origin before its first colon
export type OriginKind =
    "user" | "system" | "tool" | "web" | "search" | "email" | "mcp" | "file" | "agent" | "memory" | "unknown";

type Mapping = { trust: Trust; sensitivity: Sensitivity };

// The default mapping from PROJECT.md "Labels"
export const DEFAULT_MAPPING: Record<OriginKind, Mapping> = {
    user: { trust: "trusted", sensitivity: "internal" },
    // System and developer instructions, as the SDK labels them
    system: { trust: "trusted", sensitivity: "internal" },
    tool: { trust: "trusted", sensitivity: "internal" },
    web: { trust: "untrusted", sensitivity: "public" },
    search: { trust: "untrusted", sensitivity: "public" },
    email: { trust: "untrusted", sensitivity: "public" },
    mcp: { trust: "untrusted", sensitivity: "public" },
    file: { trust: "untrusted", sensitivity: "internal" },
    // The fallback for an agent whose content labels are unknown
    agent: { trust: "untrusted", sensitivity: "internal" },
    memory: { trust: "untrusted", sensitivity: "internal" },
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

// The generated overrides behind labelFor
type CodeOverride = Mapping & {
    origin: string;
    defaultTrust: Trust;
    defaultSensitivity: Sensitivity;
    app: string;
    file: string;
    line: number;
    note: string;
};

export const ORIGIN_OVERRIDES: CodeOverride[] = [
    {
        origin: "mcp:crm.acme.internal",
        trust: "trusted",
        sensitivity: "internal",
        defaultTrust: "untrusted",
        defaultSensitivity: "public",
        app: "support-app",
        file: "src/quard.ts",
        line: 14,
        note: "Our own MCP server holds CRM data",
    },
    {
        origin: "file:/srv/invoices",
        trust: "trusted",
        sensitivity: "internal",
        defaultTrust: "untrusted",
        defaultSensitivity: "internal",
        app: "billing-service",
        file: "src/monitor.ts",
        line: 9,
        note: "Invoices our own system generates",
    },
];

export function originKind(origin: string): OriginKind {
    const kind = origin.split(":")[0];
    // Own keys only, so an origin like constructor stays unknown
    return Object.hasOwn(DEFAULT_MAPPING, kind) ? (kind as OriginKind) : "unknown";
}

// The label for content from this origin, where overrides win over the defaults
export function labelFor(origin: string): Label {
    const override = ORIGIN_OVERRIDES.find((o) => origin === o.origin || origin.startsWith(`${o.origin}/`));
    const mapping = override ?? DEFAULT_MAPPING[originKind(origin)];
    return { origin, trust: mapping.trust, sensitivity: mapping.sensitivity };
}

// What an agent passes on, its name as the origin with the labels of what it carries
export function agentLabel(agent: string, carries: Label[]): Label {
    const untrusted = carries.length === 0 || carries.some((l) => l.trust === "untrusted");
    const internal = carries.length === 0 || carries.some((l) => l.sensitivity === "internal");
    return {
        origin: `agent:${agent}`,
        trust: untrusted ? "untrusted" : "trusted",
        sensitivity: internal ? "internal" : "public",
    };
}

export const USER_LABEL: Label = labelFor("user");
