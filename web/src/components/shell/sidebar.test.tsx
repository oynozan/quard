import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { stubBrowser } from "../../../test/fleet-shell/env";
import { shadersModule, stopPageLoads } from "../../../test/fleet-shell/shell";
import { PRIMARY_NAV } from "./nav-config";
import { Sidebar } from "./sidebar";

const route = vi.hoisted(() => ({ pathname: "/" }));
vi.mock("next/navigation", () => ({ usePathname: () => route.pathname }));
vi.mock("@paper-design/shaders", () => shadersModule);

const ACCOUNT = { email: "dana@acme.com", role: "Admin" };

function show(openApprovals = 0, onNavigate?: () => void) {
    render(<Sidebar openApprovals={openApprovals} account={ACCOUNT} onNavigate={onNavigate} />);
}

function mainLinks() {
    return within(screen.getByRole("navigation", { name: "Main" })).getAllByRole("link");
}

let restoreLoads = () => {};

beforeEach(() => {
    stubBrowser();
    restoreLoads = stopPageLoads();
});
afterEach(() => {
    restoreLoads();
    vi.unstubAllGlobals();
    route.pathname = "/";
});

describe("Sidebar", () => {
    it("links the wordmark home and lists every main page in order", () => {
        show();
        expect(screen.getByRole("link", { name: "Quard overview" }).getAttribute("href")).toBe("/");
        expect(mainLinks().map((link) => link.getAttribute("href"))).toEqual(PRIMARY_NAV.map((item) => item.href));
        expect(mainLinks().map((link) => link.textContent)).toEqual(PRIMARY_NAV.map((item) => item.label));
    });

    it("marks only the section of the current page", () => {
        route.pathname = "/runs/abc123";
        show();
        const current = mainLinks().filter((link) => link.getAttribute("aria-current") === "page");
        expect(current.map((link) => link.textContent)).toEqual(["Runs"]);
    });

    it("shows the open approvals count on the nav item and the main button", () => {
        show(3);
        expect(screen.getByRole("link", { name: "Approvals3" })).toBeTruthy();
        const button = screen.getByRole("link", { name: "Review 3 approvals" });
        expect(button.getAttribute("href")).toBe("/approvals");
    });

    it("says approval in the singular when exactly one is waiting", () => {
        show(1);
        expect(screen.getByRole("link", { name: "Review 1 approval" })).toBeTruthy();
    });

    it("drops the count and asks to open approvals when none are waiting", () => {
        show(0);
        expect(screen.getByRole("link", { name: "Approvals" })).toBeTruthy();
        expect(screen.getByRole("link", { name: "Open approvals" })).toBeTruthy();
    });

    it("links the workspace settings and the signed-in person", () => {
        route.pathname = "/settings";
        show();
        const workspace = within(screen.getByRole("navigation", { name: "Workspace" })).getByRole("link");
        expect(workspace.textContent).toBe("Settings");
        expect(workspace.getAttribute("aria-current")).toBe("page");

        expect(screen.queryByText("acme-prod")).toBeNull();
        expect(screen.getByText("dana@acme.com").closest("a")?.textContent).toBe("dana@acme.comAdmin");
        expect(screen.getByRole("button", { name: "Sign out" })).toBeTruthy();
    });

    it("tells the caller when a link is followed, so the mobile menu can close", () => {
        const onNavigate = vi.fn();
        show(0, onNavigate);
        fireEvent.click(screen.getByRole("link", { name: "Agents" }));
        fireEvent.click(screen.getByRole("link", { name: "Quard overview" }));
        fireEvent.click(screen.getByRole("link", { name: "Settings" }));
        fireEvent.click(screen.getByRole("link", { name: "Open approvals" }));
        fireEvent.click(screen.getByText("dana@acme.com"));
        expect(onNavigate).toHaveBeenCalledTimes(5);
    });
});
