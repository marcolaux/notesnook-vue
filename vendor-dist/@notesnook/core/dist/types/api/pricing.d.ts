import { SubscriptionPlan, SubscriptionPlanId } from "../types.js";
export type SKUResponse = {
    country: string;
    countryCode: string;
    sku?: string;
    discount: number;
};
export interface PlanPrice {
    gross: number;
    net: number;
    tax: number;
    currency?: string;
}
export type Period = "monthly" | "yearly" | "5-year";
export type Discount = {
    type: "regional" | "promo";
    code?: string;
    recurring: boolean;
    amount: number;
};
export interface Plan {
    plan: SubscriptionPlan;
    recurring: boolean;
    id: string;
    name?: string;
    period: Period;
    price: PlanPrice;
    currency: string;
    currencySymbol?: string;
    originalPrice?: PlanPrice;
    discount?: Discount;
    country: string;
}
export declare class Pricing {
    static sku(platform: "google" | "apple" | "paddle" | "paddleNoTrial", period: Period, plan: SubscriptionPlanId): Promise<SKUResponse>;
    static products(trialsAvailed?: SubscriptionPlan[]): Promise<Plan[]>;
}
