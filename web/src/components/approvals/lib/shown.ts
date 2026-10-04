// The approvals page lists this many open requests at first, and "Show more" adds as many again.
export const SHOWN_STEP = 100;

// Request ids as control makes them
const REQUEST_ID = /^apr_[0-9a-f]{16}$/;

type RawParams = Record<string, string | string[] | undefined>;

const first = (value: RawParams[string]) => (Array.isArray(value) ? value[0] : value);

// How many open requests ?shown= asks for, never fewer than the first step
export function shownOf(params: RawParams): number {
    const value = Number(first(params.shown));
    return Number.isSafeInteger(value) && value > SHOWN_STEP ? value : SHOWN_STEP;
}

// The request ?request= asks the page to list, even when it falls past the step
export function linkedOf(params: RawParams): string | undefined {
    const value = first(params.request);
    return value !== undefined && REQUEST_ID.test(value) ? value : undefined;
}

// The address that lists one more step, still with the linked request
export function moreHref(shown: number, linked?: string): string {
    const query = new URLSearchParams({ shown: String(shown + SHOWN_STEP) });
    if (linked !== undefined) query.set("request", linked);
    return `/approvals?${query}`;
}
