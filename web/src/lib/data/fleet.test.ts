// @vitest-environment node
import { describe, expect, it } from "vitest";
import * as fleet from "./fleet";
import { getQuarantine } from "./fleet/quarantine";
import { getFleet } from "./fleet/query";

describe("fleet data", () => {
    it("exposes the fleet view's queries", () => {
        expect(fleet.getFleet).toBe(getFleet);
        expect(fleet.getQuarantine).toBe(getQuarantine);
    });
});
