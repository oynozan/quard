import type { ColumnType, Generated } from "kysely";

type Timestamp = ColumnType<Date, Date | string, Date | string>;

// Policy files and signature feeds that failed to load in an SDK
export type ConfigErrorsTable = {
    project_id: string;
    source: "policy" | "signatures";
    message: string;
    first_seen_at: Timestamp;
    last_seen_at: Timestamp;
    count: Generated<number>;
};

// Events an SDK dropped, as reported with a batch
export type UploadDropsTable = {
    project_id: string;
    batch_id: string;
    count: number;
    at: Timestamp;
};
