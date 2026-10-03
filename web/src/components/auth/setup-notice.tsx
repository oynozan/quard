// Shown until every sign-in setting is valid. The dashboard stays closed meanwhile. Production
// visitors only learn that sign-in is unavailable; the details go to the server log.
export function SetupNotice({ problems }: { problems: string[] }) {
    if (problems.length === 0) {
        return (
            <>
                <h1 className="text-[23px] leading-[1.3] font-extralight tracking-[-0.2px] text-ink">
                    Sign-in is not available
                </h1>
                <p className="mt-3 text-[13px] text-ink-2">Try again later.</p>
            </>
        );
    }
    return (
        <>
            <h1 className="text-[23px] leading-[1.3] font-extralight tracking-[-0.2px] text-ink">
                Sign-in is not set up
            </h1>
            <p className="mt-3 text-[13px] text-ink-2">Fix these on the server, then restart.</p>
            <ul className="mt-4 flex flex-col gap-[6px]">
                {problems.map((problem) => (
                    <li key={problem} className="mono rounded-sm bg-recess px-[10px] py-[7px] text-[12px] text-ink">
                        {problem}
                    </li>
                ))}
            </ul>
        </>
    );
}
