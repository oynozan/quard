import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { stubBrowser } from "../../../test/fleet-shell/env";
import { shadersModule, stopPageLoads } from "../../../test/fleet-shell/shell";
import { AppShell } from "./app-shell";

const route = vi.hoisted(() => ({ pathname: "/approvals/42" }));
vi.mock("next/navigation", () => ({ usePathname: () => route.pathname }));
vi.mock("@paper-design/shaders", () => shadersModule);

function show() {
    render(
        <AppShell openApprovals={2} account={{ email: "dana@acme.com", role: "Admin" }}>
            <h1>Approvals page</h1>
        </AppShell>,
    );
}

function menuButton() {
    return screen.getByRole("button", { expanded: false, name: "Open navigation" });
}

function rail() {
    return screen.getByRole("complementary", { name: "Main navigation" });
}

function railOpen(): boolean {
    return rail().className.includes("max-[760px]:flex");
}

let restoreLoads = () => {};

beforeEach(() => {
    stubBrowser();
    restoreLoads = stopPageLoads();
});
afterEach(() => {
    restoreLoads();
    vi.unstubAllGlobals();
    route.pathname = "/approvals/42";
});

describe("AppShell", () => {
    it("puts the page in the main region behind a skip link", () => {
        show();
        expect(screen.getByRole("link", { name: "Skip to content" }).getAttribute("href")).toBe("#content");
        const main = screen.getByRole("main");
        expect(main.id).toBe("content");
        expect(main.textContent).toBe("Approvals page");
        expect(screen.getByRole("link", { name: "Review 2 approvals" })).toBeTruthy();
    });

    it("names the current page in the mobile top bar", () => {
        show();
        expect(menuButton().parentElement?.textContent).toBe("Approvals");
    });

    it("opens the rail from the menu button and closes it with the same button", () => {
        show();
        expect(railOpen()).toBe(false);
        fireEvent.click(menuButton());
        expect(railOpen()).toBe(true);
        const close = screen.getByRole("button", { expanded: true, name: "Close navigation" });
        fireEvent.click(close);
        expect(railOpen()).toBe(false);
    });

    it("closes the open rail from the backdrop", () => {
        show();
        fireEvent.click(menuButton());
        const backdrop = screen
            .getAllByRole("button", { name: "Close navigation" })
            .find((button) => !button.hasAttribute("aria-expanded"));
        fireEvent.click(backdrop as HTMLElement);
        expect(railOpen()).toBe(false);
        expect(screen.getAllByRole("button", { name: /navigation/ })).toHaveLength(1);
    });

    it("closes the open rail on Escape and ignores other keys", () => {
        show();
        fireEvent.click(menuButton());
        fireEvent.keyDown(document, { key: "Enter" });
        expect(railOpen()).toBe(true);
        fireEvent.keyDown(document, { key: "Escape" });
        expect(railOpen()).toBe(false);
        expect(menuButton().getAttribute("aria-expanded")).toBe("false");
    });

    it("closes the open rail when a link in it is followed", () => {
        show();
        fireEvent.click(menuButton());
        fireEvent.click(screen.getByRole("link", { name: "Runs" }));
        expect(railOpen()).toBe(false);
    });

    it("closes the open rail when the approvals button is followed", () => {
        show();
        fireEvent.click(menuButton());
        fireEvent.click(screen.getByRole("link", { name: "Review 2 approvals" }));
        expect(menuButton().getAttribute("aria-expanded")).toBe("false");
    });

    it("closes the open rail when the signed-in person row is followed", () => {
        show();
        fireEvent.click(menuButton());
        fireEvent.click(screen.getByText("dana@acme.com"));
        expect(menuButton().getAttribute("aria-expanded")).toBe("false");
    });
});
