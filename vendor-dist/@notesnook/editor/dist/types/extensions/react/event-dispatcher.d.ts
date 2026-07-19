import { PluginKey } from "prosemirror-state";
export interface Listeners<T> {
    [name: string]: Set<Listener<T>>;
}
export type Listener<T = never> = (data: T) => void;
export type Dispatch<T = never> = (eventName: PluginKey | string, data: T) => void;
export declare class EventDispatcher<T = never> {
    private listeners;
    on(event: string, cb: Listener<T>): void;
    off(event: string, cb: Listener<T>): void;
    emit(event: string, data: T): void;
    destroy(): void;
}
