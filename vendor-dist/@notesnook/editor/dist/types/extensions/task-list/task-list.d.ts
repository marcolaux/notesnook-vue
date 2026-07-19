type TaskListStats = {
    checked: number;
    total: number;
};
export type TaskListAttributes = {
    title: string;
    readonly: boolean;
    stats: TaskListStats;
};
export declare const TaskListNode: import("@tiptap/core").Node<import("@tiptap/extension-task-list").TaskListOptions, any>;
export {};
