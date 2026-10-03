import { describe, expect, it } from "vitest";
import * as shared from "./index.ts";

describe("@quard/shared", () => {
    it("exports its public functions", () => {
        expect(Object.keys(shared).sort()).toEqual(["isRunId", "isStepId", "newRunId", "newStepId", "readPort"]);
    });
});
