/**
 * ChunkManager - Manages chunked world data for efficient bandwidth usage
 * Divides world into 32x32 chunks for spatial optimization
 */

class ChunkManager {
    constructor(worldWidth, worldHeight, chunkSize = 32) {
        this.worldWidth = worldWidth;
        this.worldHeight = worldHeight;
        this.chunkSize = chunkSize;
        
        // Calculate grid dimensions
        this.chunksX = Math.ceil(worldWidth / chunkSize);
        this.chunksY = Math.ceil(worldHeight / chunkSize);
        
        // Store chunks: Map<"chunkX,chunkY", chunkData>
        this.foregroundChunks = new Map();
        this.backgroundChunks = new Map();
    }

    /**
     * Get chunk key from coordinates
     */
    getChunkKey(chunkX, chunkY) {
        return `${chunkX},${chunkY}`;
    }

    /**
     * Get chunk coordinates from world grid coordinates
     */
    getChunkCoords(gridX, gridY) {
        return {
            chunkX: Math.floor(gridX / this.chunkSize),
            chunkY: Math.floor(gridY / this.chunkSize)
        };
    }

    /**
     * Initialize chunk from full world grids
     */
    initializeFromWorld(world, backgroundWorld) {
        for (let cy = 0; cy < this.chunksY; cy++) {
            for (let cx = 0; cx < this.chunksX; cx++) {
                this.loadChunkFromGrid(cx, cy, world, backgroundWorld);
            }
        }
    }

    /**
     * Load a single chunk from grid data
     */
    loadChunkFromGrid(chunkX, chunkY, world, backgroundWorld) {
        const chunkKey = this.getChunkKey(chunkX, chunkY);
        const chunk = Array.from({ length: this.chunkSize }, () => 
            new Array(this.chunkSize).fill(0)
        );
        const bgChunk = Array.from({ length: this.chunkSize }, () => 
            new Array(this.chunkSize).fill(0)
        );

        const startX = chunkX * this.chunkSize;
        const startY = chunkY * this.chunkSize;
        const endX = Math.min(startX + this.chunkSize, this.worldWidth);
        const endY = Math.min(startY + this.chunkSize, this.worldHeight);

        for (let gy = startY; gy < endY; gy++) {
            for (let gx = startX; gx < endX; gx++) {
                const localX = gx - startX;
                const localY = gy - startY;
                chunk[localY][localX] = world[gy][gx];
                bgChunk[localY][localX] = backgroundWorld[gy][gx];
            }
        }

        this.foregroundChunks.set(chunkKey, chunk);
        this.backgroundChunks.set(chunkKey, bgChunk);
    }

    /**
     * Get block from chunk data
     */
    getBlock(gridX, gridY, layer = 'foreground') {
        if (gridX < 0 || gridX >= this.worldWidth || gridY < 0 || gridY >= this.worldHeight) {
            return 0; // AIR
        }

        const { chunkX, chunkY } = this.getChunkCoords(gridX, gridY);
        const chunkKey = this.getChunkKey(chunkX, chunkY);
        const chunks = layer === 'background' ? this.backgroundChunks : this.foregroundChunks;
        
        if (!chunks.has(chunkKey)) return 0;

        const chunk = chunks.get(chunkKey);
        const localX = gridX - (chunkX * this.chunkSize);
        const localY = gridY - (chunkY * this.chunkSize);

        return chunk[localY]?.[localX] ?? 0;
    }

    /**
     * Set block in chunk data
     */
    setBlock(gridX, gridY, blockId, layer = 'foreground') {
        if (gridX < 0 || gridX >= this.worldWidth || gridY < 0 || gridY >= this.worldHeight) {
            return false;
        }

        const { chunkX, chunkY } = this.getChunkCoords(gridX, gridY);
        const chunkKey = this.getChunkKey(chunkX, chunkY);
        const chunks = layer === 'background' ? this.backgroundChunks : this.foregroundChunks;

        if (!chunks.has(chunkKey)) return false;

        const chunk = chunks.get(chunkKey);
        const localX = gridX - (chunkX * this.chunkSize);
        const localY = gridY - (chunkY * this.chunkSize);

        chunk[localY][localX] = blockId;
        return true;
    }

    /**
     * Get all chunks visible from player position
     * Includes a buffer zone around viewport for smoother transitions
     */
    getVisibleChunks(playerGridX, playerGridY, viewportWidth, viewportHeight, bufferTiles = 32) {
        const { chunkX: centerChunkX, chunkY: centerChunkY } = this.getChunkCoords(playerGridX, playerGridY);
        
        // Calculate how many chunks are visible based on viewport size
        const tilesVisibleX = Math.ceil(viewportWidth / 32); // 32 = BLOCK_SIZE
        const tilesVisibleY = Math.ceil(viewportHeight / 32);
        const chunksVisibleX = Math.ceil(tilesVisibleX / this.chunkSize);
        const chunksVisibleY = Math.ceil(tilesVisibleY / this.chunkSize);

        const bufferedChunkRange = Math.ceil(bufferTiles / this.chunkSize);
        const visibleChunks = [];

        for (let cy = centerChunkY - bufferedChunkRange - chunksVisibleY; cy <= centerChunkY + bufferedChunkRange + chunksVisibleY; cy++) {
            for (let cx = centerChunkX - bufferedChunkRange - chunksVisibleX; cx <= centerChunkX + bufferedChunkRange + chunksVisibleX; cx++) {
                if (cx >= 0 && cx < this.chunksX && cy >= 0 && cy < this.chunksY) {
                    visibleChunks.push({ chunkX: cx, chunkY: cy });
                }
            }
        }

        return visibleChunks;
    }

    /**
     * Serialize chunk for network transmission
     */
    serializeChunk(chunkX, chunkY, layer = 'foreground') {
        const chunkKey = this.getChunkKey(chunkX, chunkY);
        const chunks = layer === 'background' ? this.backgroundChunks : this.foregroundChunks;
        
        if (!chunks.has(chunkKey)) return null;

        const chunk = chunks.get(chunkKey);
        return {
            chunkX,
            chunkY,
            layer,
            data: chunk
        };
    }

    /**
     * Get all chunks as serialized data (for full world sync)
     */
    getAllChunks() {
        const chunks = [];
        for (let cy = 0; cy < this.chunksY; cy++) {
            for (let cx = 0; cx < this.chunksX; cx++) {
                chunks.push(this.serializeChunk(cx, cy, 'foreground'));
                chunks.push(this.serializeChunk(cx, cy, 'background'));
            }
        }
        return chunks;
    }
}

module.exports = ChunkManager;
