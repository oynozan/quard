// A cheap answer that says the dashboard server is up, for the pages that refresh themselves
export function GET() {
    return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
}
