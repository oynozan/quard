// Edge color by the share of messages that carried untrusted content
export type ShareTone = "trusted" | "mixed" | "untrusted";

export type ShareStyle = { tone: ShareTone; word: string; color: string; dash: string | null };

// Lightness rises with the untrusted share, and the top bucket is also dashed
export const SHARE_STYLES: ShareStyle[] = [
    { tone: "trusted", word: "<10%", color: "var(--chart-context)", dash: null },
    { tone: "mixed", word: "10–59%", color: "var(--cat-3)", dash: null },
    { tone: "untrusted", word: "60%+", color: "var(--caution-text)", dash: "4 2" },
];

export function shareStyle(share: number): ShareStyle {
    if (share < 0.1) return SHARE_STYLES[0];
    if (share < 0.6) return SHARE_STYLES[1];
    return SHARE_STYLES[2];
}

// Edge weight by message count over the window
export function edgeWidth(total: number): number {
    if (total < 100) return 1;
    if (total < 1000) return 1.5;
    if (total < 5000) return 2;
    return 3;
}
