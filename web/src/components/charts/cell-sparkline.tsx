import { columnField, stripWidths } from "@/lib/charts/cells";

type CellSparklineProps = {
    values: number[];
    width: number;
    rows: number;
    cell: number;
    label: string;
};

// History in Context Gray, the newest column in Signal Green, on a faint field.
export function CellSparkline({ values, width, rows, cell, label }: CellSparklineProps) {
    const highest = Math.max(1, ...values);
    const last = values.length - 1;
    const field = columnField({
        values,
        dataRows: rows,
        cell,
        unit: highest / rows,
        columnWidths: stripWidths(width, values.length),
        colorOf: (col) => (col === last ? "now" : "lit"),
    });

    return (
        <svg
            role="img"
            aria-label={label}
            width={field.width}
            height={field.height}
            shapeRendering="crispEdges"
            className="block"
        >
            <path d={field.field} fill="var(--chart-field)" />
            <path d={field.lit.lit ?? ""} fill="var(--chart-context)" />
            <path d={field.lit.now ?? ""} fill="var(--signal)" />
        </svg>
    );
}
