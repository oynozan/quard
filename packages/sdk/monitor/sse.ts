export type SseEvent = {
    event: string | undefined;
    data: string;
};

const BOUNDARY = /\r?\n\r?\n/;

export function parseSseEvent(raw: string): SseEvent {
    let event: string | undefined;
    const data: string[] = [];
    for (const line of raw.split(/\r?\n/)) {
        if (line.startsWith("event:")) {
            event = line.slice(6).trim();
        } else if (line.startsWith("data:")) {
            data.push(line.slice(5).replace(/^ /, ""));
        }
    }
    return { event, data: data.join("\n") };
}

// Passes an event stream through unchanged. The hook sees each event
// before it is passed on, so an event can wait for a check to finish.
export function tapSse(
    body: ReadableStream<Uint8Array>,
    onEvent: (event: SseEvent) => void | Promise<void>,
): ReadableStream<Uint8Array> {
    const decoder = new TextDecoder();
    const encoder = new TextEncoder();
    let buffer = "";
    const emit = async (raw: string, controller: TransformStreamDefaultController<Uint8Array>) => {
        await onEvent(parseSseEvent(raw));
        controller.enqueue(encoder.encode(raw));
    };
    return body.pipeThrough(
        new TransformStream<Uint8Array, Uint8Array>({
            async transform(chunk, controller) {
                buffer += decoder.decode(chunk, { stream: true });
                let match = BOUNDARY.exec(buffer);
                while (match !== null) {
                    const end = match.index + match[0].length;
                    const raw = buffer.slice(0, end);
                    buffer = buffer.slice(end);
                    await emit(raw, controller);
                    match = BOUNDARY.exec(buffer);
                }
            },
            async flush(controller) {
                buffer += decoder.decode();
                if (buffer !== "") {
                    await emit(buffer, controller);
                }
            },
        }),
    );
}
