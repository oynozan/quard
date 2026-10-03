import { within } from "@testing-library/react";

// The value next to a term in a detail list, read inside one part of the page.
export function detailValue(scope: HTMLElement, term: string): string | null {
    const dt = within(scope).getByText(term, { selector: "dt" });
    return dt.nextElementSibling?.textContent ?? null;
}

// The drawer section under a heading.
export function section(title: string): HTMLElement {
    const heading = within(document.body).getByRole("heading", { level: 3, name: title });
    return heading.closest("section") as HTMLElement;
}
