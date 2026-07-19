//#region src/filestreamsource.ts
var FileStreamSource = class {
	constructor(storage, file, chunks) {
		this.storage = storage;
		this.file = file;
		this.chunks = chunks;
		this.index = 0;
	}
	start() {}
	async pull(controller) {
		const data = await this.readChunk(this.index++);
		if (data) controller.enqueue(data);
		if (this.index === this.chunks.length || !data) controller.close();
	}
	readChunk(index) {
		if (index > this.chunks.length) return;
		return this.storage.readChunk(this.chunks[index]);
	}
};

//#endregion
//#region src/utils.ts
function chunkPrefix(filename) {
	return `${filename}-chunk-`;
}

//#endregion
//#region src/filehandle.ts
var FileHandle = class {
	constructor(storage, file, chunks) {
		this.storage = storage;
		this.file = file;
		this.chunks = chunks;
	}
	get readable() {
		return new ReadableStream(new FileStreamSource(this.storage, this.file, this.chunks));
	}
	get writeable() {
		return new WritableStream({
			write: async (chunk, controller) => {
				if (controller.signal.aborted) return;
				const lastOffset = this.lastOffset();
				await this.storage.writeChunk(this.getChunkKey(lastOffset + 1), chunk);
				this.chunks.push(this.getChunkKey(lastOffset + 1));
			},
			abort: async () => {
				for (const chunk of this.chunks) await this.storage.deleteChunk(chunk);
			}
		});
	}
	async writeChunkAtOffset(offset, chunk) {
		await this.storage.writeChunk(this.getChunkKey(offset), chunk);
	}
	async addAdditionalData(key, value) {
		this.file.additionalData = this.file.additionalData || {};
		this.file.additionalData[key] = value;
		await this.storage.setMetadata(this.file.filename, this.file);
	}
	async delete() {
		for (const chunk of this.chunks) await this.storage.deleteChunk(chunk);
		await this.storage.deleteMetadata(this.file.filename);
	}
	getChunkKey(offset) {
		return `${chunkPrefix(this.file.filename)}${offset}`;
	}
	async readChunk(offset) {
		return await this.storage.readChunk(this.getChunkKey(offset)) || null;
	}
	async readChunks(from, length) {
		const blobParts = [];
		for (let i = from; i < from + length; ++i) {
			const array = await this.readChunk(i);
			if (!array) throw new Error(`No data found for chunk at offset ${i}.`);
			blobParts.push(array.buffer);
		}
		return new Blob(blobParts, { type: this.file.type });
	}
	async toBlob() {
		const blobParts = [];
		for (const chunk of this.chunks) {
			const array = await this.storage.readChunk(chunk);
			if (!array) continue;
			blobParts.push(array.buffer);
		}
		return new Blob(blobParts, { type: this.file.type });
	}
	async size() {
		let size = 0;
		for (const chunk of this.chunks) {
			const length = await this.storage.chunkSize(chunk);
			if (!length) throw new Error(`Found 0 byte sized chunk.`);
			size += length;
		}
		return size;
	}
	async listChunks() {
		return (await this.storage.listChunks(chunkPrefix(this.file.filename))).sort((a, b) => a.localeCompare(b, void 0, { numeric: true }));
	}
	lastOffset() {
		const lastChunk = this.chunks.at(-1);
		if (!lastChunk) return -1;
		return parseInt(lastChunk.replace(chunkPrefix(this.file.filename), ""));
	}
};

//#endregion
//#region src/index.ts
var StreamableFS = class {
	/**
	* @param db name of the indexeddb database
	*/
	constructor(storage) {
		this.storage = storage;
	}
	async createFile(filename, size, type, options) {
		const exists = await this.exists(filename);
		if (!options?.overwrite && exists) throw new Error("File already exists.");
		else if (options?.overwrite && exists) await this.deleteFile(filename);
		const file = {
			filename,
			size,
			type
		};
		await this.storage.setMetadata(filename, file);
		return new FileHandle(this.storage, file, []);
	}
	async readFile(filename) {
		const file = await this.storage.getMetadata(filename);
		if (!file) return void 0;
		const chunks = (await this.storage.listChunks(chunkPrefix(filename))).sort((a, b) => a.localeCompare(b, void 0, { numeric: true }));
		return new FileHandle(this.storage, file, chunks);
	}
	async exists(filename) {
		return !!await this.storage.getMetadata(filename);
	}
	async list() {
		return this.storage.list();
	}
	async deleteFile(filename) {
		const handle = await this.readFile(filename);
		if (!handle) return true;
		await handle.delete();
		return true;
	}
	async bulkDeleteFiles(filenames) {
		for (const filename of filenames) await this.deleteFile(filename);
		return true;
	}
	async moveFile(source, dest) {
		await source.readable.pipeTo(dest.writeable);
		await source.delete();
	}
	async clear() {
		await this.storage.clear();
	}
};

//#endregion
export { StreamableFS };