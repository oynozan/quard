import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { getSettings } from "@/lib/data/settings";
import { NOW } from "@/lib/data/rng";
import { RULES } from "../../../../test/settings/rules";
import { CodePanel } from "./code-panel";

const { origins, sdks } = await getSettings();

describe("CodePanel", () => {
    it("says the panel is read-only", () => {
        render(<CodePanel rules={RULES} origins={origins} sdks={sdks} now={NOW} />);
        expect(screen.getByText("Read-only. Reported by each SDK when it connects.")).toBeTruthy();
    });

    it("shows connected apps, rules and origin overrides with their counts", () => {
        render(<CodePanel rules={RULES} origins={origins} sdks={sdks} now={NOW} />);
        const apps = screen.getByRole("region", { name: "Connected apps" });
        expect(within(apps).getByRole("heading", { level: 2 }).textContent).toBe("Connected apps4");
        const rules = screen.getByRole("region", { name: "Rules" });
        expect(within(rules).getByRole("heading", { level: 2 }).textContent).toBe("Rules3");
        const overrides = screen.getByRole("region", { name: "Origin overrides" });
        expect(within(overrides).getByRole("heading", { level: 2 }).textContent).toBe("Origin overrides2");
    });

    it("explains how to change a rule with a guard sample in observe mode", () => {
        const { container } = render(<CodePanel rules={[]} origins={[]} sdks={[]} now={NOW} />);
        expect(screen.getByText("To change a rule, edit the code and redeploy.")).toBeTruthy();
        fireEvent.click(screen.getByRole("button", { name: "Show example" }));
        const sample = container.querySelector("pre")?.textContent ?? "";
        expect(sample).toContain("guard(rawPayInvoice");
        expect(sample).toContain('mode: "observe"');
    });
});
