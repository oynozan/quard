import type { Metadata } from "next";
import { PageHeading } from "@/components/kit/headings";
import { AccountsPanel } from "@/components/settings/accounts/accounts-panel";
import { CodePanel } from "@/components/settings/code/code-panel";
import { KeysPanel } from "@/components/settings/keys/keys-panel";
import { RetentionPanel } from "@/components/settings/retention/retention-panel";
import { SettingsTabs } from "@/components/settings/settings-tabs";
import { pickTab, SETTINGS_CONTAINER } from "@/components/settings/tabs";
import { requestTime } from "@/lib/data/scope";
import { getSettings } from "@/lib/data/settings";
import { createKey, revokeKey } from "./actions";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage({ searchParams }: PageProps<"/settings">) {
    const [data, params, now] = await Promise.all([getSettings(), searchParams, requestTime()]);
    const activeKeys = data.keys.filter((key) => key.revokedAt === null).length;

    return (
        <div className={SETTINGS_CONTAINER}>
            <PageHeading title="Settings" />
            <div className="reveal">
                <SettingsTabs
                    initial={pickTab(params.tab)}
                    counts={{ keys: activeKeys, code: data.rules.length }}
                    panels={{
                        keys: (
                            <KeysPanel keys={data.keys} now={now} createAction={createKey} revokeAction={revokeKey} />
                        ),
                        accounts: <AccountsPanel />,
                        retention: <RetentionPanel retention={data.retention} />,
                        code: <CodePanel rules={data.rules} origins={data.origins} sdks={data.sdks} now={now} />,
                    }}
                />
            </div>
        </div>
    );
}
