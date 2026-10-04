import { afterEach, describe, expect, it } from "vitest";
import { configure } from "../../core/config.ts";
import { rulesHash, rulesSnapshot } from "../../policy/rules.ts";
import { resetAll } from "../../test/reset.ts";
import { hostedOptions, webSearchRules } from "./rules.ts";

afterEach(() => {
    resetAll();
});

describe("hosted tool rules", () => {
    it("has no rules until code or the policy file sets some", () => {
        expect(hostedOptions("merge")).toEqual([]);
        expect(webSearchRules()).toEqual([]);
        expect(rulesHash()).toBeUndefined();
    });

    it("takes rules for hosted tools from code and lists them with the active rules", () => {
        configure({
            hostedTools: {
                merge: [{ type: "approval" }],
                web_search: [{ type: "source", origin: "web", allowDomains: ["acme.com"] }, { type: "limit" }],
            },
        });

        expect(webSearchRules()).toEqual([{ type: "source", origin: "web", allowDomains: ["acme.com"] }]);
        expect(rulesHash()).toMatch(/^[0-9a-f]{16}$/);
        expect(rulesSnapshot().list.filter((entry) => entry.tool !== "*")).toEqual([
            { tool: "merge", guard: "approval", rule: "approval", mode: "block" },
            { tool: "web_search", guard: "source", rule: "source", mode: "block" },
        ]);
    });

    it("refuses guard types a hosted tool can't use", () => {
        expect(() => configure({ hostedTools: { pay: [{ type: "x402" }] } })).toThrow(TypeError);
        expect(() => configure({ hostedTools: { pay: {} as never } })).toThrow(TypeError);
    });
});
