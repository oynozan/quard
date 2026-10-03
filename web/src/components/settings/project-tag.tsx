// The project these settings belong to, as a quiet mono line
export function ProjectTag({ id, name }: { id: string | null; name: string | null }) {
    return (
        <p className="flex items-center gap-2 text-[12px] text-ink-muted">
            Project
            <span className="mono rounded-sm bg-tile px-[7px] text-[12px] leading-[20px] text-ink">{name ?? "—"}</span>
            <span className="mono text-ink-note">{id ?? "—"}</span>
        </p>
    );
}
