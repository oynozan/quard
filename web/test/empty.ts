import { within } from "@testing-library/react";
import { expect } from "vitest";

// Charts draw as role img, meters as progressbar or meter
const DRAWN = ["table", "columnheader", "img", "progressbar", "meter"] as const;
const BUSY = '[aria-busy]:not([aria-busy="false"])';

// Fails when root or anything in it draws a table, a chart or a meter, or is still loading
export function expectNoChartsOrTables(root: HTMLElement = document.body): void {
    const scope = within(root.parentElement ?? root);
    for (const role of DRAWN) {
        const drawn = scope.queryAllByRole(role, { hidden: true }).filter((element) => root.contains(element));
        expect(drawn, `role ${role}`).toHaveLength(0);
    }
    expect(root.matches(BUSY) || root.querySelector(BUSY) !== null, "aria-busy").toBe(false);
}
