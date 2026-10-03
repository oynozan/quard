import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CountChip, PageHeading, SectionHeading, SubHeading } from "./headings";

describe("PageHeading", () => {
    it("shows the title and the page actions", () => {
        render(<PageHeading title="Runs" actions={<button type="button">Export</button>} />);
        expect(screen.getByRole("heading", { level: 1, name: "Runs" })).toBeTruthy();
        expect(screen.getByRole("button", { name: "Export" })).toBeTruthy();
    });

    it("leaves out the actions row when there are none", () => {
        const { container } = render(<PageHeading title="Runs" />);
        expect(container.firstElementChild?.children).toHaveLength(1);
    });
});

describe("SectionHeading", () => {
    it("shows a count and a link to view all", () => {
        render(<SectionHeading title="Incidents" count={4} href="/incidents" />);
        expect(screen.getByRole("heading", { level: 2 }).textContent).toBe("Incidents4");
        expect(screen.getByRole("link", { name: "View all" }).getAttribute("href")).toBe("/incidents");
    });

    it("prefers its own action over the link, and shows no count unless given one", () => {
        render(<SectionHeading title="Runs" href="/runs" action={<button type="button">Refresh</button>} />);
        expect(screen.getByRole("heading", { level: 2 }).textContent).toBe("Runs");
        expect(screen.getByRole("button", { name: "Refresh" })).toBeTruthy();
        expect(screen.queryByRole("link")).toBeNull();
    });

    it("shows only the title without a link or an action", () => {
        const { container } = render(<SectionHeading title="Runs" />);
        expect(container.firstElementChild?.children).toHaveLength(1);
    });
});

describe("CountChip", () => {
    it("shows the count, or a dash while it is unknown", () => {
        const { rerender, container } = render(<CountChip value={0} />);
        expect(container.textContent).toBe("0");
        rerender(<CountChip value={null} />);
        expect(container.textContent).toBe("—");
    });
});

describe("SubHeading", () => {
    it("labels a sub-table", () => {
        render(<SubHeading>Versions</SubHeading>);
        expect(screen.getByRole("heading", { level: 3, name: "Versions" })).toBeTruthy();
    });
});
