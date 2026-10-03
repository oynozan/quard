const PATH_IN_TEXT = /(?:^|[\s"'(=])((?:[a-zA-Z]:[\\/]|~\/|\.{1,2}\/|\/)[^\s"'<>|*?]+)/g;

// Puts a file path in one form: forward slashes, no "." or ".." parts
export function normalizePath(value: string): string {
    let path = value.trim().replace(/\\/g, "/");
    let prefix = "";
    const drive = /^([a-zA-Z]):\//.exec(path);
    if (drive) {
        prefix = `${(drive[1] as string).toLowerCase()}:/`;
        path = path.slice(3);
    } else if (path.startsWith("~/")) {
        prefix = "~/";
        path = path.slice(2);
    } else if (path.startsWith("/")) {
        prefix = "/";
        path = path.slice(1);
    }
    const parts: string[] = [];
    for (const part of path.split("/")) {
        if (part === "" || part === ".") {
            continue;
        }
        if (part !== "..") {
            parts.push(part);
        } else if (parts.length > 0 && parts.at(-1) !== "..") {
            parts.pop();
        } else if (prefix === "") {
            parts.push("..");
        }
    }
    return prefix + parts.join("/");
}

export function findPaths(text: string): string[] {
    const found: string[] = [];
    for (const match of text.matchAll(PATH_IN_TEXT)) {
        const path = normalizePath(match[1] as string);
        if (path !== "/" && path !== "") {
            found.push(path);
        }
    }
    return found;
}
