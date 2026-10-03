import { Boxes } from "lucide-react";
import { DataTable, NameCell, QuietEmpty, Td, Tr } from "@/components/kit/data-table";
import { StatusValue } from "@/components/kit/detail/detail-list";
import type { SdkConnection } from "@/lib/data/settings";
import { formatAge } from "@/lib/format";
import { Ago, Cols, FIRST_CELL, Head, Quiet } from "../shared/table-parts";

const WIDTHS = ["21%", "18%", "9%", "14%", "15%", "11%", "12%"];

// Each connected app with the rules hash it reported on connect
export function SdkTable({ sdks, now }: { sdks: SdkConnection[]; now: number }) {
    if (sdks.length === 0) {
        return <QuietEmpty>No SDK connected yet</QuietEmpty>;
    }
    // Offline apps need a look, so they lead
    const rows = [...sdks].sort((a, b) => Number(a.state === "connected") - Number(b.state === "connected"));
    return (
        <DataTable minWidth={940} className="text-[14px]">
            <caption className="sr-only">Connected apps and the rules hash each one reported</caption>
            <Cols widths={WIDTHS} />
            <Head first="App" rest={["Agents", "SDK", "Agent key", "Rules hash", "Last seen", "State"]} />
            <tbody>
                {rows.map((sdk) => (
                    <Tr key={sdk.name}>
                        <Td colSpan={2} className={FIRST_CELL}>
                            <NameCell
                                icon={<Boxes size={20} strokeWidth={0.75} className="opacity-80" />}
                                name={sdk.name}
                                sub={sdk.runtime}
                            />
                        </Td>
                        <Td>
                            <Quiet mono title={sdk.agents.join(", ")}>
                                {sdk.agents.join(", ")}
                            </Quiet>
                        </Td>
                        <Td>
                            <Quiet mono>{sdk.sdkVersion.replace(/^quard /, "")}</Quiet>
                        </Td>
                        <Td>
                            <Quiet mono>{sdk.key}</Quiet>
                        </Td>
                        <Td>
                            <span className="mono block text-[12px] text-ink">{sdk.rulesHash}</span>
                            {sdk.previousHash ? (
                                <span
                                    className="block truncate text-[11px] text-ink-note"
                                    title={`Was ${sdk.previousHash}`}
                                >
                                    Changed <span className="mono">{formatAge(sdk.hashSince, now)}</span> ago
                                </span>
                            ) : null}
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
    );
}
