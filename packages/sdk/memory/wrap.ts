import { currentScope, newScope, withScope } from "../context/scope.ts";
import { readThrough } from "./read.ts";
import { writeThrough } from "./write.ts";

export type MemoryOptions = {
    // Items read from the store get the origin "memory:<name>"
    name: string;
};

type Method = "get" | "search" | "read" | "put" | "write";

type Wrapped<F> = F extends (...args: infer A) => infer R ? (...args: A) => Promise<Awaited<R>> : F;

// The same shape as the store. Its reads and writes return promises.
export type MemoryStore<T> = { [K in keyof T]: K extends Method ? Wrapped<T[K]> : T[K] };

type Fn = (...args: unknown[]) => unknown;

const METHODS = new Set<PropertyKey>(["get", "search", "read", "put", "write"]);

function isMethod(key: PropertyKey): key is Method {
    return METHODS.has(key);
}

function wrapMethod(target: object, method: Method, fn: Fn, name: string): Fn {
    return async (...args: unknown[]) => {
        // Like guard(): the current run, or else a new one
        const scope = currentScope() ?? newScope();
        const call = async () => withScope(scope, () => fn.apply(target, args));
        if (method === "put") {
            return writeThrough(scope, name, args[1], call);
        }
        if (method === "write") {
            return writeThrough(scope, name, args[0], call);
        }
        return readThrough(scope, name, method !== "get", call);
    };
}

// quard.memory(): labels what goes into a store and what comes back out.
// Reads are get, search and read; writes are put and write. Any of them
// may be missing, and other methods pass through untouched.
export function memory<T extends object>(store: T, options: MemoryOptions): MemoryStore<T> {
    const name = options?.name;
    if (typeof name !== "string" || name === "" || name.length > 200) {
        throw new Error("quard.memory() needs options.name: the store's name, 1 to 200 characters");
    }
    return new Proxy(store, {
        get(target, key) {
            const value: unknown = Reflect.get(target, key, target);
            if (typeof value !== "function") {
                return value;
            }
            // Bound to the store, so private fields and built-ins like Map still work
            return isMethod(key) ? wrapMethod(target, key, value as Fn, name) : value.bind(target);
        },
    }) as unknown as MemoryStore<T>;
}
