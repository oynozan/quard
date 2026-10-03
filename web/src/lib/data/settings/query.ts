import { SDK_APPS } from "../guards/apps";
import { RUN_LIMITS } from "../guards/limits";
import { TOOLS } from "../guards/tools";
import { ORIGIN_OVERRIDES } from "../labels/origins";
import { NOW, DAY } from "../rng";
import { ACCOUNTS } from "../values/people";
import { agentKeys, keyPrefix, RETENTION } from "./fixtures";
import type { RuleRow, SettingsData } from "./types";

// Every rule the connected SDKs reported, once per rule name.
export function rulesFromCode(): RuleRow[] {
    const rows = new Map<string, RuleRow>();
    for (const tool of TOOLS) {
        for (const guard of tool.guards) {
            const row = rows.get(guard.rule);
            if (row) {
                row.tools = [...new Set([...row.tools, tool.name])];
                row.apps = [...new Set([...row.apps, ...tool.apps])];
                continue;
            }
            rows.set(guard.rule, {
                name: guard.rule,
                guard: guard.type,
                tools: [tool.name],
                apps: [...tool.apps],
                mode: guard.mode,
                hash: guard.hash,
                summary: guard.summary,
                source: guard.source,
            });
        }
    }
    rows.delete("run-limits");
    for (const limit of RUN_LIMITS) {
        rows.set(limit.rule, {
            name: limit.rule,
            guard: "limit",
            tools: limit.name === "steps" || limit.name === "cost" ? [] : ["delegate"],
            apps: SDK_APPS.map((app) => app.name),
            mode: limit.mode,
            hash: limit.hash,
            summary: `${limit.limit} ${limit.unit} per run`,
            source: limit.name === "loops" ? "team" : "product default",
        });
    }
    return [...rows.values()];
}

// Agent keys, accounts, retention, and the read-only origins and rules from code.
export async function getSettings(): Promise<SettingsData> {
    return {
        project: { id: "prj_acme_prod", name: "acme-prod" },
        keys: agentKeys(),
        accounts: ACCOUNTS,
        retention: RETENTION,
        origins: ORIGIN_OVERRIDES,
        rules: rulesFromCode(),
        sdks: SDK_APPS.map(({ keyId, ...app }) => ({ ...app, key: keyPrefix(keyId) })),
        hashKey: { algorithm: "HMAC-SHA-256", setAt: NOW - 52 * DAY, previousKeptUntil: null },
        detector: { name: "Jev", version: "jev-1.13.0", mode: "observe" },
    };
}
