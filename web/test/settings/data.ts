import type { RetentionRow, SettingsData } from "@/lib/data/settings";
import { KEYS } from "./keys";
import { ORIGINS } from "./origins";
import { RULES } from "./rules";
import { SDKS } from "./sdks";

// The run window first, then fixed rules
export const RETENTION: RetentionRow[] = [
    { item: "Runs", keep: "30 days", days: 30 },
    { item: "Runs tied to an incident", keep: "1 year", days: 365 },
    { item: "Memory labels", keep: "Kept", days: null },
    { item: "Approval arguments", keep: "Until decided", days: null },
];

// What a new install reads before anyone made a key
export const NEW_INSTALL: SettingsData = {
    hasProject: false,
    keys: [],
    retention: [],
    origins: [],
    rules: [],
    sdks: [],
};

// A project with keys, origin overrides, and apps that reported their rules
export const IN_USE: SettingsData = {
    hasProject: true,
    keys: KEYS,
    retention: RETENTION,
    origins: ORIGINS,
    rules: RULES,
    sdks: SDKS,
};
