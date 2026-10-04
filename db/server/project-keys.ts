import { createRedactor, projectHashKey, type Redactor } from "@quard/shared";

// Each project hashes with its own key, made from the install's key
export type ProjectKeys = {
    // The key as 64 lowercase hex characters, the one the project's agents hash with
    hashKey(projectId: string): string;
    redactor(projectId: string): Redactor;
};

type Keys = { hashKey: string; redactor: Redactor };

// Past this many projects, the one cached first is made again when it comes back
const MAX_PROJECTS = 10_000;

export function projectKeys(installKey: Buffer): ProjectKeys {
    const cache = new Map<string, Keys>();

    function keysOf(projectId: string): Keys {
        const cached = cache.get(projectId);
        if (cached !== undefined) {
            return cached;
        }
        if (cache.size >= MAX_PROJECTS) {
            cache.delete(cache.keys().next().value as string);
        }
        const key = projectHashKey(installKey, projectId);
        const made = { hashKey: key.toString("hex"), redactor: createRedactor(key) };
        cache.set(projectId, made);
        return made;
    }

    return {
        hashKey: (projectId) => keysOf(projectId).hashKey,
        redactor: (projectId) => keysOf(projectId).redactor,
    };
}
