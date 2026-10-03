import type { ContextLabel, MessageRecord } from "@quard/shared";
import { hashValues, type ValueRecord } from "./value-records.ts";

// What a sender knows about a message as it leaves
export type SentMessage = {
    ref: string;
    runId: string;
    // The sender's latest step, if it made one
    stepId: string | undefined;
    sender: string;
    depth: number;
    // A hash of the content's normalized text
    print: string;
    // The sender run's context label when the message left
    label: ContextLabel;
    values: ValueRecord[];
    // The guarded tools the sender may use, or undefined for all of them
    tools: readonly string[] | undefined;
};

// Webhook's limits for one record
const MAX_NAME = 200;
const MAX_ORIGIN = 2000;
const MAX_ORIGINS = 200;
const MAX_FLAG = 100;
const MAX_FLAGS = 20;
const MAX_VALUES = 500;
const MAX_TOOLS = 500;
const MAX_DEPTH = 1000;

function name(text: string): string {
    return text === "" ? "-" : text.slice(0, MAX_NAME);
}

function flags(list: readonly string[]): string[] {
    return list.slice(0, MAX_FLAGS).map((flag) => flag.slice(0, MAX_FLAG));
}

// The record as webhook stores it, cut to fit, where dropped tools only narrow
export function messageRecordOf(sent: SentMessage): MessageRecord {
    const { label, stepId, tools } = sent;
    return {
        kind: "message",
        ref: sent.ref,
        runId: sent.runId,
        ...(stepId === undefined ? {} : { stepId }),
        sender: name(sent.sender),
        depth: Math.min(sent.depth, MAX_DEPTH),
        print: sent.print,
        label: {
            trust: label.trust,
            sensitivity: label.sensitivity,
            origins: label.origins.slice(0, MAX_ORIGINS).map((origin) => origin.slice(0, MAX_ORIGIN)),
            flagged: label.flagged,
        },
        values: hashValues(sent.values)
            .slice(0, MAX_VALUES)
            .map((value) => ({ ...value, origin: value.origin.slice(0, MAX_ORIGIN), flags: flags(value.flags) })),
        ...(tools === undefined
            ? {}
            : { tools: tools.filter((tool) => tool !== "" && tool.length <= MAX_NAME).slice(0, MAX_TOOLS) }),
    };
}
