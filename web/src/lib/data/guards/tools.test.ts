// @vitest-environment node
import { describe, expect, it } from "vitest";
import { FLEET_CHECK, isGuarded, toolSpec, TOOLS } from "./tools";

describe("toolSpec", () => {
    it("gives a tool's apps and rules", () => {
        const spec = toolSpec("pay_invoice");
        expect(spec.apps).toEqual(["billing-service"]);
        expect(spec.guards.map((guard) => guard.rule)).toEqual([
            "pay_invoice.daily-cap",
            "fleet-check",
            "pay_invoice.iban-source",
            "pay_invoice",
        ]);
        expect(spec.hosted).toBe(false);
    });

    it("marks hosted web search as hosted", () => {
        expect(toolSpec("web_search").hosted).toBe(true);
    });

    it("gives an empty spec for a tool no app reports", () => {
        expect(toolSpec("teleport")).toEqual({ name: "teleport", apps: [], guards: [], hosted: false });
    });

    it("lets rules default to the team as their source", () => {
        expect(toolSpec("fetch_page").guards[0].source).toBe("team");
        expect(FLEET_CHECK.source).toBe("product default");
    });

    it("lists every tool once", () => {
        const names = TOOLS.map((spec) => spec.name);
        expect(new Set(names).size).toBe(names.length);
    });
});

describe("isGuarded", () => {
    it("is true only for tools wrapped with at least one rule", () => {
        expect(isGuarded("send_email")).toBe(true);
        expect(isGuarded("export_contacts")).toBe(false);
        expect(isGuarded("teleport")).toBe(false);
    });
});
