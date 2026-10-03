// The overview's page title
export function Greeting({ text }: { text: string }) {
    return (
        <h1 className="text-[27px] leading-[1.25] font-extralight tracking-[-0.2px] text-ink-bright max-[1250px]:text-[25px] max-[760px]:max-w-[18ch]">
            {text}
        </h1>
    );
}
