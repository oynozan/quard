import { DataTable, QuietEmpty, Td, Tr } from "@/components/kit/data-table";
import { LabelChip } from "@/components/kit/labels";
import type { OriginOverride } from "@/lib/data/settings";
import { Ago, Cols, FIRST_CELL, Head, Quiet } from "../shared/table-parts";

const WIDTHS = ["34%", "20%", "28%", "18%"];

// "untrusted · public" in the muted default, so the change stands out
function Mapping({ trust, sensitivity }: { trust: string; sensitivity: string }) {
    return (
        <span className="text-[12px] text-ink-muted">
            {trust} · {sensitivity}
        </span>
    );
}

// Origins whose default trust or sensitivity the code changed, as the runs reported them
export function OriginsTable({ origins, now }: { origins: OriginOverride[]; now: number }) {
    return (
        <>
            <DataTable minWidth={720} className="text-[14px]">
                <caption className="sr-only">
                    Origin overrides the runs reported, with the default each one replaces
                </caption>
                <Cols widths={WIDTHS} />
                <Head first="Override" rest={["Default", "Agents", "Last seen"]} />
                <tbody>
                    {origins.map((item) => (
                        <Tr key={item.origin}>
                            <Td colSpan={2} className={FIRST_CELL}>
                                <LabelChip
                                    label={{ origin: item.origin, trust: item.trust, sensitivity: item.sensitivity }}
                                />
                            </Td>
                            <Td>
                                <Mapping trust={item.defaultTrust} sensitivity={item.defaultSensitivity} />
                            </Td>
                            <Td>
                                <Quiet mono title={item.agents.join(", ")}>
                                    {item.agents.join(", ")}
                                </Quiet>
                            </Td>
                            <Td>
                                <Ago time={item.seenAt} now={now} />
                            </Td>
                        </Tr>
                    ))}
                </tbody>
            </DataTable>
            {origins.length === 0 ? <QuietEmpty>No origin overrides yet</QuietEmpty> : null}
        </>
    );
}
