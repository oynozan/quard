// @vitest-environment node
import type { AgentRosterRow } from "@quard/db";
import { describe, expect, it } from "vitest";
import { NOW } from "../../../../test/time";
import { agentsOf, guardRows } from "./rail";

function roster(agent: string, running: boolean, model: string | null = "gpt-5.4-mini"): AgentRosterRow {
    return { agent, lastSeenAt: new Date(NOW), runs24h: 1, running, model };
}

describe("agentsOf", () => {
    it("lists running agents first and keeps each group in name order", () => {
        const agents = agentsOf([
            roster("billing", false),
            roster("inbox", true),
            roster("research", false, null),
            roster("support", true, "o4-mini"),
        ]);

        expect(agents).toEqual([
            { name: "inbox", state: "running", model: "gpt-5.4-mini" },
            { name: "support", state: "running", model: "o4-mini" },
            { name: "billing", state: "idle", model: "gpt-5.4-mini" },
            { name: "research", state: "idle", model: null },
        ]);
    });

    it("has no agents when none was seen", () => {
        expect(agentsOf([])).toEqual([]);
    });
});

describe("guardRows", () => {
    it("lists the known guards in a fixed order and others after them, most first", () => {
        const rows = guardRows([
            { guard: "budget", count: 40 },
            { guard: "limit", count: 30 },
            { guard: "signature", count: 9 },
            { guard: "action", count: 8 },
            { guard: "quota", count: 7 },
            { guard: "permission", count: 6 },
            { guard: "approval", count: 5 },
            { guard: "egress", count: 4 },
            { guard: "source", count: 1 },
        ]);

        expect(rows.map((row) => `${row.type} ${row.count}`)).toEqual([
            "source 1",
            "action 8",
            "egress 4",
            "limit 30",
            "approval 5",
            "permission 6",
            "signature 9",
            "budget 40",
            "quota 7",
        ]);
    });

    it("has no rows when no guard decided anything", () => {
        expect(guardRows([])).toEqual([]);
    });
});
