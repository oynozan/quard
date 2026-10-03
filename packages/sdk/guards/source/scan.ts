import { cleanText, hasInvisible } from "@quard/shared";

export type Finding = "instructions" | "tool_call_text" | "invisible_text" | "unknown_host";

// Text that speaks to an AI instead of a human reader
export const INSTRUCTION_PATTERNS: RegExp[] = [
    /\b(ignore|disregard|forget|override)\b[^.\n]{0,40}\b(previous|prior|above|earlier|all|any|system|safety)\b[^.\n]{0,20}\b(instructions?|prompts?|rules?|messages?|guidelines?)\b/i,
    /\b(you are now|from now on,? you|new instructions?|updated instructions?|system prompt|developer mode)\b/i,
    /\b(dear|attention|note to the) (ai|assistant|agent|model|llm)\b/i,
    /\b(do not|don't|never) (tell|inform|mention|reveal|notify)\b[^.\n]{0,30}\b(user|human|anyone)\b/i,
    /<\|?(im_start|im_end|endoftext)\|?>|\[\/?INST\]|<<SYS>>/i,
    /^\s*(system|assistant|developer)\s*:/im,
];

export const TOOL_CALL_PATTERNS: RegExp[] = [
    /"(tool_calls|function_call)"\s*:/i,
    /"name"\s*:\s*"[^"]+"\s*,\s*"arguments"\s*:/i,
    /<\/?(tool_call|function_call|tool_use|invoke)\b/i,
    /\bfunctions\.[a-z_]\w*\s*\(/i,
];

// Styling that hides text from a human but not from the model
export const HIDDEN_STYLE =
    /(display\s*:\s*none|visibility\s*:\s*hidden|font-size\s*:\s*0(?![.\d])|opacity\s*:\s*0(?![.\d]))/i;

// Patterns run on cleaned text, so hidden marks can't split their words
export function scanText(text: string): Finding[] {
    const clean = cleanText(text);
    const findings: Finding[] = [];
    if (INSTRUCTION_PATTERNS.some((pattern) => pattern.test(clean))) {
        findings.push("instructions");
    }
    if (TOOL_CALL_PATTERNS.some((pattern) => pattern.test(clean))) {
        findings.push("tool_call_text");
    }
    if (hasInvisible(text) || HIDDEN_STYLE.test(clean)) {
        findings.push("invisible_text");
    }
    return findings;
}
