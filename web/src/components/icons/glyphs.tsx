import type { SVGProps } from "react";

// Control glyphs drawn on a 48-unit grid with round strokes. See Iconography in DESIGN.md.
const PATHS = {
    chevronRight: "M18 12L30 24L18 36",
    chevronDown: "M12 19l12 12 12-12",
    close: "M15 15L33 33M33 15L15 33",
    refresh: "M33.9 33.9A14 14 0 1 1 33.9 14.1M34.2 7.6L33.9 14.1L27.4 14.4",
    copy: "M17 17H35V36H17ZM11 30H9V10H28V12",
    wand: "M10 36L31 15L36 20L15 41ZM27 19L32 24M13 8V16M9 12H17M35 5V11M32 8H38M38 29V37M34 33H42",
    warning: "M24 8L43 40H5ZM24 19V29M24 34V35",
    check: "m12 24 8 8 16-16",
};

export type GlyphName = keyof typeof PATHS;

type GlyphProps = SVGProps<SVGSVGElement> & { name: GlyphName; size?: number; strokeWidth?: number };

export function Glyph({ name, size = 16, strokeWidth = 1.5, ...props }: GlyphProps) {
    return (
        <svg
            aria-hidden
            width={size}
            height={size}
            viewBox="0 0 48 48"
            fill="none"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
            {...props}
        >
            <path d={PATHS[name]} />
        </svg>
    );
}

// Status glyphs carry a heavier stroke so they read at small sizes.
export function WarningGlyph({ size = 14, className }: { size?: number; className?: string }) {
    return <Glyph name="warning" size={size} strokeWidth={2.2} className={className} />;
}

export function CrossGlyph({ size = 14, className }: { size?: number; className?: string }) {
    return <Glyph name="close" size={size} strokeWidth={2.2} className={className} />;
}
