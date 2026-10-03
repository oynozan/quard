// @vitest-environment node
import { describe, expect, it } from "vitest";
import * as incidents from "./incidents";
import { getIncident, listIncidents } from "./incidents/query";

describe("incidents module", () => {
    it("passes on the list and detail queries unchanged", () => {
        expect(incidents.listIncidents).toBe(listIncidents);
        expect(incidents.getIncident).toBe(getIncident);
        expect(Object.keys(incidents).sort()).toEqual(["getIncident", "listIncidents"]);
    });
});
