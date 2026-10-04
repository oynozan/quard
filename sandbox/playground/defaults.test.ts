import { describe, expect, it } from "vitest";
import { scanText } from "../../packages/sdk/guards/source/scan.ts";
import { policySchema } from "../../packages/sdk/policy/schema.ts";
import { feedSchema } from "../../packages/sdk/signatures/schema.ts";
import { defaults } from "../test/folder.ts";
import { parseScenario, TOOL_NAMES } from "./scenario.ts";

describe("the default files", () => {
    it("are a valid scenario, policy and feed", () => {
        const scenario = parseScenario(JSON.stringify(defaults("scenario")));
        expect(scenario.tools).toEqual([...TOOL_NAMES]);
        expect(policySchema.parse(defaults("policy")).signatures).toEqual({ file: "signatures.json", mode: "block" });
        expect(feedSchema.parse(defaults("signatures")).signatures.length).toBeGreaterThanOrEqual(2);
    });

    it("hide instructions in the email that the built-in scan finds, and none in the page", () => {
        const scenario = defaults("scenario");
        expect(scanText(scenario.email)).toEqual(["instructions", "invisible_text"]);
        expect(scanText(scenario.page)).toEqual([]);
    });

    it("never ask a person, since nobody may be there to answer", () => {
        expect(JSON.stringify(defaults("policy"))).not.toMatch(/"ask"|"approval"/);
    });
});
