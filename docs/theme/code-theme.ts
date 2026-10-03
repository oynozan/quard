import { tokens as t } from "./tokens";

type ThemeRule = { scope: string[]; settings: { foreground: string; fontStyle?: string } };

const rule = (foreground: string, scope: string[]): ThemeRule => ({ scope, settings: { foreground } });

// A dark Shiki theme made from the Quard tokens. Code is the one place mint marks text.
export const codeTheme = {
    name: "quard",
    type: "dark" as const,
    colors: {
        "editor.background": t.recess,
        "editor.foreground": t.inkSoft,
        "terminal.ansiBlack": t.inkMuted,
        "terminal.ansiRed": t.danger,
        "terminal.ansiGreen": t.mint,
        "terminal.ansiYellow": t.warning,
        "terminal.ansiBlue": t.cat4,
        "terminal.ansiMagenta": t.cat2,
        "terminal.ansiCyan": t.mint,
        "terminal.ansiWhite": t.ink,
        "terminal.ansiBrightBlack": t.inkNote,
        "terminal.ansiBrightRed": t.problem,
        "terminal.ansiBrightGreen": t.mint,
        "terminal.ansiBrightYellow": t.warning,
        "terminal.ansiBrightBlue": t.cat4,
        "terminal.ansiBrightMagenta": t.cat2,
        "terminal.ansiBrightCyan": t.mint,
        "terminal.ansiBrightWhite": t.inkBright,
    },
    settings: [
        {
            scope: ["comment", "punctuation.definition.comment"],
            settings: { foreground: t.inkNote, fontStyle: "italic" },
        },
        rule(t.ink2, ["keyword", "storage", "storage.type", "storage.modifier", "keyword.control"]),
        rule(t.inkMuted, ["keyword.operator", "punctuation", "meta.brace", "punctuation.definition.tag"]),
        rule(t.mint, ["string", "string.quoted", "string.template", "punctuation.definition.string"]),
        rule(t.warning, ["constant.numeric", "constant.language", "constant.character", "support.constant"]),
        rule(t.cautionText, ["entity.name.function", "support.function", "meta.function-call", "string.regexp"]),
        rule(t.inkBright, ["entity.name.type", "entity.name.class", "support.type", "support.class"]),
        rule(t.inkSoft, ["variable", "variable.other.property", "meta.object-literal.key", "support.variable"]),
        rule(t.ink, ["variable.parameter", "entity.name.namespace"]),
        rule(t.inkLink, ["entity.name.tag", "support.class.component"]),
        rule(t.warning, ["entity.other.attribute-name"]),
        rule(t.mint, ["markup.inserted", "punctuation.definition.inserted"]),
        rule(t.danger, ["markup.deleted", "punctuation.definition.deleted"]),
        rule(t.warning, ["markup.changed", "punctuation.definition.changed"]),
        rule(t.ink, ["markup.heading", "markup.bold", "markup.italic"]),
        rule(t.problem, ["invalid", "invalid.illegal"]),
    ],
};
