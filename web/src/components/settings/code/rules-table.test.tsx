import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { RuleRow } from "@/lib/data/settings";
import { RULES } from "../../../../test/settings/rules";
import { guardWord, RulesTable } from "./rules-table";

const RULE = RULES[0] as RuleRow;

function cells(name: string): string[] {
    const row = screen.getByText(name).closest("tr") as HTMLElement;
    return within(row)
        .getAllByRole("cell")
        .map((cell) => cell.textContent ?? "");
}

describe("guardWord", () => {
    it("names each guard type in plain words", () => {
        expect(guardWord("egress")).toBe("Egress");
        expect(guardWord("permission")).toBe("Permission");
    });
});

describe("RulesTable", () => {
    it("labels the table and its columns", () => {
        render(<RulesTable rules={RULES} />);
        expect(screen.getByRole("table", { name: "Rules the connected SDKs reported, read-only" })).toBeTruthy();
        const headers = screen.getAllByRole("columnheader").map((cell) => cell.textContent);
        expect(headers).toEqual(["Rule", "Guard", "Mode", "Tools", "Apps", "Hash"]);
    });

    it("shows a blocking rule with its tools, apps and hash", () => {
        render(<RulesTable rules={RULES} />);
        expect(cells("refund-cap")).toEqual([
            "refund-capRefunds above 500 stop",
            "Limit",
            "Block",
            "refund, credit",
            "billing-service",
            "a1b2c3d4e5f6",
        ]);
    });

    it("marks a product default and shows observe mode", () => {
        render(<RulesTable rules={RULES} />);
        expect(cells("crm-reads").slice(0, 3)).toEqual([
            "crm-readsWatch CRM reads · product default",
            "Source",
            "Observe",
        ]);
    });

    it("says an approval always asks and covers the whole run with no apps", () => {
        render(<RulesTable rules={RULES} />);
        expect(cells("payout-approval").slice(1, 5)).toEqual(["Approval", "Always asks", "Whole run", "None"]);
        expect(screen.getByText("Whole run").getAttribute("title")).toBe("Whole run");
    });

    it("puts the summary in a tooltip on the rule name", () => {
        render(<RulesTable rules={RULES} />);
        const name = screen.getByText("payout-approval");
        expect(name.closest("[title]")?.getAttribute("title")).toBe("Payouts always ask");
    });

    it("shows just the name of a rule that came without a summary", () => {
        render(<RulesTable rules={[{ ...RULE, summary: "" }]} />);
        const row = screen.getByText("refund-cap").closest("tr") as HTMLElement;
        expect(row.querySelector("small")).toBeNull();
        expect(screen.getByText("refund-cap").closest("[title]")).toBeNull();
    });

    it("says a product default without a summary is one", () => {
        render(<RulesTable rules={[{ ...RULE, summary: "", source: "product default" }]} />);
        expect(cells("refund-cap")[0]).toBe("refund-capproduct default");
    });

    it("lists rules that share a name, such as one rule in two modes or in two rule sets", () => {
        const error = vi.spyOn(console, "error").mockImplementation(() => {});
        const rules = [RULE, { ...RULE, mode: "observe" as const }, { ...RULE, hash: "99aa88bb77cc66dd" }];
        render(<RulesTable rules={rules} />);
        expect(screen.getAllByText("refund-cap")).toHaveLength(3);
        expect(error).not.toHaveBeenCalled();
        error.mockRestore();
    });
});
