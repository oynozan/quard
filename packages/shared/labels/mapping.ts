import type { Label, OriginKind, OriginOverrides, Sensitivity, Trust } from "./types.ts";

// Default trust and sensitivity per origin kind (PROJECT.md, Q5)
const DEFAULTS: Record<OriginKind, { trust: Trust; sensitivity: Sensitivity }> = {
    user: { trust: "trusted", sensitivity: "internal" },
    system: { trust: "trusted", sensitivity: "internal" },
    tool: { trust: "trusted", sensitivity: "internal" },
    web: { trust: "untrusted", sensitivity: "public" },
    email: { trust: "untrusted", sensitivity: "public" },
    mcp: { trust: "untrusted", sensitivity: "public" },
    file: { trust: "untrusted", sensitivity: "internal" },
    agent: { trust: "untrusted", sensitivity: "internal" },
    unknown: { trust: "untrusted", sensitivity: "internal" },
};

export function originKind(origin: string): OriginKind {
    const end = origin.indexOf(":");
    const kind = end === -1 ? origin : origin.slice(0, end);
    return Object.hasOwn(DEFAULTS, kind) ? (kind as OriginKind) : "unknown";
}

// Teams override one exact origin at a time
export function labelFor(origin: string, overrides: OriginOverrides = {}, flags: string[] = []): Label {
    const kind = originKind(origin);
    const base = DEFAULTS[kind];
    const override = Object.hasOwn(overrides, origin) ? overrides[origin] : undefined;
    return {
        origin,
        kind,
        trust: override?.trust ?? base.trust,
        sensitivity: override?.sensitivity ?? base.sensitivity,
        flags,
    };
}
