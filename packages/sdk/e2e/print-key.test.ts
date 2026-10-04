import { createHash } from "node:crypto";
import type { LabelRecord } from "@quard/shared";
import { afterEach, describe, expect, it } from "vitest";
import { quard } from "../index.ts";
import { TEST_PROJECT } from "../test/hash-key.ts";
import { resetAll } from "../test/reset.ts";
import { startWebhookServer, WEBHOOK_KEY } from "../test/webhook-server.ts";

// The print of short content leaves the process. Without the project's
// hash key, which only the project's agents get, nobody can test a guess
// against it.

const EMAIL = "bob@acme.com";
const IBAN = "DE89370400440532013000";

afterEach(() => {
    resetAll();
});

function sha256(text: string): string {
    return createHash("sha256").update(text).digest("hex");
}

// The prints webhook received for two messages and one memory item, from
// an agent of the project
async function printsIn(project: string): Promise<string[]> {
    const labels: LabelRecord[] = [];
    const webhook = await startWebhookServer(labels, WEBHOOK_KEY, project);
    quard.configure({ key: WEBHOOK_KEY, webhookUrl: webhook.url });
    const store = { put: (_key: string, _value: string) => undefined };
    await quard.run({}, async () => {
        await quard.inject({ content: EMAIL });
        await quard.inject({ content: { iban: IBAN } });
        await quard.memory(store, { name: "notes" }).put("k", EMAIL);
    });
    await webhook.close();
    resetAll();
    return labels.flatMap((record) => ("print" in record ? [record.print] : []));
}

describe("the content print that leaves the process", () => {
    it("can't be matched against a plain hash of the content", async () => {
        const prints = await printsIn(TEST_PROJECT);
        const guesses = [EMAIL, JSON.stringify(EMAIL), `iban ${IBAN}`, `iban\n${IBAN}`, JSON.stringify({ iban: IBAN })];

        expect(prints).toHaveLength(3);
        for (const print of prints) {
            expect(print).toMatch(/^[0-9a-f]{64}$/);
            expect(guesses.map(sha256)).not.toContain(print);
        }
    });

    it("changes with the project, whose key webhook hands out", async () => {
        const first = await printsIn(TEST_PROJECT);
        const again = await printsIn(TEST_PROJECT);
        const other = await printsIn("project-other");

        expect(again).toEqual(first);
        expect(other.filter((print) => first.includes(print))).toEqual([]);
    });
});
