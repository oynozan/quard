import { labelFor, type ContentEvent, type MemoryRecord, type RunEvent } from "@quard/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { configure } from "../core/config.ts";
import { newScope, type Scope } from "../context/scope.ts";
import { printOf } from "../labels/print.ts";
import { labelArguments } from "../labels/value-labels.ts";
import { resetAll } from "../test/reset.ts";
import { lookupLabels } from "../transport/labels.ts";
import { keepLabels } from "./kept.ts";
import type { MemoryLabels } from "./merge.ts";
import { readThrough } from "./read.ts";
import { localHash } from "./values.ts";

vi.mock("../transport/labels.ts", () => ({ storeLabels: vi.fn(), lookupLabels: vi.fn(async () => undefined) }));

const IBAN = "DE89370400440532013000";
const STEP = "00f067aa0ba902b7";
const RUN = "4bf92f3577b34da6a3ce929d0e0e4736";
const NOTE = `Acme bank details: ${IBAN}`;
const lookup = vi.mocked(lookupLabels);

let events: RunEvent[] = [];

beforeEach(() => {
    events = [];
    configure({ onEvent: (event) => events.push(event) });
});

afterEach(() => {
    resetAll();
    vi.clearAllMocks();
});

function labels(trust: "trusted" | "untrusted", values: MemoryLabels["values"] = []): MemoryLabels {
    const sensitivity = trust === "trusted" ? "internal" : "public";
    return { label: { trust, sensitivity, origins: [], flagged: false }, values };
}

function webIban(hash = localHash("iban", IBAN)): MemoryLabels["values"][number] {
    return { hash, origin: "web:evil.com", trust: "untrusted", sensitivity: "public", flags: [], stepId: STEP };
}

function memoryRecord(print: string, from: MemoryLabels): MemoryRecord {
    return { kind: "memory", store: "notes", print, runId: RUN, agent: "researcher", ...from };
}

function contents(): ContentEvent[] {
    return events.filter((event): event is ContentEvent => event.type === "content");
}

function memoryEvent() {
    return events.find((event) => event.type === "memory");
}

// Where a value in the reading run first appeared, by exact match
function originOf(scope: Scope, value: string): string | undefined {
    const [label] = labelArguments({ value }, scope.run.index);
    return label?.values[0]?.occurrences.find((occurrence) => occurrence.match === "exact")?.origin;
}

