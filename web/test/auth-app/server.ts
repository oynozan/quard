import { isValidElement, type ReactElement, type ReactNode } from "react";

type Props = { children?: ReactNode } & Record<string, unknown>;

const isAsync = (type: unknown) => typeof type === "function" && type.constructor.name === "AsyncFunction";

// The client renderer cannot run async server components, so this awaits them first, as Next does
export async function resolveServer(node: ReactNode): Promise<ReactNode> {
    if (Array.isArray(node)) return Promise.all(node.map(resolveServer));
    if (!isValidElement(node)) return node;
    const element = node as ReactElement<Props>;
    if (isAsync(element.type)) {
        const render = element.type as (props: Props) => Promise<ReactNode>;
        return resolveServer(await render(element.props));
    }
    if (element.props.children === undefined) return element;
    const children = await resolveServer(element.props.children);
    return { ...element, props: { ...element.props, children } } as ReactElement;
}
