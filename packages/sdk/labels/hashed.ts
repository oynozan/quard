import { keyedHash, type ValueType } from "@quard/shared";
import { projectKey } from "../core/project-key.ts";

// The hash a traced value goes by outside the process, made with the
// project's hash key. Undefined until the key is known.
export function valueHash(type: ValueType, value: string): string | undefined {
    const key = projectKey();
    return key === undefined ? undefined : keyedHash(key, type, value);
}
