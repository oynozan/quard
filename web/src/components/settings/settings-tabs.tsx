"use client";

import type { ReactNode } from "react";
import { Tab, TabCount, TabList, TabPanel, Tabs } from "@/components/ui/tabs";
import { SETTINGS_TABS, type SettingsTab } from "./tabs";

type SettingsTabsProps = {
    initial: SettingsTab;
    // A count shows only when it is above 0
    counts: Partial<Record<SettingsTab, number>>;
    panels: Record<SettingsTab, ReactNode>;
};

// Switches panels and keeps the choice in the address so a reload or a shared link opens it
export function SettingsTabs({ initial, counts, panels }: SettingsTabsProps) {
    return (
        <Tabs
            defaultValue={initial}
            onValueChange={(value) => {
                const url = new URL(window.location.href);
                if (value === SETTINGS_TABS[0].value) url.searchParams.delete("tab");
                else url.searchParams.set("tab", String(value));
                window.history.replaceState(null, "", url);
            }}
        >
            <TabList aria-label="Settings sections">
                {SETTINGS_TABS.map((tab) => {
                    const count = counts[tab.value] ?? 0;
                    return (
                        <Tab key={tab.value} value={tab.value}>
                            {tab.label}
                            {count > 0 ? <TabCount value={count} /> : null}
                        </Tab>
                    );
                })}
            </TabList>
            {SETTINGS_TABS.map((tab) => (
                <TabPanel key={tab.value} value={tab.value} className="mt-[30px] max-[760px]:mt-[25px]">
                    {panels[tab.value]}
                </TabPanel>
            ))}
        </Tabs>
    );
}
