import { DataTable, NameCell, Td, Tr } from "@/components/kit/data-table";
import { StatusValue } from "@/components/kit/detail/detail-list";
import { Badge } from "@/components/kit/labels";
import type { RuleRow } from "@/lib/data/settings";
import { Cols, FIRST_CELL, Head, Quiet } from "../shared/table-parts";

const WIDTHS = ["29%", "10%", "13%", "17%", "17%", "14%"];

const GUARD_WORD: Record<RuleRow["guard"], string> = {
    source: "Source",
    action: "Action",
    approval: "Approval",
    egress: "Egress",
    limit: "Limit",
    permission: "Permission",
};

export function guardWord(guard: RuleRow["guard"]): string {
    return GUARD_WORD[guard];
}

// Block enforces, observe records "would block", approval guards always ask
function Mode({ mode }: { mode: RuleRow["mode"] }) {
    if (mode === "block") return <StatusValue tone="on">Block</StatusValue>;
    if (mode === "observe") return <StatusValue tone="context">Observe</StatusValue>;
    return <StatusValue tone="off">Always asks</StatusValue>;
}

function listed(values: string[], none: string): string {
    return values.length > 0 ? values.join(", ") : none;
}

export function RulesTable({ rules }: { rules: RuleRow[] }) {
    return (
        <DataTable minWidth={940} className="text-[14px]">
            <caption className="sr-only">Rules the connected SDKs reported, read-only</caption>
            <Cols widths={WIDTHS} />
            <Head first="Rule" rest={["Guard", "Mode", "Tools", "Apps", "Hash"]} />
            <tbody>
                {rules.map((rule) => (
                    <Tr key={rule.name}>
                        <Td colSpan={2} className={FIRST_CELL}>
                            <span title={rule.summary} className="block min-w-0">
                                <NameCell
                                    mono
                                    name={rule.name}
                                    sub={
                                        <>
                                            {rule.summary}
                                            {rule.source === "product default" ? " · product default" : null}
                                        </>
                                    }
                                />
                            </span>
                        </Td>
                        <Td>
                            <Badge>{GUARD_WORD[rule.guard]}</Badge>
                        </Td>
                        <Td className="text-[12px] text-ink-2">
                            <Mode mode={rule.mode} />
                        </Td>
                        <Td>
                            <Quiet mono title={listed(rule.tools, "Whole run")}>
                                {listed(rule.tools, "Whole run")}
                            </Quiet>
                        </Td>
                        <Td>
                            <Quiet mono title={listed(rule.apps, "None")}>
                                {listed(rule.apps, "None")}
                            </Quiet>
                        </Td>
                        <Td className="mono text-[12px] text-ink-2">{rule.hash}</Td>
                    </Tr>
                ))}
            </tbody>
        </DataTable>
    );
}
