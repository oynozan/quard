import { Th } from "@/components/kit/data-table";

// The results table's minimum width, columns and heads
export const SEARCH_MIN_WIDTH = 960;
export const SEARCH_COLUMNS = 7;

const WIDTHS = ["44px", "22%", "12%", "11%", "22%", "19%", "14%"];

export function SearchColgroup() {
    return (
        <colgroup>
            {WIDTHS.map((width, index) => (
                <col key={index} style={{ width }} />
            ))}
        </colgroup>
    );
}

const FULL = "h-[39px]";

export function SearchHead() {
    return (
        <thead>
            <tr>
                <Th colSpan={2} className={`${FULL} pl-[54px]`}>
                    Step
                </Th>
                <Th className={FULL}>Agent</Th>
                <Th className={FULL}>Field</Th>
                <Th className={FULL}>Value</Th>
                <Th className={FULL}>Label</Th>
                <Th className={FULL}>Time</Th>
            </tr>
        </thead>
    );
}
