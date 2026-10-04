import { labelFor, labelUpload, type RunEvent } from "@quard/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { configure } from "../core/config.ts";
import { newScope, type Scope } from "../context/scope.ts";
import { valueHash } from "../labels/hashed.ts";
import { printOf } from "../labels/print.ts";
import { resetAll } from "../test/reset.ts";
import { storeLabels } from "../transport/labels.ts";
import { keptLabels } from "./kept.ts";
import { localHash } from "./values.ts";
import { writeThrough } from "./write.ts";

vi.mock("../transport/labels.ts", () => ({ storeLabels: vi.fn(async () => true), lookupLabels: vi.fn() }));

const IBAN = "DE89370400440532013000";
const STEP = "00f067aa0ba902b7";
const stored = vi.mocked(storeLabels);

let events: RunEvent[] = [];

beforeEach(() => {
    events = [];
    configure({ onEvent: (event) => events.push(event) });
});

afterEach(() => {
    resetAll();
    vi.clearAllMocks();
});

function webScope(): Scope {
    const scope = newScope({ agent: "researcher" });
    scope.run.index.add(`Bank details: ${IBAN}`, labelFor("web:evil.com"), STEP);
    return scope;
}

function memoryEvent() {
    return events.find((event) => event.type === "memory");
}

describe("writeThrough", () => {
    it("stores the item's labels before the write, then writes", async () => {
        configure({ hashKey: "ab".repeat(32) });
        const scope = webScope();
        const value = { note: `Pay ${IBAN}` };
        const write = vi.fn(async () => {
            expect(stored).toHaveBeenCalledTimes(1);
            return "ok";
        });

        expect(await writeThrough(scope, "notes", value, write)).toBe("ok");

        const [records] = stored.mock.calls[0] ?? [];
        expect(labelUpload.parse({ records }).records).toEqual([
            {
                kind: "memory",
                store: "notes",
                print: printOf(value),
                runId: scope.run.runId,
                agent: "researcher",
                label: { trust: "untrusted", sensitivity: "public", origins: ["web:evil.com"], flagged: false },
                values: [
                    {
                        hash: valueHash("iban", IBAN),
                        origin: "web:evil.com",
                        trust: "untrusted",
                        sensitivity: "public",
                        flags: [],
                        stepId: STEP,
                    },
                ],
            },
        ]);
        expect(memoryEvent()).toMatchObject({
            runId: scope.run.runId,
            agent: "researcher",
            store: "notes",
            op: "write",
            items: 1,
            verified: 1,
            trust: "untrusted",
            sensitivity: "public",
        });
    });

    it("sends no values without a hash key, but keeps them in this process", async () => {
        const scope = webScope();

        await writeThrough(scope, "notes", `Pay ${IBAN}`, async () => undefined);

        expect(stored.mock.calls[0]?.[0][0]?.values).toEqual([]);
        expect(keptLabels(printOf(`Pay ${IBAN}`))?.values).toEqual([
            expect.objectContaining({ hash: localHash("iban", IBAN), origin: "web:evil.com" }),
        ]);
    });

    it("keeps no value records for values under fields named like secrets", async () => {
        const value = { note: "hello", password: IBAN };

        await writeThrough(webScope(), "notes", value, async () => undefined);

        expect(keptLabels(printOf(value))?.values).toEqual([]);
    });

    it("labels a write from a run that read nothing as unknown content", async () => {
        await writeThrough(newScope(), "notes", `Pay ${IBAN}`, async () => undefined);

        const unknown = { trust: "untrusted", sensitivity: "internal", origins: ["unknown"], flagged: false };
        expect(stored.mock.calls[0]?.[0][0]?.label).toEqual(unknown);
        expect(keptLabels(printOf(`Pay ${IBAN}`))?.label).toEqual(unknown);
    });

    it("still writes when the backend did not store the labels", async () => {
        stored.mockResolvedValueOnce(false);
        const write = vi.fn(async () => "ok");

        expect(await writeThrough(newScope(), "notes", "hello", write)).toBe("ok");

        expect(write).toHaveBeenCalled();
        expect(memoryEvent()).toMatchObject({ verified: 0, trust: "untrusted", sensitivity: "internal" });
    });

    it("still writes when storing the labels failed outright", async () => {
        stored.mockRejectedValueOnce(new Error("webhook down"));

        expect(await writeThrough(newScope(), "notes", "hello", async () => "ok")).toBe("ok");

        expect(memoryEvent()).toMatchObject({ verified: 0 });
    });

    it("records nothing when the write fails", async () => {
        const failing = async () => {
            throw new Error("disk full");
        };

        await expect(writeThrough(newScope(), "notes", "hello", failing)).rejects.toThrow("disk full");

        expect(memoryEvent()).toBeUndefined();
    });

    it("lists at most 200 origins of 2000 characters each", async () => {
        const scope = newScope();
        for (let i = 0; i < 210; i += 1) {
            scope.run.index.add(`page ${i}`, labelFor(`web:${"a".repeat(2100)}${i}.com`), STEP);
        }

        await writeThrough(scope, "notes", "hello", async () => undefined);

        const origins = stored.mock.calls[0]?.[0][0]?.label.origins ?? [];
        expect(origins).toHaveLength(200);
        expect(origins.every((origin) => origin.length === 2000)).toBe(true);
    });
});
