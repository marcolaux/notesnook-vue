import { SubscriptionPlan, User } from "../types.js";
import Database from "./index.js";
import { Period } from "./pricing.js";
export type TransactionStatus = "completed" | "billed" | "paid" | "past_due" | "canceled";
export type TransactionStatusV1 = "completed" | "refunded" | "partially_refunded" | "disputed";
export type TransactionV1 = {
    order_id: string;
    checkout_id: string;
    amount: string;
    currency: string;
    status: TransactionStatusV1;
    created_at: string;
    passthrough: null;
    product_id: number;
    is_subscription: boolean;
    is_one_off: boolean;
    subscription: SubscriptionV1;
    user: User;
    receipt_url: string;
};
type SubscriptionV1 = {
    subscription_id: number;
    status: string;
};
export interface Transaction {
    id: string;
    status: TransactionStatus;
    created_at: Date;
    billed_at: Date;
    details: Details;
}
export interface Details {
    totals: Totals;
    line_items: LineItem[];
}
export interface LineItem {
    id: string;
}
export interface Totals {
    subtotal: number;
    tax: number;
    discount: number;
    total: number;
    grand_total: number;
    balance: number;
    currency_code: string;
}
export default class Subscriptions {
    private readonly db;
    constructor(db: Database);
    cancel(): Promise<void>;
    pause(): Promise<void>;
    resume(): Promise<void>;
    refund(reason?: string): Promise<void>;
    transactions(): Promise<{
        type: "v2";
        transactions: Transaction[];
    } | {
        type: "v1";
        transactions: TransactionV1[];
    } | undefined>;
    invoice(transactionId: string): Promise<string | undefined>;
    updateUrl(): Promise<string | undefined>;
    redeemCode(code: string): Promise<any>;
    checkoutUrl(plan: SubscriptionPlan, period: Period): Promise<string | undefined>;
    preview(productId: string): Promise<any>;
    change(productId: string): Promise<any>;
}
export {};
