// @vitest-environment node
import { describe, expect, it } from "vitest";
import * as fleet from "./fleet";
import { getFleet } from "./fleet/query";

describe("fleet data", () => {
    it("exposes the fleet view's query", () => {
        expect(fleet.getFleet).toBe(getFleet);
    });
});
