import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RUN_ID, makeRow } from "../../../../test/runs-detail-list/fixtures";
import { RunHeading } from "./run-heading";

describe("RunHeading", () => {
    it("shows the breadcrumb, the short id as the title and the run status", () => {
        render(<RunHeading run={makeRow()} open={false} showApproval />);
        const crumbs = screen.getByRole("navigation", { name: "Breadcrumb" });
        expect(within(crumbs).getByRole("link", { name: "Runs" }).getAttribute("href")).toBe("/runs");
        expect(crumbs.querySelector("[aria-current=page]")?.textContent).toBe("abcdef01");
        expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Run abcdef01");
        expect(screen.getByText("Completed")).toBeTruthy();
    });

    it("shows the full id to copy, the start time in UTC and how long a finished run took", () => {
        const { container } = render(<RunHeading run={makeRow()} open={false} showApproval />);
        expect(screen.getByRole("button", { name: "Copy run id" }).textContent).toBe(RUN_ID);
        expect(container.textContent).toContain("Started 3 October 2026 at 12:00 UTC");
        expect(container.textContent).toContain("Took 1 min 15 s");
    });

    it("says how long an open run has been running", () => {
        const { container } = render(<RunHeading run={makeRow({ status: "running" })} open showApproval />);
        expect(container.textContent).toContain("Running for 1 min 15 s");
    });

    it("links to the run's approval and incident", () => {
        render(<RunHeading run={makeRow({ approvalId: "ap-7", incidentId: "inc-3" })} open={false} showApproval />);
        expect(screen.getByRole("link", { name: "Open approval" }).getAttribute("href")).toBe("/approvals#ap-7");
        expect(screen.getByRole("link", { name: "Open incident" }).getAttribute("href")).toBe("/incidents/inc-3");
    });

    it("hides the approval link when asked to, keeping the incident link", () => {
        render(
            <RunHeading run={makeRow({ approvalId: "ap-7", incidentId: "inc-3" })} open={false} showApproval={false} />,
        );
        expect(screen.queryByRole("link", { name: "Open approval" })).toBeNull();
        expect(screen.getByRole("link", { name: "Open incident" })).toBeTruthy();
    });

    it("shows only the approval link when there is no incident", () => {
        render(<RunHeading run={makeRow({ approvalId: "ap-7" })} open={false} showApproval />);
        expect(screen.getByRole("link", { name: "Open approval" })).toBeTruthy();
        expect(screen.queryByRole("link", { name: "Open incident" })).toBeNull();
    });

    it("shows no action links when nothing points at the run", () => {
        render(<RunHeading run={makeRow()} open={false} showApproval />);
        expect(screen.getAllByRole("link").map((link) => link.textContent)).toEqual(["Runs"]);
    });
});
