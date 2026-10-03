import { PAGE_LIST } from "@/components/kit/page";

export type SettingsTab = "keys" | "accounts" | "retention" | "code";

export const SETTINGS_TABS: { value: SettingsTab; label: string }[] = [
    { value: "keys", label: "Agent keys" },
    { value: "accounts", label: "Accounts and roles" },
    { value: "retention", label: "Retention" },
    { value: "code", label: "Rules from code" },
];

// Unknown or missing values fall back to the first tab
export function pickTab(value: string | string[] | undefined): SettingsTab {
    const raw = Array.isArray(value) ? value[0] : value;
    return SETTINGS_TABS.find((tab) => tab.value === raw)?.value ?? "keys";
}

// The list-page container, shared by the page, its loading and its error state
export const SETTINGS_CONTAINER = PAGE_LIST;
