// The Quard mark: a 2×2 block of cells, one lit, like the chart cells it watches over.
export function QuardMark({ size = 18 }: { size?: number }) {
    const cell = (size - 2) / 2;
    return (
        <svg aria-hidden width={size} height={size} viewBox={`0 0 ${size} ${size}`} shapeRendering="crispEdges">
            <rect x={0} y={0} width={cell} height={cell} fill="var(--signal)" />
            <rect x={cell + 2} y={0} width={cell} height={cell} fill="var(--ink)" />
            <rect x={0} y={cell + 2} width={cell} height={cell} fill="var(--ink)" />
            <rect x={cell + 2} y={cell + 2} width={cell} height={cell} fill="var(--ink-subtle)" />
        </svg>
    );
}

export function QuardWordmark() {
    return (
        <span className="quard-wordmark">
            <QuardMark />
            <span className="quard-wordmark-name">quard</span>
            <span className="quard-wordmark-tag">docs</span>
        </span>
    );
}
