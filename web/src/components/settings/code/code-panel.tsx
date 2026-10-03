import { GitPullRequest } from "lucide-react";
import { Notice } from "@/components/kit/feedback/feedback";
import { SectionHeading } from "@/components/kit/headings";
import type { SettingsData } from "@/lib/data/settings";
import { PanelIntro } from "../shared/panel-intro";
import { CodeExample } from "./code-example";
import { OriginsTable } from "./origins-table";
import { RulesBrowser } from "./rules-browser";
import { SdkTable } from "./sdk-table";

type CodePanelProps = Pick<SettingsData, "rules" | "origins" | "sdks"> & { now: number };

const EXAMPLE = `const payInvoice = guard(rawPayInvoice, {
    type: "limit",
    name: "payInvoice",
    maxAmountPerRun: { field: "amount", max: 50000 },
    mode: "observe",
});`;

// Read-only, since the code sets all of this and the SDKs only report it
export function CodePanel({ rules, origins, sdks, now }: CodePanelProps) {
    return (
        <div className="min-w-0">
            <PanelIntro>Read-only. Set in code and reported by the SDK.</PanelIntro>

            <div className="grid min-w-0 grid-cols-1 gap-10 max-[760px]:gap-8">
                <section aria-label="Connected apps">
                    <SectionHeading title="Connected apps" count={sdks.length} />
                    <SdkTable sdks={sdks} now={now} />
                </section>

                <RulesBrowser rules={rules} />

                <section aria-label="Origin overrides">
                    <SectionHeading title="Origin overrides" count={origins.length} />
                    <OriginsTable origins={origins} now={now} />
                </section>

                <Notice icon={<GitPullRequest size={18} strokeWidth={0.75} />} className="mt-0">
                    <p>To change a rule, edit the code and redeploy.</p>
                    <CodeExample code={EXAMPLE} />
                </Notice>
            </div>
        </div>
    );
}
