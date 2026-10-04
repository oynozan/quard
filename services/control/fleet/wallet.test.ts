import { markValueKnown } from "@quard/db";
import { startTestDb, type TestDb } from "@quard/db/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { openClient } from "../test/client.ts";
import { newProject } from "../test/context.ts";
import { fleetMessage, WALLET_VALUE } from "../test/messages.ts";
import { startTestControl } from "../test/server.ts";

let test: TestDb;

beforeAll(async () => {
    test = await startTestDb();
}, 60_000);

afterAll(async () => {
    await test.stop();
});

describe("the fleet check with x402 payee wallets", () => {
    it("quarantines a payee five runs pay and syncs it to every SDK", async () => {
        const project = await newProject(test.db);
        const control = await startTestControl(test);
        const caller = await openClient(control.port, project.key);
        const peer = await openClient(control.port, project.key);
        await caller.hello();
        await peer.hello();

        for (let n = 1; n <= 5; n += 1) {
            caller.send(fleetMessage(n, [WALLET_VALUE], { tool: "x402" }));
        }
        const results = [];
        for (let n = 1; n <= 5; n += 1) {
            results.push(await caller.next("fleet_result"));
        }

        const entry = { key: WALLET_VALUE.key, observe: true };
        expect(results.at(-1)?.quarantined).toEqual([entry]);
        expect(await peer.next("quarantine")).toEqual({ type: "quarantine", add: [entry], remove: [] });
        // An SDK that connects later gets the wallet in its list
        const late = await openClient(control.port, project.key);
        expect((await late.hello()).quarantine).toEqual([entry]);

        // Marked as known in the dashboard, it leaves every SDK's list
        await markValueKnown(test.db, project.projectId, WALLET_VALUE.key, "dana@acme.com");
        expect(await late.next("quarantine")).toEqual({ type: "quarantine", add: [], remove: [WALLET_VALUE.key] });
        await caller.close();
        await peer.close();
        await late.close();
        await control.close();
    });

    it("refuses a wallet key that is not a plain address", async () => {
        const project = await newProject(test.db);
        const control = await startTestControl(test);
        const caller = await openClient(control.port, project.key);
        await caller.hello();

        const message = fleetMessage(1, [{ ...WALLET_VALUE, key: `wallet:0x2096…287C#${"e".repeat(32)}` }]);
        caller.send(message);

        expect(await caller.next("error")).toMatchObject({ code: "bad_message", id: message.id });
        await caller.close();
        await control.close();
    });
});
