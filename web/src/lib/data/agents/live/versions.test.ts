// @vitest-environment node
import type { AgentVersionItem } from "@quard/db";
import { describe, expect, it } from "vitest";
import { DAY, NOW } from "../../../../../test/time";
import { versionsOf } from "./versions";

function item(
    version: string,
    daysAgo: number,
    instructionsHash: string | null = "c452794b8ad8444b",
): AgentVersionItem {
    return {
        version,
        model: "gpt-5.4",
        tools: ["payInvoice"],
        instructionsHash,
        firstSeenAt: new Date(NOW - daysAgo * DAY),
    };
}

describe("versionsOf", () => {
    it("marks the newest version current, and ends each older one when the next one appeared", () => {
        const rows = versionsOf([item("v3", 1, null), item("v2", 5), item("v1", 9)]);

        expect(rows.map(({ version, since, until, current }) => ({ version, since, until, current }))).toEqual([
            { version: "v3", since: NOW - DAY, until: null, current: true },
            { version: "v2", since: NOW - 5 * DAY, until: NOW - DAY, current: false },
            { version: "v1", since: NOW - 9 * DAY, until: NOW - 5 * DAY, current: false },
        ]);
    });

    it("keeps the model, tools and instructions hash, with no note or incidents", () => {
        expect(versionsOf([item("v1", 9, null)])).toEqual([
            {
                version: "v1",
                model: "gpt-5.4",
                instructionsHash: null,
                tools: ["payInvoice"],
                since: NOW - 9 * DAY,
                until: null,
                note: "",
                current: true,
                incidents: [],
            },
        ]);
    });
});
