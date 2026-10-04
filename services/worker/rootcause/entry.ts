import { byTime, type StoredLabel, type StoredStep } from "./run.ts";
import type { Appearance, Match, TracedValue } from "./trace.ts";

// Where the harm came into the run
export type Entry = {
    stepId: string;
    agent: string;
    at: Date;
    origin: string;
    trust: "trusted" | "untrusted";
    sensitivity: "internal" | "public";
    flags: string[];
    // The content that came in, when the entry is content
    contentId: string | null;
    // The value of the damaging call that the content held, as a stored key
    key: string | null;
};

type Seen = Appearance & { key: string };

const STRENGTH: Match[] = ["value", "host", "domain"];

function strongestFirst(a: Seen, b: Seen): number {
    return STRENGTH.indexOf(a.match) - STRENGTH.indexOf(b.match) || byTime(a, b);
}

function flaggedFirst(a: StoredLabel, b: StoredLabel): number {
    return Number(b.flags.length > 0) - Number(a.flags.length > 0) || byTime(a, b);
}

export function contentEntry(label: Omit<StoredLabel, "keys">, key: string | null): Entry {
    const { contentId, stepId, agent, at, origin, trust, sensitivity, flags } = label;
    return { stepId, agent, at, origin, trust, sensitivity, flags, contentId, key };
}

// A step as the entry point, such as a tool that failed
export function stepEntry(step: StoredStep, origin: string): Entry {
    const { stepId, agent, at } = step;
    return {
        stepId,
        agent,
        at,
        origin,
        trust: "trusted",
        sensitivity: "internal",
        flags: [],
        contentId: null,
        key: null,
    };
}

// In order: untrusted content that held a value of the call, an exact value
// before a host or domain; untrusted content the agent read before the
// turning point, flagged first; the first place a value came from; else the
// model call itself, as in bad reasoning.
export function pickEntry(values: TracedValue[], read: StoredLabel[], turning: StoredStep): Entry {
    const seen = values.flatMap((value) => value.appearances.map((appearance) => ({ ...appearance, key: value.key })));
    const fromValue = seen.filter((item) => item.trust === "untrusted").toSorted(strongestFirst)[0];
    if (fromValue !== undefined) {
        return contentEntry(fromValue, fromValue.key);
    }
    const influence = read.filter((label) => label.trust === "untrusted").toSorted(flaggedFirst)[0];
    if (influence !== undefined) {
        return contentEntry(influence, null);
    }
    const first = seen.toSorted(strongestFirst)[0];
    return first === undefined ? stepEntry(turning, `agent:${turning.agent}`) : contentEntry(first, first.key);
}
