import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ORIGINS } from "../../../../test/settings/origins";
import { RULES } from "../../../../test/settings/rules";
import { SDKS } from "../../../../test/settings/sdks";
import { NOW } from "../../../../test/time";
import { CodePanel } from "./code-panel";

function region(name: string): HTMLElement {
    return screen.getByRole("region", { name });
}

function heading(name: string): string {
    return within(region(name)).getByRole("heading", { level: 2 }).textContent;
}

function headers(name: string): string[] {
    return within(region(name))
        .getAllByRole("columnheader")
        .map((cell) => cell.textContent);
}

describe("CodePanel", () => {
    it("keeps the intro, every section, its count and its table header when nothing was reported", () => {
        render(<CodePanel rules={[]} origins={[]} sdks={[]} now={NOW} />);
        expect(screen.getByText("Read-only. Set in code and reported by the SDK.")).toBeTruthy();
        expect(screen.getAllByRole("table")).toHaveLength(3);

        expect(heading("Connected apps")).toBe("Connected apps0");
        expect(headers("Connected apps")).toEqual([
            "App",
            "Agents",
            "SDK",
            "Agent key",
            "Rules hash",
            "Last seen",
            "State",
        ]);
        expect(within(region("Connected apps")).getByRole("status").textContent).toBe("No SDK connected yet");

        expect(heading("Rules")).toBe("Rules0");
        expect(headers("Rules")).toEqual(["Rule", "Guard", "Mode", "Tools", "Apps", "Hash"]);
        expect(within(region("Rules")).getByRole("heading", { level: 3, name: "No rules reported yet" })).toBeTruthy();

        expect(heading("Origin overrides")).toBe("Origin overrides0");
        expect(headers("Origin overrides")).toEqual(["Override", "Default", "Agents", "Last seen"]);
        expect(within(region("Origin overrides")).getByRole("status").textContent).toBe("No origin overrides yet");

        expect(screen.getByText("To change a rule, edit the code and redeploy.")).toBeTruthy();
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

    it("lists the origin overrides the runs reported, while the other sections stay empty", () => {
        render(<CodePanel rules={[]} origins={ORIGINS} sdks={[]} now={NOW} />);
        expect(heading("Origin overrides")).toBe("Origin overrides2");
        expect(within(region("Origin overrides")).getAllByRole("row")).toHaveLength(ORIGINS.length + 1);
        expect(within(region("Origin overrides")).queryByRole("status")).toBeNull();
        expect(within(region("Connected apps")).getByRole("status").textContent).toBe("No SDK connected yet");
    });

    it("counts connected apps, rules and origin overrides", () => {
        render(<CodePanel rules={RULES} origins={[]} sdks={SDKS} now={NOW} />);
        expect(heading("Connected apps")).toBe("Connected apps2");
        expect(heading("Rules")).toBe("Rules3");
        expect(heading("Origin overrides")).toBe("Origin overrides0");
        expect(within(region("Connected apps")).queryByRole("status")).toBeNull();
        expect(within(region("Origin overrides")).getByRole("status").textContent).toBe("No origin overrides yet");
    });
});
