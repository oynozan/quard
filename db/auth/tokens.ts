import { createHash, randomBytes } from "node:crypto";

// Agent keys are stored as this hash only
export function hashToken(token: string): string {
    return createHash("sha256").update(token).digest("hex");
}

// "qk_live_" and 48 hex characters, the shape the dashboard expects
export function newAgentKey(): string {
    return `qk_live_${randomBytes(24).toString("hex")}`;
}

// The part of a key the dashboard may show: "qk_live_7f31"
export function keyPrefix(key: string): string {
    return key.slice(0, 12);
}
