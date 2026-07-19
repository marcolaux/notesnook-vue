export type EventManagerSubscription = {
    unsubscribe: () => boolean;
};
export type EventHandler = (...args: any[]) => any;
export type EventProperties = {
    name: string;
    once?: boolean;
};
export declare class EventManager {
    _registry: Map<EventHandler, EventProperties>;
    constructor();
    unsubscribeAll(): void;
    subscribeMulti(names: string[], handler: EventHandler, thisArg: any): {
        unsubscribe: () => boolean;
    }[];
    subscribe(name: string, handler: EventHandler, once?: boolean): {
        unsubscribe: () => boolean;
    };
    subscribeSingle(name: string, handler: EventHandler): {
        unsubscribe: () => boolean;
    };
    unsubscribe(_name: string, handler: EventHandler): boolean;
    publish(name: string, ...args: any[]): void;
    publishWithResult<T = unknown>(name: string, ...args: any[]): Promise<T[] | boolean>;
    remove(...names: string[]): void;
}
export default EventManager;
