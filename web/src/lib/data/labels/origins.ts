import type { Label, Sensitivity, Trust } from "../types";

// Where content came in. The origin string starts with its kind, such as "web:docs.python.org".
export type OriginKind = "user" | "tool" | "web" | "search" | "email" | "mcp" | "file" | "agent" | "memory" | "unknown";

type Mapping = { trust: Trust; sensitivity: Sensitivity };

// The default mapping from PROJECT.md "Labels".
export const DEFAULT_MAPPING: Record<OriginKind, Mapping> = {
    user: { trust: "trusted", sensitivity: "internal" },
    tool: { trust: "trusted", sensitivity: "internal" },
    web: { trust: "untrusted", sensitivity: "public" },
    search: { trust: "untrusted", sensitivity: "public" },
    email: { trust: "untrusted", sensitivity: "public" },
    mcp: { trust: "untrusted", sensitivity: "public" },
    file: { trust: "untrusted", sensitivity: "internal" },
    // Agents pass on the labels of their content. This is the fallback when those are unknown.
    agent: { trust: "untrusted", sensitivity: "internal" },
    memory: { trust: "untrusted", sensitivity: "internal" },
    unknown: { trust: "untrusted", sensitivity: "internal" },
};

// A per-origin override set in code with monitor.configure({ origins }).
export type OriginOverride = {
    origin: string;
    trust: Trust;
    sensitivity: Sensitivity;
    defaultTrust: Trust;
    defaultSensitivity: Sensitivity;
    app: string;
    file: string;
    line: number;
    note: string;
};

export const ORIGIN_OVERRIDES: OriginOverride[] = [
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
    return kind in DEFAULT_MAPPING ? (kind as OriginKind) : "unknown";
}

// The label for content that came in through this origin. Overrides win over the defaults.
export function labelFor(origin: string): Label {
    const override = ORIGIN_OVERRIDES.find((o) => origin === o.origin || origin.startsWith(`${o.origin}/`));
    const mapping = override ?? DEFAULT_MAPPING[originKind(origin)];
    return { origin, trust: mapping.trust, sensitivity: mapping.sensitivity };
}

// What an agent passes on: its name as the origin, with the labels of what it carries.
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
