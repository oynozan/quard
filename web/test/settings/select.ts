import { act, fireEvent, screen } from "@testing-library/react";

// Opens a Base UI select by its accessible name and picks one option.
// jsdom needs the pointer pair before the click for Base UI to commit.
export async function pickOption(select: string, option: string): Promise<void> {
    fireEvent.click(screen.getByRole("combobox", { name: select }));
    await act(async () => {});
    const item = screen.getByRole("option", { name: option });
    fireEvent.pointerDown(item);
    fireEvent.pointerUp(item);
    fireEvent.click(item);
    await act(async () => {});
}
