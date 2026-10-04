import type { MemoryEvent, RunEvent } from "@quard/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { configure } from "../core/config.ts";
import { currentScope, runScope, type Scope } from "../context/scope.ts";
import { printOf } from "../labels/print.ts";
import { resetAll } from "../test/reset.ts";
import { keptLabels } from "./kept.ts";
import { memory } from "./wrap.ts";

vi.mock("../transport/labels.ts", () => ({
    storeLabels: vi.fn(async () => true),
    lookupLabels: vi.fn(async () => undefined),
    waitForKey: vi.fn(async () => true),
}));

let events: RunEvent[] = [];

beforeEach(() => {
    events = [];
    configure({ onEvent: (event) => events.push(event) });
});

afterEach(() => {
    resetAll();
});

function memoryEvents(): MemoryEvent[] {
    return events.filter((event): event is MemoryEvent => event.type === "memory");
}

// A store with private state, sync writes and async reads
class Notes {
    readonly #items = new Map<string, string>();
    label = "team notes";
    scopes: Array<Scope | undefined> = [];

    get(key: string): string | undefined {
        this.scopes.push(currentScope());
        return this.#items.get(key);
    }

    put(key: string, value: string): string {
        this.#items.set(key, value);
        return "stored";
    }

    async search(word: string): Promise<string[]> {
        return [...this.#items.values()].filter((item) => item.includes(word));
    }

    count(): number {
        return this.#items.size;
    }
}

describe("quard.memory", () => {
    it.each([
        ["no options", undefined],
        ["no name", {}],
        ["an empty name", { name: "" }],
        ["a name that is not text", { name: 7 }],
        ["a name over 200 characters", { name: "n".repeat(201) }],
    ])("needs a store name, so it refuses %s", (_name, options) => {
        expect(() => memory({}, options as never)).toThrow("quard.memory() needs options.name");
    });

    it("keeps the store's shape and lets other methods and fields through", async () => {
        const notes = memory(new Notes(), { name: "notes" });

        expect(await notes.put("a", "first note")).toBe("stored");
        expect(notes.count()).toBe(1);
        expect(notes.label).toBe("team notes");
        expect(await notes.get("a")).toBe("first note");
        expect(await notes.search("note")).toEqual(["first note"]);
        expect(memoryEvents().map((event) => event.op)).toEqual(["write", "read", "read"]);
    });

    it("works on a Map, whose methods need the real Map", async () => {
        const map = memory(new Map<string, string>(), { name: "map" });

        map.set("a", "first note");

        expect(map.size).toBe(1);
        expect(await map.get("a")).toBe("first note");
        expect(memoryEvents()).toMatchObject([{ op: "read", items: 1 }]);
    });

    it("wraps write and read, and leaves missing methods missing", async () => {
        const saved: unknown[] = [];
        const store = memory(
            {
                write: (value: unknown) => {
                    saved.push(value);
                },
                read: () => saved,
            },
            { name: "log" },
        );

        await store.write({ text: "first note" });
        expect(await store.read()).toEqual([{ text: "first note" }]);

        expect(keptLabels(printOf({ text: "first note" }))).toBeDefined();
        expect(memoryEvents()).toMatchObject([
            { op: "write", items: 1 },
            { op: "read", items: 1, verified: 1 },
        ]);
        expect((store as { get?: unknown }).get).toBeUndefined();
    });

    it("labels what put writes, not the key", async () => {
        const notes = memory(new Notes(), { name: "notes" });

        await notes.put("key", "the value");

        expect(keptLabels(printOf("the value"))).toBeDefined();
        expect(keptLabels(printOf("key"))).toBeUndefined();
    });

    it("joins the current run and runs the store inside it", async () => {
        const store = new Notes();
        const notes = memory(store, { name: "notes" });

        await runScope({ agent: "researcher" }, async () => {
            await notes.get("a");
            expect(store.scopes[0]).toBe(currentScope());
        });

        const started = events.filter((event) => event.type === "run_started");
        expect(started).toHaveLength(1);
        expect(memoryEvents()[0]).toMatchObject({ agent: "researcher", runId: started[0]?.runId });
    });

    it("starts a new run under the agent default outside any run, as guard() does", async () => {
        const store = new Notes();
        const notes = memory(store, { name: "notes" });

        await notes.get("a");
        await notes.get("b");

        const started = events.filter((event) => event.type === "run_started");
        expect(started).toHaveLength(2);
        expect(started[0]).toMatchObject({ agent: "default" });
        expect(store.scopes[0]?.agent).toBe("default");
        expect(memoryEvents().map((event) => event.runId)).toEqual(started.map((event) => event.runId));
    });

    it("passes a store error on, from a sync or an async method", async () => {
        const store = memory(
            {
                get: () => {
                    throw new Error("sync failure");
                },
                search: async () => {
                    throw new Error("async failure");
                },
            },
            { name: "broken" },
        );

        await expect(store.get()).rejects.toThrow("sync failure");
        await expect(store.search()).rejects.toThrow("async failure");
        expect(memoryEvents()).toEqual([]);
    });
});
