import { Skeleton } from "@/components/ui/skeleton";

type SkeletonRowsProps = {
    columns: number;
    // 5 on full tables, 4 on compact ones
    rows?: number;
    // Adds the empty 44px selection cell first
    selection?: boolean;
    // Read by screen readers while the rows load
    label?: string;
};

// Loading rows at the real 64px height, used in place of a DataTable's tbody
export function SkeletonRows({ columns, rows = 5, selection = false, label = "Loading…" }: SkeletonRowsProps) {
    return (
        <tbody aria-busy="true">
            {Array.from({ length: rows }, (_, row) => (
                <tr key={row}>
                    {selection ? <td className="h-16 border-b border-line" /> : null}
                    {Array.from({ length: columns }, (_, col) => (
                        <td key={col} className="h-16 border-b border-line px-[10px] py-[11px] align-middle">
                            {row === 0 && col === 0 ? (
                                <span role="status" className="sr-only">
                                    {label}
                                </span>
                            ) : null}
                            <Skeleton width={col === 0 ? 150 : 72} />
                        </td>
                    ))}
                </tr>
            ))}
        </tbody>
    );
}
