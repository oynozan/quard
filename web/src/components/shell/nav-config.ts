import {
    ChartColumn,
    LayoutGrid,
    ListTree,
    Search,
    Settings,
    ShieldCheck,
    Siren,
    Waypoints,
    type LucideIcon,
} from "lucide-react";

export type NavItem = {
    href: string;
    label: string;
    icon: LucideIcon;
    external?: boolean;
};

export const PRIMARY_NAV: NavItem[] = [
    { href: "/", label: "Overview", icon: LayoutGrid },
    { href: "/runs", label: "Runs", icon: ListTree },
    { href: "/approvals", label: "Approvals", icon: ShieldCheck },
    { href: "/incidents", label: "Incidents", icon: Siren },
    { href: "/agents", label: "Agents", icon: Waypoints },
    { href: "/summary", label: "Summary", icon: ChartColumn },
    { href: "/search", label: "Search", icon: Search },
];

export const WORKSPACE_NAV: NavItem[] = [{ href: "/settings", label: "Settings", icon: Settings }];

// The page name the mobile top bar shows, from the current path.
export function pageTitle(pathname: string): string {
    const all = [...PRIMARY_NAV, ...WORKSPACE_NAV];
    const match = all
        .filter((item) => !item.external)
        .find((item) => (item.href === "/" ? pathname === "/" : pathname.startsWith(item.href)));
    return match?.label ?? "Quard";
}

export function isActive(item: NavItem, pathname: string): boolean {
    if (item.external) return false;
    return item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
}
