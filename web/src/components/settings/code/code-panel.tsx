import { GitPullRequest } from "lucide-react";
import type { ReactNode } from "react";
import { EmptyLine } from "@/components/kit/empty";
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

type SectionProps = { title: string; count: number; empty: string; children: ReactNode };

// A heading with its count, then the table, or one line when there is nothing to list
function Section({ title, count, empty, children }: SectionProps) {
    return (
        <section aria-label={title}>
            <SectionHeading title={title} count={count > 0 ? count : undefined} />
            {count > 0 ? children : <EmptyLine>{empty}</EmptyLine>}
        </section>
    );
}

function HowToChange({ className }: { className?: string }) {
    return (
        <Notice icon={<GitPullRequest size={18} strokeWidth={0.75} />} className={className}>
            <p>To change a rule, edit the code and redeploy.</p>
            <CodeExample code={EXAMPLE} />
        </Notice>
    );
}

// Read-only, since the code sets all of this and the SDKs only report it
export function CodePanel({ rules, origins, sdks, now }: CodePanelProps) {
    if (rules.length + origins.length + sdks.length === 0) {
        return (
            <div className="min-w-0">
                <EmptyLine>Nothing reported yet</EmptyLine>
                <HowToChange />
            </div>
        );
    }
    return (
        <div className="min-w-0">
            <PanelIntro>Read-only. Set in code and reported by the SDK.</PanelIntro>

            <div className="grid min-w-0 grid-cols-1 gap-10 max-[760px]:gap-8">
                <Section title="Connected apps" count={sdks.length} empty="No SDK connected yet">
                    <SdkTable sdks={sdks} now={now} />
                </Section>

                <RulesBrowser rules={rules} />

                <Section title="Origin overrides" count={origins.length} empty="No origin overrides yet">
                    <OriginsTable origins={origins} now={now} />
                </Section>

                <HowToChange className="mt-0" />
            </div>
        </div>
    );
}