describe("readThrough", () => {
    it("reads labels this process kept, values first, when no backend answers", async () => {
        keepLabels(printOf(NOTE), labels("trusted", [webIban()]));
        const scope = newScope({ agent: "billing" });

        expect(await readThrough(scope, "notes", false, async () => NOTE)).toBe(NOTE);

        expect(lookup).toHaveBeenCalledWith({ kind: "memory", print: printOf(NOTE) });
        expect(contents()).toMatchObject([
            { agent: "billing", origin: "web:evil.com", trust: "untrusted", keys: [`iban:${IBAN}`] },
            { origin: "memory:notes", trust: "trusted", sensitivity: "internal", flags: [], keys: [] },
        ]);
        expect(originOf(scope, IBAN)).toBe("web:evil.com");
        expect(memoryEvent()).toMatchObject({
            runId: scope.run.runId,
            agent: "billing",
            store: "notes",
            op: "read",
            items: 1,
            verified: 1,
            trust: "trusted",
            sensitivity: "internal",
        });
    });

    it("looks labels up and merges every record of the same content", async () => {
        const print = printOf(NOTE);
        lookup.mockResolvedValueOnce([
            memoryRecord(print, labels("trusted")),
            memoryRecord(print, labels("untrusted", [webIban()])),
            memoryRecord(printOf("other"), labels("trusted")),
            { ...memoryRecord(print, labels("trusted")), kind: "message", ref: "a".repeat(16), sender: "x", depth: 0 },
        ] as MemoryRecord[]);
        const scope = newScope();

        await readThrough(scope, "notes", false, async () => NOTE);

        expect(lookup).toHaveBeenCalledWith({ kind: "memory", print });
        expect(contents()[1]).toMatchObject({ origin: "memory:notes", trust: "untrusted", sensitivity: "internal" });
        expect(originOf(scope, IBAN)).toBe("web:evil.com");
        expect(memoryEvent()).toMatchObject({ verified: 1, trust: "untrusted", sensitivity: "internal" });
    });

    it("merges the labels it kept with the backend's, so the least trusted wins", async () => {
        keepLabels(printOf(NOTE), labels("trusted"));
        lookup.mockResolvedValueOnce([memoryRecord(printOf(NOTE), labels("untrusted", [webIban()]))]);
        const scope = newScope();

        await readThrough(scope, "notes", false, async () => NOTE);

        expect(contents()[1]).toMatchObject({ origin: "memory:notes", trust: "untrusted" });
        expect(originOf(scope, IBAN)).toBe("web:evil.com");
        expect(memoryEvent()).toMatchObject({ verified: 1, trust: "untrusted" });
    });

    it.each([
        ["control could not answer", undefined],
        ["no record exists", []],
    ])("reads unlabeled memory as untrusted and internal when %s", async (_name, answer) => {
        lookup.mockResolvedValueOnce(answer);
        const scope = newScope();

        await readThrough(scope, "notes", false, async () => NOTE);

        expect(contents()).toMatchObject([
            { origin: "memory:notes", trust: "untrusted", sensitivity: "internal", keys: [`iban:${IBAN}`] },
        ]);
        expect(originOf(scope, IBAN)).toBe("memory:notes");
        expect(memoryEvent()).toMatchObject({ items: 1, verified: 0, trust: "untrusted", sensitivity: "internal" });
    });

    it("reads unlabeled memory when the lookup fails outright", async () => {
        lookup.mockRejectedValueOnce(new Error("control down"));

        expect(await readThrough(newScope(), "notes", false, async () => NOTE)).toBe(NOTE);

        expect(memoryEvent()).toMatchObject({ verified: 0, trust: "untrusted" });
    });

    it("reads content changed outside the wrapper as unlabeled", async () => {
        keepLabels(printOf(NOTE), labels("trusted"));

        await readThrough(newScope(), "notes", false, async () => `${NOTE} or GB82WEST12345698765432`);

        expect(contents()[0]).toMatchObject({ origin: "memory:notes", trust: "untrusted" });
        expect(memoryEvent()).toMatchObject({ verified: 0 });
    });

    it("lets a team's override for the store win, for labeled items only", async () => {
        configure({ origins: { "memory:notes": { sensitivity: "public" }, "memory:crm": { trust: "trusted" } } });
        keepLabels(printOf("labeled"), labels("trusted"));

        await readThrough(newScope(), "notes", false, async () => "labeled");
        await readThrough(newScope(), "crm", false, async () => "unlabeled");

        expect(contents()).toMatchObject([
            { origin: "memory:notes", trust: "trusted", sensitivity: "public" },
            { origin: "memory:crm", trust: "untrusted", sensitivity: "internal" },
        ]);
    });

    it("flags an item written while the writer's context was flagged", async () => {
        keepLabels(printOf(NOTE), { label: { ...labels("trusted").label, flagged: true }, values: [] });

        await readThrough(newScope(), "notes", false, async () => NOTE);

        expect(contents()[0]).toMatchObject({ origin: "memory:notes", flags: ["flagged"] });
    });

    it("reads an item with hidden characters as untrusted and flagged, even when its records vouch", async () => {
        const note = `${NOTE}${String.fromCodePoint(0x200b)}`;
        keepLabels(printOf(note), labels("trusted"));

        await readThrough(newScope(), "notes", false, async () => note);

        expect(contents()[0]).toMatchObject({ origin: "memory:notes", trust: "untrusted", flags: ["invisible_text"] });
        expect(memoryEvent()).toMatchObject({ verified: 1, trust: "untrusted" });
    });

    it("vouches for a URL itself, while its host and domain take the item's label", async () => {
        const url = "https://pay.evil.com/inv/114";
        const note = `Pay at ${url}`;
        const stored = { ...webIban(localHash("url", url)), origin: "web:evil.com" };
        keepLabels(printOf(note), labels("trusted", [stored]));
        const scope = newScope();

        await readThrough(scope, "notes", false, async () => note);

        expect(contents()).toMatchObject([
            { origin: "web:evil.com", keys: [`url:${url}`] },
            { origin: "memory:notes", keys: ["host:pay.evil.com", "domain:evil.com"] },
        ]);
    });

    it("keeps the labels a value had earlier in the reading run", async () => {
        keepLabels(printOf(NOTE), labels("trusted", [webIban()]));
        const scope = newScope();
        scope.run.index.add(`Supplier IBAN ${IBAN}`, labelFor("tool:crm"), STEP);

        await readThrough(scope, "notes", false, async () => NOTE);

        expect(contents()).toMatchObject([{ origin: "memory:notes", keys: [] }]);
        expect(originOf(scope, IBAN)).toBe("tool:crm");
    });

    it("reads one item from get and one per element from a list", async () => {
        const items = ["first note", { text: "second note" }, null, undefined];
        for (const item of items.slice(0, 2)) {
            keepLabels(printOf(item), labels("trusted"));
        }

        await readThrough(newScope(), "notes", true, async () => items);
        await readThrough(newScope(), "notes", false, async () => items);
        await readThrough(newScope(), "notes", true, async () => "single");

        const reads = events.filter((event) => event.type === "memory");
        expect(reads).toMatchObject([
            { items: 2, verified: 2, trust: "trusted" },
            { items: 1, verified: 0, trust: "untrusted" },
            { items: 1, verified: 0 },
        ]);
    });

    it("records a read that found nothing", async () => {
        await readThrough(newScope(), "notes", false, async () => undefined);

        expect(lookup).not.toHaveBeenCalled();
        expect(contents()).toEqual([]);
        expect(memoryEvent()).toMatchObject({ items: 0, verified: 0, trust: "trusted", sensitivity: "public" });
    });
});
