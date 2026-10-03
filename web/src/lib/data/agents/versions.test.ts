// @vitest-environment node
import { describe, expect, it } from "vitest";
import { DAY, HOUR, NOW } from "../rng";
import { AGENT_VERSIONS, versionAt, versionsOf } from "./versions";

describe("versionsOf", () => {
    it("lists an agent's versions newest first", () => {
        for (const versions of Object.values(AGENT_VERSIONS)) {
            const since = versions.map((version) => version.since);
            expect(since).toEqual([...since].sort((a, b) => b - a));
        }
        expect(versionsOf("orchestrator").map((version) => version.version)).toEqual(["v14", "v13", "v12"]);
    });

    it("gives an empty list for an agent it does not know", () => {
        expect(versionsOf("nobody")).toEqual([]);
    });
});

describe("versionAt", () => {
    it("gives the current version for now", () => {
        expect(versionAt("billing", NOW).version).toBe("v22");
    });

    it("gives the version that was live at an earlier time", () => {
        expect(versionAt("billing", NOW - 10 * DAY).version).toBe("v21");
        expect(versionAt("billing", NOW - 3 * DAY - 2 * HOUR).version).toBe("v22");
    });

    it("falls back to the oldest version before the first one started", () => {
        expect(versionAt("billing", NOW - 400 * DAY).version).toBe("v20");
    });

    it("makes up a bare first version for an agent it does not know", () => {
        expect(versionAt("nobody", NOW)).toEqual({
            version: "v1",
            model: "gpt-6.1-mini",
            instructionsHash: "000000000000",
            tools: [],
            since: 0,
            note: "",
        });
    });
});
