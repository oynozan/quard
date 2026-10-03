import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SettingsSkeleton } from "./settings-skeleton";

describe("SettingsSkeleton", () => {
    it("marks the frame busy and reads out that settings are loading", () => {
        const { container } = render(<SettingsSkeleton />);
        expect(container.firstElementChild?.getAttribute("aria-busy")).toBe("true");
        expect(screen.getByRole("status").textContent).toBe("Loading settings…");
    });

    it("shows the real tab labels, hidden from screen readers", () => {
        const { container } = render(<SettingsSkeleton />);
        const labels = container.querySelector("[aria-hidden]");
        expect(labels?.textContent).toBe("Agent keysAccounts and rolesRetentionRules from code");
    });

    it("shows the agent key table headers over loading rows with a selection slot", () => {
        render(<SettingsSkeleton />);
        const headers = screen.getAllByRole("columnheader").map((cell) => cell.textContent);
        expect(headers).toEqual(["Key", "Scope and agents", "Owner", "Created", "Last used", "Status", ""]);
        // The selection slot plus seven columns, matching the header's merged first cell
        const [, firstLoading] = screen.getAllByRole("row");
        expect(firstLoading.querySelectorAll("td")).toHaveLength(8);
    });
});
