// Splits a whole number across weights by largest remainder, so the parts add up exactly.
export function allocateParts(weights: number[], total: number): number[] {
    const sum = weights.reduce((acc, weight) => acc + weight, 0);
    if (sum <= 0 || total <= 0) return weights.map(() => 0);
    const exact = weights.map((weight) => (weight / sum) * total);
    const parts = exact.map(Math.floor);
    let left = total - parts.reduce((acc, part) => acc + part, 0);
    const order = exact
        .map((value, index) => ({ index, rest: value - Math.floor(value) }))
        .sort((a, b) => b.rest - a.rest);
    for (const { index } of order) {
        if (left <= 0) break;
        parts[index] += 1;
        left -= 1;
    }
    return parts;
}
