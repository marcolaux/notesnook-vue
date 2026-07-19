type RequestBody = Record<string, string | number | boolean | undefined> | null;
type JsonRequestBody = Record<string, unknown> | null;
declare function get(url: string, token?: string): Promise<any>;
declare function deleteRequest(url: string, token?: string): Promise<any>;
declare function patch(url: string, data: RequestBody, token?: string): Promise<any>;
declare namespace patch {
    var json: (url: string, data: JsonRequestBody, token?: string) => Promise<any>;
}
declare function post(url: string, data: RequestBody, token?: string): Promise<any>;
declare namespace post {
    var json: (url: string, data: JsonRequestBody, token?: string) => Promise<any>;
}
declare const _default: {
    get: typeof get;
    post: typeof post;
    delete: typeof deleteRequest;
    patch: typeof patch;
};
export default _default;
export declare function errorTransformer(errorJson: {
    error?: string;
    errors?: string[];
    error_description?: string;
    data?: string;
}): {
    description: string;
    code: string;
    data: any;
};
export declare class RequestError extends Error {
    code: string;
    data: unknown;
    constructor(error: {
        code: string;
        data: unknown;
        description: string;
    });
}
