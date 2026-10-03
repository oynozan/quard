// @vitest-environment node
import { describe, expect, it } from "vitest";
import * as incidents from "./incidents";
import { fisherOneSided } from "./incidents/fisher";
import { allIncidents, recentIncidents } from "./incidents/list";
import { getIncident, listIncidents } from "./incidents/query";

describe("incidents module", () => {
    it("passes on the list, query and replay test functions unchanged", () => {
        expect(incidents.recentIncidents).toBe(recentIncidents);
        expect(incidents.allIncidents).toBe(allIncidents);
        expect(incidents.listIncidents).toBe(listIncidents);
        expect(incidents.getIncident).toBe(getIncident);
        expect(incidents.fisherOneSided).toBe(fisherOneSided);
    });
});
