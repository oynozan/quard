import type { BlockRateDay, BucketCount } from "@quard/db";

// Values at their slot, with gaps as 0
function dense(rows: [slot: number, value: number][], length: number): number[] {
    const values = Array<number>(length).fill(0);
    for (const [slot, value] of rows) values[slot] = value;
    return values;
}

// Counts per bucket, oldest first, with every bucket present
export function bucketSeries(rows: BucketCount[], length: number): number[] {
    return dense(
        rows.map((row) => [row.bucket, row.count]),
        length,
    );
}

// Percent of calls blocked per day with quiet days as 0, or no series when nothing was called
export function blockRates(days: BlockRateDay[], length: number): number[] {
    const called = days.filter((day) => day.calls > 0);
    if (called.length === 0) return [];
    return dense(
        called.map((day) => [day.day, (day.blocked / day.calls) * 100]),
        length,
    );
}
