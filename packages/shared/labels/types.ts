export type Trust = "trusted" | "untrusted";
export type Sensitivity = "internal" | "public";

// The kind is the part of an origin before the first ":"
export type OriginKind = "user" | "system" | "tool" | "web" | "email" | "file" | "mcp" | "agent" | "unknown";

export type Label = {
    origin: string;
    kind: OriginKind;
    trust: Trust;
    sensitivity: Sensitivity;
    flags: string[];
};

export type OriginOverride = {
    trust?: Trust;
    sensitivity?: Sensitivity;
};

export type OriginOverrides = Record<string, OriginOverride>;

// The least trusted and most sensitive mix of what a model read
export type ContextLabel = {
    trust: Trust;
    sensitivity: Sensitivity;
    origins: string[];
    flagged: boolean;
};
