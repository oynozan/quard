// One element on a dashboard page: a CSS selector, text inside it, or both
export type Target = {
    sel?: string;
    text?: string;
    closest?: string;
    nth?: number;
};

// Where a mark's number sits around its box
export type Badge = "tl" | "tr" | "bl" | "br" | "l" | "r";

// A numbered green box drawn around an element
export type Mark = Target & { n: number; pad?: number; badge?: Badge };

export type Clip = Target & { pad?: number };

export type Action = { click: Target; wait?: number };

export type Job = {
    name: string;
    url: string;
    marks: Mark[];
    height?: number;
    full?: boolean;
    clip?: Clip;
    actions?: Action[];
};

export type Rect = { x: number; y: number; w: number; h: number };
