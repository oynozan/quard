import { Boxes } from "lucide-react";
import { DataTable, NameCell, QuietEmpty, Td, Tr } from "@/components/kit/data-table";
import { StatusValue } from "@/components/kit/detail/detail-list";
import type { SdkConnection } from "@/lib/data/settings";
import { Ago, Cols, FIRST_CELL, Head, Quiet } from "../shared/table-parts";

const WIDTHS = ["33%", "10%", "15%", "17%", "12%", "13%"];

// Each connected app with the rules hash it reported on connect
export function SdkTable({ sdks, now }: { sdks: SdkConnection[]; now: number }) {
    // Offline apps need a look, so they lead
    const rows = [...sdks].sort((a, b) => Number(a.state === "connected") - Number(b.state === "connected"));
    return (
        <>
            <DataTable minWidth={940} className="text-[14px]">
                <caption className="sr-only">Connected apps and the rules hash each one reported</caption>
                <Cols widths={WIDTHS} />
                <Head first="App" rest={["SDK", "Agent key", "Rules hash", "Last seen", "State"]} />
                <tbody>
                    {rows.map((sdk) => (
                        <Tr key={sdk.id}>
                            <Td colSpan={2} className={FIRST_CELL}>
                                <NameCell
                                    icon={<Boxes size={20} strokeWidth={0.75} className="opacity-80" />}
                                    name={sdk.name}
                                    sub={sdk.host}
                                />
                            </Td>
                            <Td>
                                <Quiet mono>{sdk.sdkVersion}</Quiet>
                            </Td>
                            <Td>
                                <Quiet mono>{sdk.key}…</Quiet>
                            </Td>
                            <Td>
                                <span className="mono block text-[12px] text-ink">{sdk.rulesHash}</span>
                            </Td>
                            <Td>
                                <Ago time={sdk.lastSeenAt} now={now} />
                            </Td>
                            <Td className="text-[12px] text-ink-2">
                                <StatusValue tone={sdk.state === "connected" ? "on" : "off"}>
                                    {sdk.state === "connected" ? "Connected" : "Offline"}
                                </StatusValue>
                            </Td>
                        </Tr>
                    ))}
                </tbody>
            </DataTable>
            {rows.length === 0 ? <QuietEmpty>No SDK connected yet</QuietEmpty> : null}
        </>
    );
}
