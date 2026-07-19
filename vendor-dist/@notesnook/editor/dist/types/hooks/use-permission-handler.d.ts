import { UnionCommands } from "@tiptap/core";
export type Claims = keyof typeof ClaimsMap;
export type PermissionHandlerOptions = {
    claims: Record<Claims, boolean>;
    onPermissionDenied: (claim: Claims, silent: boolean) => void;
};
declare const ClaimsMap: {
    callout: (keyof UnionCommands)[];
    outlineList: (keyof UnionCommands)[];
    taskList: (keyof UnionCommands)[];
    insertAttachment: (keyof UnionCommands)[];
    exportTableAsCsv: (keyof UnionCommands)[];
    importCsvToTable: (keyof UnionCommands)[];
};
export declare function usePermissionHandler(options: PermissionHandlerOptions): void;
export {};
