// @vitest-environment node
import { describe, expect, it } from "vitest";
import { getIncident, listIncidents } from "./query";

describe("listIncidents and getIncident", () => {
    it("list no incidents while nothing stores them", async () => {
        expect(await listIncidents()).toEqual([]);
    });

    it("find no incident for any id", async () => {
        expect(await getIncident("inc_118")).toBeNull();
    });
});
