import { join } from "node:path";
import { rulesSnapshot as snapshotSchema } from "@quard/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { configure } from "../core/config.ts";
import { registerGuardedTool } from "../context/registry.ts";
import { tempDir, writeJson } from "../test/files.ts";
import { resetAll } from "../test/reset.ts";
import { rulesHash, rulesSnapshot } from "./rules.ts";
import { refreshSources } from "./state.ts";

beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"], now: 0 });
});

afterEach(() => {
    resetAll();
    vi.useRealTimers();
});

// The run limits come first, in observe mode until a team turns them on
const RUN_RULES = [
    "* limit max-depth observe",
    "* limit max-fan-out observe",
    "* limit max-loops observe",
    "* limit max-steps observe",
    "* limit max-cost observe",
];

describe("rulesSnapshot", () => {
    it("lists each guarded tool's rules by the names their decisions use", () => {
        registerGuardedTool("sendEmail", [{ type: "egress", mode: "observe" }]);
        registerGuardedTool("payInvoice", [
            { type: "approval", timeout: 600 },
            {
                type: "action",
                rules: [
                    { field: "iban", from: ["tool:getSupplier"] },
                    { field: "amount", max: 10, name: "cap" },
                    { field: "to", neverSeen: true },
                    { name: "weekday", check: () => "allow" },
                ],
            },
            { type: "limit", maxCallsPerDay: 5, fleetCheck: ["iban"] },
        ]);
        registerGuardedTool("fetchPage", [{ type: "source", origin: "web", originOf: () => "web:a.com" }]);

        const snapshot = rulesSnapshot();

        expect(snapshotSchema.safeParse(snapshot).success).toBe(true);
        expect(snapshot.list.map(({ tool, guard, rule, mode }) => `${tool} ${guard} ${rule} ${mode}`)).toEqual([
            ...RUN_RULES,
            "fetchPage source source block",
            "payInvoice approval approval block",
            "payInvoice action iban:from block",
            "payInvoice action cap block",
            "payInvoice action to:never-seen block",
            "payInvoice action weekday block",
            "payInvoice limit max-calls-per-day block",
            "payInvoice limit fleet-check block",
            "sendEmail egress untrusted-destination observe",
            "sendEmail egress allowlist observe",
            "sendEmail egress payload:secrets observe",
            "sendEmail egress payload:cards observe",
            "sendEmail egress payload:ibans observe",
        ]);
    });

    it("builds again only when a guard registers", () => {
        registerGuardedTool("payInvoice", [{ type: "approval" }]);
        const first = rulesSnapshot();

        expect(rulesSnapshot()).toBe(first);
        registerGuardedTool("payInvoice", [{ type: "approval", timeout: 60 }]);
        expect(rulesSnapshot().hash).not.toBe(first.hash);
    });

    it("hashes custom rules and functions by name, so code changes inside them keep the hash", () => {
        registerGuardedTool("pay", [{ type: "action", rules: [{ name: "weekday", check: () => "allow" }] }]);
        const before = rulesSnapshot().hash;
        registerGuardedTool("pay", [{ type: "action", rules: [{ name: "weekday", check: () => "block" }] }]);
        const same = rulesSnapshot().hash;
        registerGuardedTool("pay", [{ type: "action", rules: [{ name: "weekend", check: () => "block" }] }]);

        expect(same).toBe(before);
        expect(rulesSnapshot().hash).not.toBe(before);
    });

    it("uses the policy file's options and follows its changes", () => {
        registerGuardedTool("search", [{ type: "limit", maxCallsPerRun: 1 }]);
        const fromCode = rulesSnapshot();
        const path = writeJson(join(tempDir(), "p.json"), { version: 1, guards: { search: [{ type: "approval" }] } });
        configure({ policyFile: path });
        const fromFile = rulesSnapshot();

        writeJson(path, { version: 2, strictness: "strict", guards: { search: [{ type: "approval" }] } });
        vi.setSystemTime(1000);
        refreshSources(Date.now());

        expect(fromFile.list.filter((entry) => entry.tool === "search")).toEqual([
            { tool: "search", guard: "approval", rule: "approval", mode: "block" },
        ]);
        expect(new Set([fromCode.hash, fromFile.hash, rulesSnapshot().hash]).size).toBe(3);
    });

    it("follows the signature feed's mode", () => {
        registerGuardedTool("search", []);
        const feed = writeJson(join(tempDir(), "feed.json"), { version: "f", signatures: [] });
        configure({ signatures: { file: feed } });
        const blocking = rulesSnapshot().hash;

        configure({ signatures: { file: feed, mode: "observe" } });

        expect(rulesSnapshot().hash).not.toBe(blocking);
    });

    it("lists the run limits, and follows their changes in code and in the policy file", () => {
        const observing = rulesSnapshot();

        configure({ runLimits: { mode: "block" } });
        const blocking = rulesSnapshot();
        configure({ runLimits: { mode: "block", steps: 50 } });
        const fewerSteps = rulesSnapshot();
        const path = writeJson(join(tempDir(), "p.json"), { version: 1, runLimits: { mode: "observe" } });
        configure({ policyFile: path });

        expect(blocking.list.slice(0, 5).map((entry) => entry.mode)).toEqual(Array(5).fill("block"));
        expect(fewerSteps.list).toEqual(blocking.list);
        expect(new Set([observing.hash, blocking.hash, fewerSteps.hash, rulesSnapshot().hash]).size).toBe(4);
        expect(rulesSnapshot().list[0]?.mode).toBe("observe");
    });

    it("keeps names within control's limits", () => {
        registerGuardedTool("t".repeat(250), [{ type: "action", rules: [{ name: "", check: () => "allow" }] }]);

        const entry = rulesSnapshot().list.find((found) => found.guard === "action");

        expect(entry?.tool).toHaveLength(200);
        expect(entry?.rule).toBe("-");
    });
});

describe("rulesHash", () => {
    it("is there once a guarded tool exists", () => {
        expect(rulesHash()).toBeUndefined();
        expect(rulesSnapshot().list.map((entry) => entry.tool)).toEqual(["*", "*", "*", "*", "*"]);

        registerGuardedTool("pay", [{ type: "approval" }]);

        expect(rulesHash()).toMatch(/^[0-9a-f]{16}$/);
    });
});
