import { maskSecret } from "@/lib/mask";
import type { AgentKey } from "@/lib/data/settings";

export type KeyDraft = {
    name: string;
    env: "live" | "test";
    scope: AgentKey["scope"];
    agents: string[];
};

// 32 random hex characters from the browser; call only from an event handler
function randomHex(length: number): string {
    const bytes = new Uint8Array(length / 2);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

// A mock key. The full secret lives only in the drawer until it closes
export function createKey(draft: KeyDraft, by: string, now: number): { key: AgentKey; secret: string } {
    const body = randomHex(32);
    const secret = `qk_${draft.env}_${body}`;
    const key: AgentKey = {
        id: `key_${body.slice(0, 4)}`,
        name: draft.name.trim(),
        prefix: maskSecret(secret),
        scope: draft.scope,
        agents: draft.agents,
        createdAt: now,
        createdBy: by,
        lastUsedAt: null,
        revokedAt: null,
        revokedBy: null,
    };
    return { key, secret };
}

// A name problem, checked on blur and on submit
export function nameProblem(name: string, taken: string[]): string | null {
    const value = name.trim();
    if (value.length === 0) return "Give the key a name, such as the app that will use it.";
    if (value.length > 48) return "Keep the name under 48 characters.";
    if (taken.includes(value)) return "An active key already has this name.";
    return null;
}

// Wait a moment so busy labels are visible in the mock
export function pause(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
