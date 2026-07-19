import { Node as ProseNode, Mark, Slice, NodeType, MarkType, Fragment } from "prosemirror-model";
type TypedNode<T extends string> = ProseNode & {
    type: NodeType & {
        name: T;
    };
};
type TypedMark<T extends string> = Mark & {
    type: MarkType & {
        name: T;
    };
};
type NodeSerializer<T extends string> = (node: TypedNode<T>) => string;
type MarkSerializer<T extends string> = (mark: TypedMark<T>) => string;
declare class ProseMirrorTextSerializer {
    nodes: {
        [name: string]: NodeSerializer<string> | undefined;
    };
    marks: {
        [name: string]: MarkSerializer<string> | undefined;
    };
    constructor(fns: {
        nodes?: {
            [name: string]: NodeSerializer<string> | undefined;
        };
        marks?: {
            [name: string]: MarkSerializer<string> | undefined;
        };
    }, base?: ProseMirrorTextSerializer);
    serializeFragment(fragment: Fragment): string;
    serializeSlice(slice: Slice): string;
    serializeNode(node: ProseNode): string | null;
}
export declare const mathSerializer: ProseMirrorTextSerializer;
export {};
