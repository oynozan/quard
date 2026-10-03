import type { Carrier } from "./carrier.ts";

// Baggage keys for the three items, and the carrier field each one fills
const FIELDS = new Map([
    ["quard-run", "runId"],
    ["quard-parent", "parentStepId"],
    ["quard-labels", "labelRef"],
]);

// The carrier as W3C baggage list members, to add to a baggage header
export function toBaggage(carrier: Carrier): string {
    const values: Array<[string, string | undefined]> = [
        ["quard-run", carrier.runId],
        ["quard-parent", carrier.parentStepId],
        ["quard-labels", carrier.labelRef],
    ];
    return values
        .flatMap(([key, value]) => (value === undefined ? [] : [`${key}=${encodeURIComponent(value)}`]))
        .join(",");
}

// The carrier fields in a baggage header, other members and properties left out
export function readBaggage(header: string): Record<string, string> {
    const fields: Record<string, string> = {};
    for (const member of header.split(",")) {
        const at = member.indexOf("=");
        const field = FIELDS.get(member.slice(0, Math.max(at, 0)).trim());
        if (field === undefined || field in fields) {
            continue;
        }
        const value = member.slice(at + 1).split(";")[0] as string;
        try {
            fields[field] = decodeURIComponent(value.trim());
        } catch {
            // A value that is not percent-encoded right is unreadable
        }
    }
    return fields;
}
