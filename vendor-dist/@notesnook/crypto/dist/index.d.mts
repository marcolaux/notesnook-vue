import { ISodium, StringOutputFormat, Uint8ArrayOutputFormat } from "@notesnook/sodium";

//#region src/types.d.ts
type DataFormat = Uint8ArrayOutputFormat | StringOutputFormat;
type Cipher<TFormat extends DataFormat> = {
  format: TFormat;
  alg: string;
  cipher: Output<TFormat>;
  iv: string;
  salt: string;
  length: number;
};
type Output<TFormat extends DataFormat> = TFormat extends StringOutputFormat ? string : Uint8Array;
type Input<TFormat extends DataFormat> = Output<TFormat>;
type SerializedKey = {
  password?: string;
  key?: string;
  salt?: string;
};
type EncryptionKey = {
  key: Uint8Array;
  salt: string;
};
type Chunk = {
  data: Uint8Array;
  final: boolean;
};
type EncryptionKeyPair = {
  publicKey: Uint8Array;
  privateKey: Uint8Array;
};
type SerializedKeyPair = {
  publicKey: string;
  privateKey: string;
};
//#endregion
//#region src/decryption.d.ts
declare class Decryption {
  private static transformInput;
  static decrypt<TOutputFormat extends DataFormat>(sodium: ISodium, key: SerializedKey, cipherData: Cipher<DataFormat>, outputFormat?: TOutputFormat): Output<TOutputFormat>;
  static createStream(sodium: ISodium, header: string, key: SerializedKey): TransformStream<Uint8Array, Uint8Array>;
}
//#endregion
//#region src/interfaces.d.ts
interface IStreamable {
  read(): Promise<Chunk | undefined>;
  write(chunk: Chunk | undefined): Promise<void>;
}
interface INNCrypto {
  encrypt<TOutputFormat extends DataFormat>(key: SerializedKey, data: Input<DataFormat>, format: DataFormat, outputFormat?: TOutputFormat): Promise<Cipher<TOutputFormat>>;
  encryptMulti<TOutputFormat extends DataFormat>(key: SerializedKey, data: Input<DataFormat>[], format: DataFormat, outputFormat?: TOutputFormat): Promise<Cipher<TOutputFormat>[]>;
  decrypt<TOutputFormat extends DataFormat>(key: SerializedKey, cipherData: Cipher<DataFormat>, outputFormat?: TOutputFormat): Promise<Output<TOutputFormat>>;
  decryptMulti<TOutputFormat extends DataFormat>(key: SerializedKey, cipherData: Cipher<DataFormat>[], outputFormat?: TOutputFormat): Promise<Output<TOutputFormat>[]>;
  hash(password: string, salt: string): Promise<string>;
  deriveKey(password: string, salt?: string): Promise<EncryptionKey>;
  deriveKeyPair(): Promise<EncryptionKeyPair>;
  exportKey(password: string, salt?: string): Promise<SerializedKey>;
  exportKeyPair(): Promise<SerializedKeyPair>;
  createEncryptionStream(key: SerializedKey): Promise<{
    iv: string;
    stream: TransformStream<Chunk, Uint8Array>;
  }>;
  createDecryptionStream(key: SerializedKey, iv: string): Promise<TransformStream<Uint8Array, Uint8Array>>;
}
//#endregion
//#region src/index.d.ts
declare class NNCrypto implements INNCrypto {
  private isReady;
  private sodium;
  private init;
  encrypt<TOutputFormat extends DataFormat>(key: SerializedKey, input: Input<DataFormat>, format: DataFormat, outputFormat?: TOutputFormat): Promise<Cipher<TOutputFormat>>;
  encryptMulti<TOutputFormat extends DataFormat>(key: SerializedKey, items: Input<DataFormat>[], format: DataFormat, outputFormat?: TOutputFormat): Promise<Cipher<TOutputFormat>[]>;
  decrypt<TOutputFormat extends DataFormat>(key: SerializedKey, cipherData: Cipher<DataFormat>, outputFormat?: TOutputFormat): Promise<Output<TOutputFormat>>;
  decryptMulti<TOutputFormat extends DataFormat>(key: SerializedKey, items: Cipher<DataFormat>[], outputFormat?: TOutputFormat): Promise<Output<TOutputFormat>[]>;
  hash(password: string, salt: string): Promise<string>;
  deriveKey(password: string, salt?: string): Promise<EncryptionKey>;
  deriveKeyPair(): Promise<EncryptionKeyPair>;
  exportKey(password: string, salt?: string): Promise<SerializedKey>;
  exportKeyPair(): Promise<SerializedKeyPair>;
  createEncryptionStream(key: SerializedKey): Promise<{
    iv: string;
    stream: TransformStream<Chunk, Uint8Array<ArrayBufferLike>>;
  }>;
  createDecryptionStream(key: SerializedKey, iv: string): Promise<TransformStream<Uint8Array<ArrayBufferLike>, Uint8Array<ArrayBufferLike>>>;
}
//#endregion
export { Chunk, Cipher, DataFormat, Decryption, EncryptionKey, EncryptionKeyPair, INNCrypto, IStreamable, Input, NNCrypto, Output, SerializedKey, SerializedKeyPair };