import { FunctionComponent, PropsWithChildren } from "react";
import { EventDispatcher } from "./event-dispatcher.js";
import { Root } from "react-dom/client";
export type BasePortalProviderProps = PropsWithChildren<unknown>;
export type Portals = Map<HTMLElement, MountedPortal>;
export interface MountedPortal {
    key: string;
    Component: FunctionComponent;
}
export type PortalRendererState = {
    portals: Portals;
};
export declare class PortalProviderAPI extends EventDispatcher<Portals> {
    portals: Map<HTMLElement, MountedPortal>;
    roots: Map<HTMLElement, Root>;
    constructor();
    render(Component: FunctionComponent, container: HTMLElement): void;
    remove(container: HTMLElement): void;
}
