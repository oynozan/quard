import { createHash } from "node:crypto";
import { canonicalJson, redactText } from "@quard/shared";

// One version of an agent, from its model, instructions and tools
export type AgentVersion = {
    agent: string;
    version: string;
    model: string;
    tools: string[];
    instructions: string | undefined;
};

// Templated instructions can make a version per call, so only the newest are kept
const MAX_KNOWN = 100;
const known = new Map<string, AgentVersion>();

// A 16-hex hash of the model, the instructions and the tool names. The
// instructions are hashed redacted, as control stores them, so the hash
// can't be used to guess what the redaction masked.
export function versionOf(model: string, instructions: string | undefined, tools: readonly string[]): string {
    const shown = instructions === undefined ? null : redactText(instructions);
    const text = canonicalJson({ model, instructions: shown, tools: [...tools].sort() });
    return createHash("sha256").update(text).digest("hex").slice(0, 16);
}

// True the first time this process sees the agent at this version
export function rememberVersion(entry: AgentVersion): boolean {
    const id = `${entry.agent}\u0000${entry.version}`;
    if (known.has(id)) {
        return false;
    }
    known.set(id, entry);
    if (known.size > MAX_KNOWN) {
        known.delete(known.keys().next().value as string);
    }
    return true;
}

export function knownVersions(): AgentVersion[] {
    return [...known.values()];
}

export function clearVersions(): void {
    known.clear();
}
