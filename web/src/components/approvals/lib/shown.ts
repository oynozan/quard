// The approvals page lists this many open requests at first, and "Show more" adds as many again.
export const SHOWN_STEP = 100;

type RawParams = Record<string, string | string[] | undefined>;

// How many open requests ?shown= asks for, never fewer than the first step
export function shownOf(params: RawParams): number {
    const value = Number(Array.isArray(params.shown) ? params.shown[0] : params.shown);
    return Number.isSafeInteger(value) && value > SHOWN_STEP ? value : SHOWN_STEP;
}

// The address that lists one more step
export function moreHref(shown: number): string {
    return `/approvals?shown=${shown + SHOWN_STEP}`;
}
