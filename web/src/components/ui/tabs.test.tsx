import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Tab, TabCount, TabList, TabPanel, Tabs } from "./tabs";

function renderTabs() {
    render(
        <Tabs defaultValue="runs">
            <TabList aria-label="Agent" className="extra-list">
                <Tab value="runs">Runs</Tab>
                <Tab value="tools" size="sm">
                    Tools <TabCount value={3} />
                </Tab>
            </TabList>
            <TabPanel value="runs">Recent runs</TabPanel>
            <TabPanel value="tools" className="extra-panel">
                Allowed tools
            </TabPanel>
        </Tabs>,
    );
}

describe("Tabs", () => {
    it("shows the selected tab's panel", () => {
        renderTabs();
        expect(screen.getByRole("tablist", { name: "Agent" }).className).toContain("extra-list");
        const runs = screen.getByRole("tab", { name: "Runs" });
        expect(runs.getAttribute("aria-selected")).toBe("true");
        expect(runs.className).toContain("min-h-[37px]");
        expect(screen.getByRole("tabpanel").textContent).toBe("Recent runs");
    });

    it("switches the panel when another tab is clicked", () => {
        renderTabs();
        const tools = screen.getByRole("tab", { name: "Tools 3" });
        expect(tools.className).toContain("h-8");
        fireEvent.click(tools);
        expect(tools.getAttribute("aria-selected")).toBe("true");
        const panel = screen.getByRole("tabpanel");
        expect(panel.textContent).toBe("Allowed tools");
        expect(panel.className).toContain("extra-panel");
    });
});
