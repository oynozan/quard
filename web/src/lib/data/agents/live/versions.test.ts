// @vitest-environment node
import type { AgentVersionItem } from "@quard/db";
import { describe, expect, it } from "vitest";
import { DAY, NOW } from "../../../../../test/time";
import { versionsOf } from "./versions";

function item(version: string, daysAgo: number, extra: Partial<AgentVersionItem> = {}): AgentVersionItem {
    return {
        version,
        model: "gpt-5.4",
        tools: ["payInvoice"],
        instructionsHash: "c452794b8ad8444b",
        firstSeenAt: new Date(NOW - daysAgo * DAY),
        ...extra,
    };
}

describe("versionsOf", () => {
    it("marks the newest version current, and ends each older one when the next one appeared", () => {
        const rows = versionsOf([item("v3", 1, { instructionsHash: null }), item("v2", 5), item("v1", 9)], 3);

        expect(rows.map(({ version, since, until, current }) => ({ version, since, until, current }))).toEqual([
            { version: "v3", since: NOW - DAY, until: null, current: true },
            { version: "v2", since: NOW - 5 * DAY, until: NOW - DAY, current: false },
            { version: "v1", since: NOW - 9 * DAY, until: NOW - 5 * DAY, current: false },
        ]);
    });

    it("gives each version the tools of the one before it, and none to the first", () => {
        const rows = versionsOf(
            [item("v3", 1, { tools: [] }), item("v2", 5, { tools: ["payInvoice", "fetchPage"] }), item("v1", 9)],
            3,
        );

        expect(rows.map((row) => row.toolsBefore)).toEqual([["payInvoice", "fetchPage"], ["payInvoice"], null]);
    });

    it("lists up to the limit, and reads the version past it only for the tools before the last one", () => {
        const rows = versionsOf([item("v3", 1), item("v2", 5), item("v1", 9, { tools: ["fetchPage"] })], 2);

        expect(rows.map(({ version, until, toolsBefore }) => ({ version, until, toolsBefore }))).toEqual([
            { version: "v3", until: null, toolsBefore: ["payInvoice"] },
            { version: "v2", until: NOW - DAY, toolsBefore: ["fetchPage"] },
        ]);
    });

    it("keeps the model, tools and instructions hash, with no note or incidents", () => {
        expect(versionsOf([item("v1", 9, { instructionsHash: null })], 3)).toEqual([
            {
                version: "v1",
                model: "gpt-5.4",
                instructionsHash: null,
                tools: ["payInvoice"],
                toolsBefore: null,
                since: NOW - 9 * DAY,
                until: null,
                note: "",
                current: true,
                incidents: [],
            },
        ]);
    });
});
