import { Step, StepResult } from "@tiptap/pm/transform";
import { Node, Schema } from "@tiptap/pm/model";
import { Mapping } from "@tiptap/pm/transform";
export interface AttributeUpdate {
    pos: number;
    attrName: string;
    value: any;
}
export declare class BatchAttributeStep extends Step {
    updates: AttributeUpdate[];
    constructor(updates: AttributeUpdate[]);
    apply(doc: Node): StepResult;
    private updateContent;
    invert(doc: Node): Step;
    map(mapping: Mapping): Step | null;
    toJSON(): {
        stepType: string;
        updates: AttributeUpdate[];
    };
    static fromJSON(_: Schema, json: any): BatchAttributeStep;
}
