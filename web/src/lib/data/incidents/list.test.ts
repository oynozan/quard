// @vitest-environment node
import { describe, expect, it } from "vitest";
import { isRunId, NOW } from "../rng";
import { allIncidents, olderIncidents, recentIncidents } from "./list";

describe("incident lists", () => {
    it("lists recent incidents newest first, inside the last few days", () => {
        const recent = recentIncidents();
        expect(recent.map((item) => item.id)).toEqual(["inc_118", "inc_117", "inc_116", "inc_115", "inc_114"]);
        expect(recent[0].replay).toBe("running");
        expect(recent.every((item, i) => i === 0 || item.openedAt < recent[i - 1].openedAt)).toBe(true);
        expect(recent.every((item) => item.openedAt <= NOW)).toBe(true);
    });

    it("puts every incident together, recent ones before older ones", () => {
        const all = allIncidents();
        expect(all).toHaveLength(recentIncidents().length + olderIncidents().length);
        expect(all[0].id).toBe("inc_118");
        expect(all[all.length - 1].id).toBe("inc_105");
        expect(all.every((item, i) => i === 0 || item.openedAt < all[i - 1].openedAt)).toBe(true);
    });

    it("ties each incident to a run id in trace format", () => {
        expect(allIncidents().every((item) => isRunId(item.runId))).toBe(true);
    });
});
