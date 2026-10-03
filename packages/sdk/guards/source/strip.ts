import { cleanText, INVISIBLE } from "@quard/shared";
import { HIDDEN_STYLE, INSTRUCTION_PATTERNS, TOOL_CALL_PATTERNS } from "./scan.ts";

const SUSPECT = [...INSTRUCTION_PATTERNS, ...TOOL_CALL_PATTERNS, HIDDEN_STYLE];

// Removes hidden characters and lines that look like instructions,
// tool calls or hidden styling
export function stripSuspect(text: string): string {
    return text
        .replace(INVISIBLE, "")
        .split("\n")
        .filter((line) => !SUSPECT.some((pattern) => pattern.test(cleanText(line))))
        .join("\n");
}

// Applies a change to every string inside a value
export function mapStrings(value: unknown, change: (text: string) => string): unknown {
    if (typeof value === "string") {
        return change(value);
    }
    if (Array.isArray(value)) {
        return value.map((item) => mapStrings(item, change));
    }
    if (value !== null && typeof value === "object") {
        return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, mapStrings(item, change)]));
    }
    return value;
}
