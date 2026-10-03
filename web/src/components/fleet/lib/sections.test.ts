// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
    BY_GUARD,
    LIMITS,
    LINKS,
    QUARANTINE,
    SOURCES,
    TOOLS,
    WATCHING,
    emptyFleet,
    fullFleet,
} from "../../../../test/summary/fleet";
import {
    hasAgentLinks,
    hasBlocks,
    hasIncidents,
    hasLimitHits,
    hasQuarantine,
    isEmptyFleet,
    limitCount,
} from "./sections";

describe("limitCount", () => {
    it("counts runs an observe-mode limit would stop and runs a block-mode limit stopped", () => {
        const loops = { name: "loops", limit: 5, unit: "handoffs", mode: "observe", wouldStop: 3, stopped: 1 } as const;

        expect(limitCount(loops)).toBe(3);
        expect(limitCount({ ...loops, mode: "block" })).toBe(1);
    });
});

describe("section checks", () => {
    it("find nothing in a new project", () => {
        const fleet = emptyFleet();

        expect(hasIncidents(fleet)).toBe(false);
        expect(hasBlocks(fleet.blocksByGuard)).toBe(false);
        expect(hasAgentLinks(fleet)).toBe(false);
        expect(hasLimitHits(fleet.runLimits)).toBe(false);
        expect(hasQuarantine(fleet)).toBe(false);
        expect(isEmptyFleet(fleet)).toBe(true);
    });

    it("count incidents from either list, but not a count of 0", () => {
        expect(hasIncidents({ incidentsBySource: SOURCES, incidentsByTool: [] })).toBe(true);
        expect(hasIncidents({ incidentsBySource: [], incidentsByTool: TOOLS })).toBe(true);
        expect(hasIncidents({ incidentsBySource: [{ ...SOURCES[0], count: 0 }], incidentsByTool: [] })).toBe(false);
    });

    it("need a block on some day", () => {
        expect(hasBlocks(BY_GUARD)).toBe(true);
    });

    it("count a link, or an agent that was an entry or turning point", () => {
        expect(hasAgentLinks({ agentPoints: [], untrustedLinks: LINKS })).toBe(true);
        expect(hasAgentLinks({ agentPoints: [{ agent: "billing", entry: 0, turning: 1 }], untrustedLinks: [] })).toBe(
            true,
        );
        expect(hasAgentLinks({ agentPoints: [{ agent: "planner", entry: 0, turning: 0 }], untrustedLinks: [] })).toBe(
            false,
        );
    });

    it("need a run over some limit", () => {
        expect(hasLimitHits(LIMITS)).toBe(true);
        expect(hasLimitHits(LIMITS.map((limit) => ({ ...limit, wouldStop: 0, stopped: 0 })))).toBe(false);
    });

    it("count quarantined or watched values", () => {
        expect(hasQuarantine({ quarantine: QUARANTINE, watching: [] })).toBe(true);
        expect(hasQuarantine({ quarantine: [], watching: WATCHING })).toBe(true);
    });

    it("call the summary empty only when every section is", () => {
        expect(isEmptyFleet(fullFleet())).toBe(false);
        expect(isEmptyFleet(emptyFleet({ untrustedLinks: LINKS }))).toBe(false);
        expect(isEmptyFleet(emptyFleet({ watching: WATCHING }))).toBe(false);
    });
});
