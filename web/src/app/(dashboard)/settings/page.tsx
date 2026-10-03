import type { Metadata } from "next";
import { PageHeading } from "@/components/kit/headings";
import { AccountsPanel } from "@/components/settings/accounts/accounts-panel";
import { CodePanel } from "@/components/settings/code/code-panel";
import { KeysPanel } from "@/components/settings/keys/keys-panel";
import { RetentionPanel } from "@/components/settings/retention/retention-panel";
import { ProjectTag } from "@/components/settings/project-tag";
import { SettingsTabs } from "@/components/settings/settings-tabs";
import { pickTab, SETTINGS_CONTAINER } from "@/components/settings/tabs";
import { NOW } from "@/lib/data/rng";
import { SIGNED_IN } from "@/lib/data/session";
import { getSettings } from "@/lib/data/settings";

export const metadata: Metadata = { title: "Settings" };

const ME = SIGNED_IN.email;

export default async function SettingsPage({ searchParams }: PageProps<"/settings">) {
    const [data, params] = await Promise.all([getSettings(), searchParams]);
    const agents = [...new Set(data.sdks.flatMap((sdk) => sdk.agents))].sort();
    const activeKeys = data.keys.filter((key) => key.revokedAt === null).length;

    return (
        <div className={SETTINGS_CONTAINER}>
            <PageHeading title="Settings" actions={<ProjectTag id={data.project.id} name={data.project.name} />} />
            <div className="reveal">
                <SettingsTabs
                    initial={pickTab(params.tab)}
                    counts={{ keys: activeKeys, accounts: data.accounts.length, code: data.rules.length }}
                    panels={{
                        keys: <KeysPanel keys={data.keys} agents={agents} account={ME} now={NOW} />,
                        accounts: <AccountsPanel accounts={data.accounts} me={ME} now={NOW} />,
                        retention: (
                            <RetentionPanel
                                retention={data.retention}
                                hashKey={data.hashKey}
                                detector={data.detector}
                            />
                        ),
                        code: <CodePanel rules={data.rules} origins={data.origins} sdks={data.sdks} now={NOW} />,
                    }}
                />
            </div>
        </div>
    );
}
