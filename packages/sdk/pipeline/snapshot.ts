// True when a value is plain data that structuredClone copies faithfully:
// primitives, arrays and plain objects. Class instances, functions and
// symbols are not, so they are left as they are.
export function isPlain(value: unknown, seen = new WeakSet<object>()): boolean {
    if (typeof value === "function" || typeof value === "symbol") {
        return false;
    }
    if (value === null || typeof value !== "object" || seen.has(value)) {
        return true;
    }
    seen.add(value);
    const proto: unknown = Object.getPrototypeOf(value);
    if (!Array.isArray(value) && proto !== Object.prototype && proto !== null) {
        return false;
    }
    return Object.values(value).every((item) => isPlain(item, seen));
}

// A private copy of plain arguments, so a caller can't change them
// between the checks and the run
export function snapshot(args: unknown[]): unknown[] {
    return isPlain(args) ? structuredClone(args) : args;
}
