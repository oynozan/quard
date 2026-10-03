import type { Metadata } from "next";
import Link from "next/link";
import { QuardMark } from "../components/logo/quard-mark";

export const metadata: Metadata = { title: "Page not found" };

// A system page: centered column, one sentence, one way out
export default function NotFound() {
    return (
        <div className="quard-system-page">
            <span className="quard-system-kicker">
                <QuardMark size={14} />
                <span className="quard-mono">404</span>
            </span>
            <h1 className="quard-system-title">Page not found</h1>
            <p className="quard-system-text">It may have moved, or the link is wrong.</p>
            <Link href="/" className="quard-button">
                Go to the docs home
            </Link>
        </div>
    );
}
