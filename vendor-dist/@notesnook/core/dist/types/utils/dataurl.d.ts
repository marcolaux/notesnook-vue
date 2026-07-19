declare function toObject(dataurl: string): {
    mimeType?: string;
    data?: string;
};
declare function fromObject({ mimeType, data }: {
    mimeType: string;
    data: string;
}): string;
declare function isValid(url: string): boolean;
declare const dataurl: {
    toObject: typeof toObject;
    fromObject: typeof fromObject;
    isValid: typeof isValid;
};
export default dataurl;
