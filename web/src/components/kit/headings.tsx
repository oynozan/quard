import type { ReactNode } from "react";
import { ArrowLink } from "./links";

// The page title row: a thin display title on the left, page actions on the right.
export function PageHeading({ title, actions }: { title: string; actions?: ReactNode }) {
    return (
        <div className="mb-[26px] flex items-center justify-between gap-6 max-[760px]:flex-col max-[760px]:items-start max-[760px]:gap-[14px]">
            <h1 className="text-[26px] leading-[1.3] font-extralight tracking-[-0.2px] max-[760px]:text-[25px]">
                {title}
            </h1>
            {actions ? <div className="flex flex-wrap items-center gap-2 empty:hidden">{actions}</div> : null}
        </div>
    );
}

type SectionHeadingProps = {
    title: string;
    count?: number | null;
    href?: string;
    action?: ReactNode;
};

// A section title with an optional count chip and a "View all" link on the right.
export function SectionHeading({ title, count, href, action }: SectionHeadingProps) {
    return (
        <div className="mb-4 flex items-center justify-between gap-[14px]">
            <h2 className="text-[15px] leading-[1.4] font-extralight max-[760px]:text-[14px]">
                {title}
                {count !== undefined ? <CountChip value={count} /> : null}
            </h2>
            {action ?? (href ? <ArrowLink href={href}>View all</ArrowLink> : null)}
        </div>
    );
}

// A small mono count beside a title. A skeleton while unknown is shown by passing null.
export function CountChip({ value }: { value: number | null }) {
    return (
        <span className="mono ml-2 inline-block rounded-sm bg-tile px-[5px] align-[2px] text-[12px] leading-[18px] text-ink-note">
            {value === null ? "—" : value}
        </span>
    );
}

// The light 12px label above a sub-table.
export function SubHeading({ children }: { children: ReactNode }) {
    return <h3 className="mb-[10px] text-[12px] font-light text-ink-muted">{children}</h3>;
}
