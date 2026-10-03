// A cost, or a dash when some model's price is unknown
export function costText(costUsd: number, known: boolean | undefined, format: (value: number) => string): string {
    return known === false ? "—" : format(costUsd);
}
