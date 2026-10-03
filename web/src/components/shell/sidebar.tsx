"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Boxes, UserRound } from "lucide-react";
import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";
import { Glyph } from "@/components/icons/glyphs";
import { LiquidMetalButton } from "@/components/liquid-metal/liquid-metal-button";
import { QuardWordmark } from "./quard-mark";
import { isActive, PRIMARY_NAV, WORKSPACE_NAV, type NavItem } from "./nav-config";

// Each row fades in one step later than the row above it.
const step = (index: number): CSSProperties => ({ animationDelay: `${index * 50}ms` });

type SidebarProps = {
    openApprovals: number;
    project: string;
    account: { email: string; role: string };
    onNavigate?: () => void;
};

export function Sidebar({ openApprovals, project, account, onNavigate }: SidebarProps) {
    const pathname = usePathname();

    return (
        <>
            <div
                className="reveal-row flex h-[75px] shrink-0 items-center px-[23px] max-[1250px]:px-[22px]"
                style={step(0)}
            >
                <Link href="/" aria-label="Quard overview" onClick={onNavigate} className="rounded-sm">
                    <QuardWordmark />
                </Link>
            </div>

            <nav aria-label="Main" className="px-3 pt-3 pb-[18px]">
                <ul>
                    {PRIMARY_NAV.map((item, i) => (
                        <li key={item.href} className="reveal-row" style={step(i + 2)}>
                            <NavLink
                                item={item}
                                active={isActive(item, pathname)}
                                count={item.href === "/approvals" ? openApprovals : undefined}
                                onNavigate={onNavigate}
                            />
                        </li>
                    ))}
                </ul>
            </nav>

            <div className="mt-auto">
                <nav aria-label="Workspace" className="px-3 pb-[18px]">
                    <span
                        className="reveal-row block px-[11px] pb-[10px] text-[12px] font-light tracking-[0.085em] text-ink-faint uppercase"
                        style={step(10)}
                    >
                        Workspace
                    </span>
                    <ul>
                        {WORKSPACE_NAV.map((item, i) => (
                            <li key={item.href} className="reveal-row" style={step(11 + i)}>
                                <NavLink item={item} active={isActive(item, pathname)} onNavigate={onNavigate} />
                            </li>
                        ))}
                    </ul>
                </nav>

                <div className="reveal-row flex px-3 pb-6" style={step(12)}>
                    <LiquidMetalButton
                        label={openApprovals > 0 ? `Review ${openApprovals} approvals` : "Open approvals"}
                        href="/approvals"
                        fullWidth
                    />
                </div>

                <AccountRow
                    index={14}
                    icon={<Boxes size={18} strokeWidth={0.75} />}
                    title={project}
                    mono
                    sub="Self-hosted"
                />
                <AccountRow
                    index={15}
                    icon={<UserRound size={18} strokeWidth={0.75} />}
                    title={account.email}
                    mono
                    sub={account.role}
                />
            </div>
        </>
    );
}

type NavLinkProps = { item: NavItem; active: boolean; count?: number; onNavigate?: () => void };

function NavLink({ item, active, count, onNavigate }: NavLinkProps) {
    const Icon = item.icon;
    return (
        <Link
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
                "group flex min-h-[37px] w-full items-center gap-[10px] rounded-md border px-[10px] py-[7px] text-[14px] max-[760px]:min-h-[34px]",
                active
                    ? "border-transparent bg-selected text-signal"
                    : "border-transparent text-ink-2 hover:bg-nav-hover hover:text-ink-bright",
            )}
        >
            <Icon
                aria-hidden
                size={20}
                strokeWidth={0.75}
                className={cn(
                    "transition-opacity duration-150",
                    active ? "opacity-100" : "opacity-60 group-hover:opacity-85",
                )}
            />
            {item.label}
            {count ? (
                <span className="mono ml-auto rounded-sm bg-tile px-[5px] text-[12px] leading-[18px] text-ink-note">
                    {count}
                </span>
            ) : null}
        </Link>
    );
}

type AccountRowProps = { index: number; icon: React.ReactNode; title: string; sub: string; mono?: boolean };

function AccountRow({ index, icon, title, sub, mono }: AccountRowProps) {
    return (
        <Link
            href="/settings"
            className="reveal-row group flex min-h-[73px] w-full items-center gap-[10px] border-t border-line px-5 py-4 text-left hover:bg-nav-hover focus-visible:outline-offset-[-2px]"
            style={step(index)}
        >
            <span className="grid size-[29px] shrink-0 place-items-center rounded-sm bg-tile opacity-75">{icon}</span>
            <span className="min-w-0 flex-1">
                <strong className={cn("block truncate text-[14px] font-medium text-ink", mono && "mono font-normal")}>
                    {title}
                </strong>
                <small className="block text-[12px] text-ink-muted">{sub}</small>
            </span>
            <Glyph
                name="chevronRight"
                size={18}
                className="shrink-0 opacity-60 transition-opacity group-hover:opacity-100"
            />
        </Link>
    );
}
