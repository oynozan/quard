"use client";

import { useEffect, useId, useRef, useState, type RefObject } from "react";
import { mermaidConfig } from "../../theme/mermaid-config";

// Stands in for Nextra's Mermaid component (see next.config.ts) so diagrams take the Quard colors
export function Mermaid({ chart }: { chart: string }) {
    // Mermaid uses the id in CSS selectors, so keep only safe characters
    const id = `mermaid-${useId().replace(/[^\w-]/g, "")}`;
    const ref = useRef<HTMLDivElement>(null);
    const visible = useVisible(ref);
    const [svg, setSvg] = useState("");

    useEffect(() => {
        if (!visible) return;
        let live = true;
        (async () => {
            const { default: mermaid } = await import("mermaid");
            try {
                mermaid.initialize(mermaidConfig);
                const result = await mermaid.render(id, chart.replaceAll("\\n", "\n"));
                if (live) setSvg(result.svg);
            } catch (error) {
                console.error("Error while rendering mermaid", error);
            }
        })();
        return () => {
            live = false;
        };
    }, [chart, id, visible]);

    return <div ref={ref} className="quard-mermaid" dangerouslySetInnerHTML={{ __html: svg }} />;
}

// Diagrams load mermaid only once they scroll into view
function useVisible(ref: RefObject<HTMLElement | null>) {
    const [visible, setVisible] = useState(false);
    useEffect(() => {
        const observer = new IntersectionObserver(([entry]) => {
            if (entry.isIntersecting) {
                observer.disconnect();
                setVisible(true);
            }
        });
        observer.observe(ref.current as HTMLElement);
        return () => observer.disconnect();
    }, [ref]);
    return visible;
}
