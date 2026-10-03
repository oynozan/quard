import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RULES } from "../../../../test/settings/rules";
import { pickOption } from "../../../../test/settings/select";
import { RulesBrowser } from "./rules-browser";

function shownRules(): string[] {
    return screen
        .getAllByRole("row")
        .slice(1)
        .map((row) => row.querySelector("strong")?.textContent ?? "");
}

function search(text: string) {
    fireEvent.change(screen.getByRole("searchbox", { name: "Search rules" }), { target: { value: text } });
}

describe("RulesBrowser", () => {
    it("shows every rule with the full count and nothing read out", () => {
        render(<RulesBrowser rules={RULES} />);
        expect(screen.getByRole("heading", { level: 2 }).textContent).toBe("Rules3");
        expect(shownRules()).toEqual(["refund-cap", "crm-reads", "payout-approval"]);
        expect(screen.getByRole("status").textContent).toBe("");
    });

    it("finds rules by tool name, ignoring case and spaces around the query", () => {
        render(<RulesBrowser rules={RULES} />);
        search("  CRM.LOOKUP ");
        expect(shownRules()).toEqual(["crm-reads"]);
        expect(screen.getByRole("heading", { level: 2 }).textContent).toBe("Rules1");
        expect(screen.getByRole("status").textContent).toBe("1 of 3 rules shown");
    });

    it("finds rules by app and by hash", () => {
        render(<RulesBrowser rules={RULES} />);
        search("orchestrator-app");
        expect(shownRules()).toEqual(["crm-reads"]);
        search("77aa88");
        expect(shownRules()).toEqual(["payout-approval"]);
    });

    it("filters by guard type", async () => {
        render(<RulesBrowser rules={RULES} />);
        await pickOption("Guard type", "Limit");
        expect(shownRules()).toEqual(["refund-cap"]);
    });

    it("treats approval rules as the ones that always ask", async () => {
        render(<RulesBrowser rules={RULES} />);
        await pickOption("Mode", "Always asks");
        expect(shownRules()).toEqual(["payout-approval"]);
        await pickOption("Mode", "Observe");
        expect(shownRules()).toEqual(["crm-reads"]);
    });

    it("offers to clear the filters when nothing matches, and clearing shows every rule again", async () => {
        render(<RulesBrowser rules={RULES} />);
        await pickOption("Guard type", "Source");
        await pickOption("Mode", "Block");
        search("crm");
        expect(screen.getAllByRole("row")).toHaveLength(1);
        expect(screen.getByRole("heading", { level: 3, name: "No rules match" })).toBeTruthy();
        expect(screen.getByRole("status").textContent).toBe("0 of 3 rules shown");

        fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
        await act(async () => {});
        expect(shownRules()).toEqual(["refund-cap", "crm-reads", "payout-approval"]);
        expect((screen.getByRole("searchbox", { name: "Search rules" }) as HTMLInputElement).value).toBe("");
        expect(screen.getByRole("combobox", { name: "Guard type" }).textContent).toBe("All guards");
        expect(screen.getByRole("combobox", { name: "Mode" }).textContent).toBe("All modes");
        expect(screen.queryByText("No rules match")).toBeNull();
    });

    it("hides the search and filters when no rules were reported", () => {
        render(<RulesBrowser rules={[]} />);
        expect(screen.queryByRole("searchbox")).toBeNull();
        expect(screen.queryByRole("combobox")).toBeNull();
        expect(screen.getByRole("heading", { level: 3, name: "No rules reported" })).toBeTruthy();
        expect(screen.getByText("They appear when an SDK connects.")).toBeTruthy();
    });
});
