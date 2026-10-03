import { cn } from "@/lib/utils";

export type ChartTableColumn = { label: string; align?: "left" | "right" };
export type ChartTableRow = { key: string; cells: string[] };

type ChartTableProps = {
    columns: ChartTableColumn[];
    rows: ChartTableRow[];
    // Matches the chart's height so the pane does not jump when toggled
    height: number;
    caption: string;
    emptyText?: string;
};

// The table view of a chart with a sticky recess header and 28px mono rows
export function ChartTable({ columns, rows, height, caption, emptyText = "No data" }: ChartTableProps) {
    return (
        <div className="table-scroll overflow-y-auto border-y border-line" style={{ height }}>
            <table className="w-full border-collapse text-left">
                <caption className="sr-only">{caption}</caption>
                <thead className="sticky top-0 z-[1] bg-recess text-[11px] text-ink-muted">
                    <tr>
                        {columns.map((column, i) => (
                            <th
                                key={column.label}
                                scope="col"
                                className={cn(
                                    "h-[30px] px-3 font-normal whitespace-nowrap",
                                    (column.align ?? (i === 0 ? "left" : "right")) === "right" && "text-right",
                                )}
                            >
                                {column.label}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody className="mono text-[12px]">
                    {rows.map((row) => (
                        <tr key={row.key} className="h-7 border-b border-line last:border-0">
                            {row.cells.map((cell, i) =>
                                i === 0 ? (
                                    <th
                                        key={i}
                                        scope="row"
                                        className="px-3 text-left font-normal whitespace-nowrap text-ink-2"
                                    >
                                        {cell}
                                    </th>
                                ) : (
                                    <td
                                        key={i}
                                        className={cn(
                                            "px-3 whitespace-nowrap text-ink",
                                            (columns[i]?.align ?? "right") === "right" && "text-right",
                                        )}
                                    >
                                        {cell}
                                    </td>
                                ),
                            )}
                        </tr>
                    ))}
                </tbody>
            </table>
            {rows.length === 0 ? <p className="py-6 text-center text-[11px] text-ink-muted">{emptyText}</p> : null}
        </div>
    );
}
