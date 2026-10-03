// The five guard types from PROJECT.md
export const GUARD_TYPES = ["source", "action", "approval", "egress", "limit"] as const;

export type GuardType = (typeof GUARD_TYPES)[number];

export function isGuardType(value: unknown): value is GuardType {
    return typeof value === "string" && (GUARD_TYPES as readonly string[]).includes(value);
}
