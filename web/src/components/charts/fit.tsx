"use client";

import { useWidth } from "@/lib/hooks/use-width";
import { CellMeter } from "./cell-meter";
import { CellSparkline } from "./cell-sparkline";

type FitMeterProps = { value: number; max: number; cells: number; label: string; initial?: number };

// A meter that spans its container exactly.
export function FitMeter({ initial = 220, ...props }: FitMeterProps) {
    const [ref, width] = useWidth<HTMLDivElement>(initial);
    return (
        <div ref={ref} className="w-full">
            <CellMeter {...props} width={width} />
        </div>
    );
}

type FitSparklineProps = { values: number[]; rows: number; cell: number; label: string; initial?: number };

// A sparkline that spans its container exactly.
export function FitSparkline({ initial = 220, ...props }: FitSparklineProps) {
    const [ref, width] = useWidth<HTMLDivElement>(initial);
    return (
        <div ref={ref} className="w-full">
            <CellSparkline {...props} width={width} />
        </div>
    );
}
