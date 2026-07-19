export declare function isServerCompatible(version: number): version is 1;
export declare const hosts: {
    API_HOST: string;
    AUTH_HOST: string;
    SSE_HOST: string;
    SUBSCRIPTIONS_HOST: string;
    ISSUES_HOST: string;
    MONOGRAPH_HOST: string;
    NOTESNOOK_HOST: string;
};
export default hosts;
export declare const getServerNameFromHost: (host: string) => string;
