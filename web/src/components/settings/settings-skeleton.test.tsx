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
        expect(labels?.textContent).toBe("Agent keysAccountsRetentionRules from code");
    });

    it("shows the agent key table headers over loading rows with a selection slot", () => {
        const { container } = render(<SettingsSkeleton />);
        const headers = screen.getAllByRole("columnheader").map((cell) => cell.textContent);
        expect(headers).toEqual(["Key", "Created", "Last used", "Status", ""]);
        // The selection slot plus five columns, matching the header's merged first cell
        const [, firstLoading] = screen.getAllByRole("row");
        expect(firstLoading.querySelectorAll("td")).toHaveLength(6);
        expect(container.querySelectorAll("col")).toHaveLength(6);
    });
});
