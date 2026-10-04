import type { ColumnType } from "kysely";

type Timestamp = ColumnType<Date, Date | string, Date | string>;

// Worker processes, each checking in every few seconds
export type WorkersTable = {
    id: string;
    host: string;
    pid: number;
    started_at: Timestamp;
    seen_at: Timestamp;
};
