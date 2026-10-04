// @vitest-environment node
import { describe, expect, it } from "vitest";
import { CHANNELS, type Notice } from "@quard/db";
import { toChange } from "./change";

const P = "11111111-1111-1111-1111-111111111111";
const OTHER = "22222222-2222-2222-2222-222222222222";
const RUN = "a".repeat(32);

const live = (body: unknown): Notice => ({ channel: CHANNELS.live, payload: JSON.stringify(body) });

describe("toChange", () => {
    it("passes runs changes for the project, with run ids when listed", () => {
        expect(toChange(live({ project: P, topic: "runs", runs: [RUN] }), P)).toEqual({ topic: "runs", runs: [RUN] });
        expect(toChange(live({ project: P, topic: "runs" }), P)).toEqual({ topic: "runs" });
    });

    it("drops run ids that are not a list of strings", () => {
        expect(toChange(live({ project: P, topic: "runs", runs: [1] }), P)).toEqual({ topic: "runs" });
        expect(toChange(live({ project: P, topic: "runs", runs: RUN }), P)).toEqual({ topic: "runs" });
    });

    it("passes approvals changes for the project", () => {
        expect(toChange(live({ project: P, topic: "approvals" }), P)).toEqual({ topic: "approvals" });
    });

    it("ignores another project, unknown topics and bad JSON", () => {
        expect(toChange(live({ project: OTHER, topic: "runs" }), P)).toBeNull();
        expect(toChange(live({ project: P, topic: "keys" }), P)).toBeNull();
        expect(toChange(live(null), P)).toBeNull();
        expect(toChange(live("runs"), P)).toBeNull();
        expect(toChange({ channel: CHANNELS.live, payload: "{nope" }, P)).toBeNull();
    });

    it("passes every decided approval", () => {
        expect(toChange({ channel: CHANNELS.approvals, payload: "req-1" }, P)).toEqual({ topic: "approvals" });
        expect(toChange({ channel: CHANNELS.approvals, payload: "req-1" }, undefined)).toEqual({ topic: "approvals" });
    });

    it("passes fleet changes only for the project", () => {
        expect(toChange({ channel: CHANNELS.fleet, payload: P }, P)).toEqual({ topic: "fleet" });
        expect(toChange({ channel: CHANNELS.fleet, payload: OTHER }, P)).toBeNull();
    });

    it("ignores key changes", () => {
        expect(toChange({ channel: CHANNELS.keys, payload: "key-1" }, P)).toBeNull();
    });

    it("passes any project's change before a project exists", () => {
        expect(toChange(live({ project: OTHER, topic: "runs" }), undefined)).toEqual({ topic: "runs" });
        expect(toChange({ channel: CHANNELS.fleet, payload: OTHER }, undefined)).toEqual({ topic: "fleet" });
    });
});
