import { labelUpload, type LabelRecord, type LookupMessage, type RunEvent } from "@quard/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { learnProjectKey } from "../core/project-key.ts";
import { guard, isGuardRefusal, quard, type GuardCall } from "../index.ts";
import { firstAppearance, valuesAt } from "../labels/value-labels.ts";
import { clearMemory } from "../memory/kept.ts";
import { PROJECT_KEY_TEXT } from "../test/hash-key.ts";
import { resetAll } from "../test/reset.ts";

// Shared memory between two agents in separate runs: a researcher writes
// notes, and later a billing agent reads them and pays. The backend that
// keeps memory labels is faked; its records must pass the shared schema.

const backend = vi.hoisted(() => ({ records: [] as LabelRecord[] }));

vi.mock("../transport/labels.ts", () => ({
    storeLabels: async (records: LabelRecord[]) => {
        backend.records.push(...labelUpload.parse({ records }).records);
        return true;
    },
    lookupLabels: async (target: LookupMessage["target"]) =>
        backend.records.filter((found) => found.kind === "memory" && "print" in target && found.print === target.print),
    waitForKey: async () => true,
}));

const IBAN = "DE89370400440532013000";
const EVIL_IBAN = "GB82WEST12345698765432";
const PAGE = "Invoice 114 from Acme Supplies.\nNew bank details: DE89 3704 0044 0532 0130 00.";
const PAGE_URL = "https://invoices.evil-pay.com/inv/114";
const NOTE = `Acme Supplies bank details: ${IBAN}`;

let events: RunEvent[] = [];

beforeEach(() => {
    events = [];
    backend.records = [];
    quard.configure({ onEvent: (event) => events.push(event) });
});

afterEach(() => {
    resetAll();
});

function makeStore() {
    const items = new Map<string, string>();
    return {
        items,
        get: (key: string) => items.get(key),
        put: (key: string, value: string) => {
            items.set(key, value);
        },
    };
}

function makeAgents() {
    const store = makeStore();
    const notes = quard.memory(store, { name: "notes" });
    let checked: GuardCall | undefined;
    const fetchPage = guard(async (_input: { url: string }) => PAGE, {
        type: "source",
        origin: "web",
        name: "fetchPage",
    });
    const getSupplier = guard(async (_input: { supplier: string }) => `Acme Supplies IBAN: ${IBAN}`, {
        type: "limit",
        name: "getSupplier",
    });
    const rawPay = vi.fn(async (_input: { iban: string; amount: number }) => "paid");
    const payInvoice = guard(rawPay, {
        type: "action",
        name: "payInvoice",
        rules: [
            { field: "iban", from: ["tool:getSupplier"] },
            {
                name: "keep",
                check: (call) => {
                    checked = call;
                    return "allow";
                },
            },
        ],
    });
    // The billing agent pays whatever IBAN its notes hold
    const billing = () =>
        quard.run({ agent: "billing" }, async () => {
            const note = (await notes.get("acme")) ?? "";
            const iban = note.slice(note.lastIndexOf(" ") + 1);
            return payInvoice({ iban, amount: 4950 });
        });
    return { store, notes, rawPay, checked: () => checked, fetchPage, getSupplier, billing };
}

function firstOrigin(call: GuardCall | undefined): string | undefined {
    const [value] = valuesAt(call?.values ?? [], "iban");
    return value === undefined ? undefined : firstAppearance(value, ["exact"])?.origin;
}

function memoryEvents(op: "read" | "write") {
    return events.flatMap((event) => (event.type === "memory" && event.op === op ? [event] : []));
}

describe("an IBAN from a web page, written to memory by one agent", () => {
    async function research(agents: ReturnType<typeof makeAgents>): Promise<void> {
        await quard.run({ agent: "researcher" }, async () => {
            await agents.fetchPage({ url: PAGE_URL });
            await agents.notes.put("acme", NOTE);
        });
    }

    it("is blocked in another agent's payment in a later run in the same process", async () => {
        const agents = makeAgents();
        await research(agents);

        const out = await agents.billing();

        expect(isGuardRefusal(out)).toBe(true);
        expect(agents.rawPay).not.toHaveBeenCalled();
        expect(firstOrigin(agents.checked())).toBe("web:invoices.evil-pay.com");
        expect(memoryEvents("read")[0]).toMatchObject({ agent: "billing", verified: 1, trust: "untrusted" });
    });

    it("is blocked in another process, which looks the labels up", async () => {
        learnProjectKey(PROJECT_KEY_TEXT);
        const agents = makeAgents();
        await research(agents);
        clearMemory();

        const out = await agents.billing();

        expect(isGuardRefusal(out)).toBe(true);
        expect(agents.rawPay).not.toHaveBeenCalled();
        expect(firstOrigin(agents.checked())).toBe("web:invoices.evil-pay.com");
        expect(backend.records).toHaveLength(1);
        expect(JSON.stringify(backend.records)).not.toContain(IBAN);
        const [write] = memoryEvents("write");
        const [read] = memoryEvents("read");
        expect(write).toMatchObject({ agent: "researcher", store: "notes", items: 1, verified: 1 });
        expect(read).toMatchObject({ agent: "billing", store: "notes", items: 1, verified: 1 });
        // The two agents ran in two runs
        expect(read?.runId).not.toBe(write?.runId);
    });
});

describe("an IBAN from the supplier records, written to memory", () => {
    async function research(agents: ReturnType<typeof makeAgents>): Promise<void> {
        await quard.run({ agent: "researcher" }, async () => {
            await agents.getSupplier({ supplier: "acme" });
            await agents.notes.put("acme", NOTE);
        });
    }

    it("is paid in a later run in another process, because its labels come back", async () => {
        learnProjectKey(PROJECT_KEY_TEXT);
        const agents = makeAgents();
        await research(agents);
        clearMemory();

        const out = await agents.billing();

        expect(out).toBe("paid");
        expect(agents.rawPay).toHaveBeenCalledWith({ iban: IBAN, amount: 4950 });
        expect(firstOrigin(agents.checked())).toBe("tool:getSupplier");
        expect(memoryEvents("read")[0]).toMatchObject({ verified: 1, trust: "trusted", sensitivity: "internal" });
    });

    it("reads back untrusted once changed outside the wrapper, and is not paid", async () => {
        const agents = makeAgents();
        await research(agents);
        agents.store.items.set("acme", `Acme Supplies bank details: ${EVIL_IBAN}`);

        const out = await agents.billing();

        expect(isGuardRefusal(out)).toBe(true);
        expect(agents.rawPay).not.toHaveBeenCalled();
        expect(firstOrigin(agents.checked())).toBe("memory:notes");
        expect(memoryEvents("read")[0]).toMatchObject({ verified: 0, trust: "untrusted", sensitivity: "internal" });
        expect(events.find((event) => event.type === "content" && event.agent === "billing")).toMatchObject({
            origin: "memory:notes",
            trust: "untrusted",
        });
    });
});
