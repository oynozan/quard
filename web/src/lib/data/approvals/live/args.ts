import type { OpenApprovalItem } from "@quard/db";
import { flatten } from "../../runs/live/values";
import type { ApprovalArg, Label } from "../../types";

export type LabelValue = OpenApprovalItem["labels"][number]["values"][number];

// One argument value with its mask and the traced values in it
export type ParsedArg = { name: string; value: string; masked: string; values: LabelValue[] };

type Source = Pick<OpenApprovalItem, "args" | "masked" | "labels">;

// A tool called without input has no arguments to show
function leaves(value: unknown) {
    return value === null || value === undefined ? [] : flatten(value);
}

// The full values, their masks and their labels. A tool called with one
// plain value has the path "input", which the SDK sends as "".
export function parseArgs(source: Source): ParsedArg[] {
    const masked = leaves(source.masked);
    return leaves(source.args).map(({ path, value }, index) => ({
        name: path,
        value,
        // Both come from the same object, so they line up one to one
        masked: masked[index]?.value ?? "…",
        values: source.labels.find((label) => (label.path || "input") === path)?.values ?? [],
    }));
}

// Where the traced values came from, one label per origin, first appearance first
export function originsOf(values: LabelValue[]): Label[] {
    const labels = new Map<string, Label>();
    for (const { origin, trust, sensitivity } of values.flatMap((value) => value.origins)) {
        if (!labels.has(origin)) labels.set(origin, { origin, trust, sensitivity });
    }
    return [...labels.values()];
}

// An argument as the approver reads it: the full value and its origins
export function approvalArgOf(arg: ParsedArg): ApprovalArg {
    const generated = arg.values.some((value) => value.generated);
    return {
        name: arg.name,
        value: arg.value,
        origins: originsOf(arg.values),
        ...(generated ? { generated: true } : {}),
        traced: arg.values.length > 0,
    };
}
