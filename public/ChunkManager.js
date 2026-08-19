/**
 * Client-side Chunk Manager - Manages chunks received from server
 */
class ClientChunkManager {
    constructor(chunkSize = 32) {
        this.chunkSize = chunkSize;
        this.foregroundChunks = new Map();
        this.backgroundChunks = new Map();
    }

    getChunkKey(chunkX, chunkY) {
        return `${chunkX},${chunkY}`;
    }

    loadChunk(chunkData) {
        if (!chunkData || typeof chunkData.chunkX !== 'number' || typeof chunkData.chunkY !== 'number') {
            return false;
        }

        const key = this.getChunkKey(chunkData.chunkX, chunkData.chunkY);
        if (chunkData.layer === 'background') {
            this.backgroundChunks.set(key, chunkData.data);
        } else {
            this.foregroundChunks.set(key, chunkData.data);
        }
        return true;
    }

    loadChunks(chunksArray) {
        if (!Array.isArray(chunksArray)) return;
        for (const chunk of chunksArray) {
            this.loadChunk(chunk);
        }
    }

    getBlock(gridX, gridY, layer = 'foreground') {
        const chunkX = Math.floor(gridX / this.chunkSize);
        const chunkY = Math.floor(gridY / this.chunkSize);
        const chunkKey = this.getChunkKey(chunkX, chunkY);
        
        const chunks = layer === 'background' ? this.backgroundChunks : this.foregroundChunks;
        if (!chunks.has(chunkKey)) {
            return 0; // AIR - chunk not loaded
        }

        const chunk = chunks.get(chunkKey);
        const localX = gridX - (chunkX * this.chunkSize);
        const localY = gridY - (chunkY * this.chunkSize);

        if (localX < 0 || localX >= this.chunkSize || localY < 0 || localY >= this.chunkSize) {
            return 0;
        }

        return chunk[localY]?.[localX] ?? 0;
    }

    setBlock(gridX, gridY, blockId, layer = 'foreground') {
        const chunkX = Math.floor(gridX / this.chunkSize);
        const chunkY = Math.floor(gridY / this.chunkSize);
        const chunkKey = this.getChunkKey(chunkX, chunkY);

        const chunks = layer === 'background' ? this.backgroundChunks : this.foregroundChunks;
        if (!chunks.has(chunkKey)) {
            return false; // Chunk not loaded
        }

        const chunk = chunks.get(chunkKey);
        const localX = gridX - (chunkX * this.chunkSize);
        const localY = gridY - (chunkY * this.chunkSize);

        if (localX < 0 || localX >= this.chunkSize || localY < 0 || localY >= this.chunkSize) {
            return false;
        }

        chunk[localY][localX] = blockId;
        return true;
    }

    getLoadedChunks() {
        const chunks = [];
        for (const key of this.foregroundChunks.keys()) {
            chunks.push(key);
        }
        return chunks;
    }

    hasChunk(chunkX, chunkY, layer = 'foreground') {
        const key = this.getChunkKey(chunkX, chunkY);
        const chunks = layer === 'background' ? this.backgroundChunks : this.foregroundChunks;
        return chunks.has(key);
    }
}
