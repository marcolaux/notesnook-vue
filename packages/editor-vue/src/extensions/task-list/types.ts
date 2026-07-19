export type TaskListStats = { checked: number; total: number };

export type TaskListAttributes = {
  title: string;
  readonly: boolean;
  stats: TaskListStats;
};