import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { expectNoChartsOrTables } from "../../../../test/empty";
import { ORIGINS } from "../../../../test/settings/origins";
import { RULES } from "../../../../test/settings/rules";
import { SDKS } from "../../../../test/settings/sdks";
import { NOW } from "../../../../test/time";
import { CodePanel } from "./code-panel";

function heading(region: string): string {
    return within(screen.getByRole("region", { name: region })).getByRole("heading", { level: 2 }).textContent;
}

describe("CodePanel", () => {
    it("shows one line and how to change a rule when nothing was reported", () => {
        const { container } = render(<CodePanel rules={[]} origins={[]} sdks={[]} now={NOW} />);
        expect(screen.getByText("Nothing reported yet")).toBeTruthy();
        expect(screen.getByText("To change a rule, edit the code and redeploy.")).toBeTruthy();
        expect(screen.queryByRole("heading")).toBeNull();
        expect(screen.queryByText(/^Read-only/)).toBeNull();
        expectNoChartsOrTables(container);
    });

    it("explains how to change a rule with a guard sample the SDK accepts, in observe mode", () => {
        const { container } = render(<CodePanel rules={[]} origins={[]} sdks={[]} now={NOW} />);
        fireEvent.click(screen.getByRole("button", { name: "Show example" }));
        const sample = container.querySelector("pre")?.textContent ?? "";
        expect(sample).toContain("guard(rawPayInvoice");
        // guard() throws without a name, and limits are counted per run
        expect(sample).toContain('name: "payInvoice"');
        expect(sample).toContain('maxAmountPerRun: { field: "amount", max: 50000 }');
        expect(sample).toContain('mode: "observe"');
    });

    it("gives each empty section its heading and one line, with no count", () => {
        render(<CodePanel rules={[]} origins={ORIGINS} sdks={[]} now={NOW} />);
        expect(screen.getByText("Read-only. Set in code and reported by the SDK.")).toBeTruthy();
        expect(heading("Connected apps")).toBe("Connected apps");
        const apps = screen.getByRole("region", { name: "Connected apps" });
        expect(within(apps).getByText("No SDK connected yet")).toBeTruthy();
        expectNoChartsOrTables(apps);
        expect(heading("Rules")).toBe("Rules");
        expect(heading("Origin overrides")).toBe("Origin overrides2");
        expect(screen.getAllByRole("table")).toHaveLength(1);
        expect(screen.getByText("To change a rule, edit the code and redeploy.")).toBeTruthy();
    });

    it("counts connected apps, rules and origin overrides", () => {
        render(<CodePanel rules={RULES} origins={[]} sdks={SDKS} now={NOW} />);
        expect(heading("Connected apps")).toBe("Connected apps2");
        expect(heading("Rules")).toBe("Rules3");
        expect(heading("Origin overrides")).toBe("Origin overrides");
        const overrides = screen.getByRole("region", { name: "Origin overrides" });
        expect(within(overrides).getByText("No origin overrides yet")).toBeTruthy();
    });
});
