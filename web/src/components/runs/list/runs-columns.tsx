import { Th } from "@/components/kit/data-table";

// Shared by the table and its skeleton so both keep one geometry.
export const RUNS_MIN_WIDTH = 840;
export const RUNS_COLUMNS = 7;

// The decisions column is fixed so the 208px outcome bar always fits.
const WIDTHS = ["44px", "30%", "14%", "230px", "11%", "14%", "16%"];

export function RunsColgroup() {
    return (
        <colgroup>
            {WIDTHS.map((width, index) => (
                <col key={index} style={{ width }} />
            ))}
        </colgroup>
    );
}

const FULL = "h-[39px]";

export function RunsHead() {
    return (
        <thead>
            <tr>
                <Th colSpan={2} className={`${FULL} pl-[54px] max-[760px]:pl-[10px]`}>
                    Run
                </Th>
                <Th className={FULL}>Status</Th>
                <Th className={FULL}>Guard decisions</Th>
                <Th className={FULL}>Cost</Th>
                <Th className={FULL}>Duration</Th>
                <Th className={FULL}>Started</Th>
            </tr>
        </thead>
    );
}
