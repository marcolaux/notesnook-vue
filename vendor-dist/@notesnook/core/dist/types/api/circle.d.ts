import Database from "./index.js";
export type CirclePartner = {
    id: string;
    name: string;
    url: string;
    logoBase64: string;
    shortDescription: string;
    longDescription: string;
    offerDescription: string;
    codeRedeemUrl?: string;
};
export declare class Circle {
    private readonly db;
    constructor(db: Database);
    partners(): Promise<CirclePartner[] | undefined>;
    redeem(partnerId: string): Promise<{
        code?: string;
    } | undefined>;
}
