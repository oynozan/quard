import type { BlockRateDay, BucketCount } from "@quard/db";

// Values at their slot with gaps as 0, or no series at all when nothing came back
function dense(rows: [slot: number, value: number][], length: number): number[] {
    if (rows.length === 0) return [];
    const values = Array<number>(length).fill(0);
    for (const [slot, value] of rows) values[slot] = value;
    return values;
}

// Counts per bucket, oldest first
export function bucketSeries(rows: BucketCount[], length: number): number[] {
    return dense(
        rows.map((row) => [row.bucket, row.count]),
        length,
    );
}

// Percent of guarded tool calls blocked per day, oldest first, with days without calls as 0
export function blockRates(days: BlockRateDay[], length: number): number[] {
    return dense(
        days.filter((day) => day.calls > 0).map((day) => [day.day, (day.blocked / day.calls) * 100]),
        length,
    );
}
