// The search field while the page loads, since results may never come
export function SearchSkeleton() {
    return (
        <div>
            <div aria-hidden className="flex max-w-[860px] gap-2 max-[760px]:flex-col">
                <span className="h-[46px] min-w-0 flex-1 rounded-md bg-control max-[760px]:flex-none" />
                <span className="h-[46px] w-[112px] rounded-md bg-nav-hover" />
            </div>
            <p role="status" className="sr-only">
                Searching runs…
            </p>
        </div>
    );
}
