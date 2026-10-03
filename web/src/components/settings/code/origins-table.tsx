import { DataTable, QuietEmpty, Td, Tr } from "@/components/kit/data-table";
import { LabelChip } from "@/components/kit/labels";
import type { OriginOverride } from "@/lib/data/settings";
import { Cols, FIRST_CELL, Head, Quiet } from "../shared/table-parts";

const WIDTHS = ["26%", "16%", "26%", "14%", "18%"];

// "untrusted · public" in the muted default, so the change stands out
function Mapping({ trust, sensitivity }: { trust: string; sensitivity: string }) {
    return (
        <span className="text-[12px] text-ink-muted">
            {trust} · {sensitivity}
        </span>
    );
}

// Origins whose default trust or sensitivity was changed in code
export function OriginsTable({ origins }: { origins: OriginOverride[] }) {
    if (origins.length === 0) {
        return <QuietEmpty>No overrides</QuietEmpty>;
    }
    return (
        <DataTable minWidth={900} className="text-[14px]">
            <caption className="sr-only">Origin overrides set in code, with the default each one replaces</caption>
            <Cols widths={WIDTHS} />
            <Head first="Override" rest={["Default", "Why", "App", "Set in"]} />
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
                            <Quiet title={item.note}>{item.note}</Quiet>
                        </Td>
                        <Td>
                            <Quiet mono>{item.app}</Quiet>
                        </Td>
                        <Td>
                            <Quiet mono title={`${item.file}:${item.line}`}>
                                {item.file}:{item.line}
                            </Quiet>
                        </Td>
                    </Tr>
                ))}
            </tbody>
        </DataTable>
    );
}
