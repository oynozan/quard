import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { expectNoChartsOrTables } from "../../../test/empty";
import { EmptySection, LoadingSection } from "./section-states";

describe("EmptySection", () => {
    it("shows the section title over one short line and nothing else", () => {
        render(<EmptySection title="Run limits">No runs over a limit in the last 30 days</EmptySection>);
        const section = screen.getByRole("region", { name: "Run limits" });

        expect(within(section).getByRole("heading", { level: 2 }).textContent).toBe("Run limits");
        expect(within(section).getByRole("status").textContent).toBe("No runs over a limit in the last 30 days");
        expectNoChartsOrTables(section);
    });
});

describe("LoadingSection", () => {
    it("shows the section title over one small bar, busy and with no empty text", () => {
        render(<LoadingSection title="Quarantine" />);
        const section = screen.getByRole("region", { name: "Quarantine" });

        expect(section.getAttribute("aria-busy")).toBe("true");
        expect(within(section).getByRole("heading", { level: 2 }).textContent).toBe("Quarantine");
        expect(within(section).queryByRole("status")).toBeNull();
        expect(section.querySelectorAll(".skel")).toHaveLength(1);
        expect(within(section).queryByRole("table")).toBeNull();
    });
});
