// Items grouped by a key, and a key goes away with its last item
export type Groups<T> = {
    add(key: string, item: T): void;
    delete(key: string, item: T): void;
    get(key: string): T[];
    keys(): string[];
};

export function createGroups<T>(): Groups<T> {
    const map = new Map<string, Set<T>>();
    return {
        add: (key, item) => {
            const group = map.get(key);
            if (group === undefined) {
                map.set(key, new Set([item]));
            } else {
                group.add(item);
            }
        },
        delete: (key, item) => {
            const group = map.get(key);
            group?.delete(item);
            if (group?.size === 0) {
                map.delete(key);
            }
        },
        get: (key) => [...(map.get(key) ?? [])],
        keys: () => [...map.keys()],
    };
}
