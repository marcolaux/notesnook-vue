import TokenManager from "./token-manager.js";
declare class MFAManager {
    private readonly tokenManager;
    constructor(tokenManager: TokenManager);
    setup(type: "app" | "sms" | "email", phoneNumber?: string): Promise<any>;
    enable(type: "app" | "sms" | "email", code: string): Promise<any>;
    /**
     *
     * @param {"app" | "sms" | "email"} type
     * @param {string} code
     * @returns
     */
    enableFallback(type: "app" | "sms" | "email", code: string): Promise<any>;
    _enable(type: "app" | "sms" | "email", code: string, isFallback: boolean): Promise<any>;
    disable(): Promise<any>;
    codes(): Promise<any>;
    sendCode(method: "sms" | "email"): Promise<any>;
}
export default MFAManager;
