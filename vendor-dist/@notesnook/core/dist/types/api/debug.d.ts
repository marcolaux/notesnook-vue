export type IssueReportResponse = {
    error: string;
} | {
    url: string;
    type: "issue" | "discussion";
} | {
    type: "email";
};
export declare class Debug {
    static report(reportData: {
        title: string;
        body: string;
        userId?: string;
    }): Promise<IssueReportResponse | undefined>;
}
