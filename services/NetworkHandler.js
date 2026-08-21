/**
 * Network Error Handler - Handle disconnections, timeouts, dan errors
 */

class NetworkHandler {
    constructor(options = {}) {
        this.io = options.io;
        this.logger = options.logger || console;
        this.reconnectTimeout = options.reconnectTimeout || 30000; // 30 detik
        this.maxReconnectAttempts = options.maxReconnectAttempts || 5;
        this.players = options.players || {};
    }

    /**
     * Setup error handlers
     */
    setupErrorHandlers() {
        // Handle server errors
        this.io.engine.on('connection_error', (error) => {
            this.logger.error('Connection error', { 
                message: error.message,
                code: error.code
            });
        });

        this.io.on('connect_error', (error) => {
            this.logger.warn('Client connection error', { error: error.message });
        });

        process.on('uncaughtException', (error) => {
            this.logger.error('Uncaught exception', { 
                message: error.message,
                stack: error.stack
            });
            // Graceful shutdown
            this.gracefulShutdown();
        });

        process.on('unhandledRejection', (reason, promise) => {
            this.logger.error('Unhandled rejection', { reason });
        });
    }

    /**
     * Handle client disconnect dengan cleanup
     */
    handleDisconnect(socket, playerId) {
        return (reason) => {
            this.logger.info('Player disconnected', { 
                playerId, 
                reason,
                socketId: socket.id
            });

            if (!this.players[playerId]) return;

            const player = this.players[playerId];
            
            // Save player state untuk reconnect window
            player.lastDisconnect = Date.now();
            player.disconnectReason = reason;
            player.lastSocketId = socket.id;

            // Set timeout untuk cleanup (player bisa reconnect dalam waktu ini)
            const disconnectTimer = setTimeout(() => {
                if (this.players[playerId] && 
                    this.players[playerId].lastDisconnect === player.lastDisconnect) {
                    // Player belum reconnect, cleanup
                    delete this.players[playerId];
                    this.logger.info('Player cleanup after timeout', { playerId });
                    this.io.emit('player_left', playerId);
                }
            }, this.reconnectTimeout);

            player.disconnectTimer = disconnectTimer;
        };
    }

    /**
     * Handle reconnection
     */
    handleReconnect(socket, playerId, playerData) {
        return (callback) => {
            const player = this.players[playerId];
            
            if (!player) {
                this.logger.warn('Reconnect attempt for unknown player', { playerId });
                callback({ success: false, reason: 'Player session expired' });
                return;
            }

            // Clear disconnect timer
            if (player.disconnectTimer) {
                clearTimeout(player.disconnectTimer);
                delete player.disconnectTimer;
            }

            // Update socket reference
            player.socketId = socket.id;
            delete player.lastSocketId;
            delete player.lastDisconnect;

            this.logger.info('Player reconnected', { playerId, socketId: socket.id });

            callback({
                success: true,
                playerData: {
                    id: player.id,
                    x: player.x,
                    y: player.y,
                    hp: player.hp,
                    inventory: player.inventory
                }
            });
        };
    }

    /**
     * Socket error handling
     */
    setupSocketErrorHandling(socket) {
        socket.on('error', (error) => {
            this.logger.error('Socket error', { 
                socketId: socket.id,
                error: error.message
            });
        });

        socket.on('disconnect_error', (error) => {
            this.logger.error('Disconnect error', {
                socketId: socket.id,
                error: error.message
            });
        });
    }

    /**
     * Rate limiting per socket
     */
    createRateLimiter(maxRequests = 100, windowMs = 1000) {
        const limits = new Map();

        return (socketId) => {
            const now = Date.now();
            let record = limits.get(socketId);

            if (!record) {
                record = { count: 1, resetTime: now + windowMs };
                limits.set(socketId, record);
                return true;
            }

            if (now > record.resetTime) {
                record.count = 1;
                record.resetTime = now + windowMs;
                return true;
            }

            record.count++;
            if (record.count > maxRequests) {
                return false; // Rate limit exceeded
            }

            return true;
        };
    }

    /**
     * Graceful shutdown
     */
    async gracefulShutdown() {
        this.logger.info('Starting graceful shutdown...');

        // Disconnect semua clients dengan pesan
        this.io.emit('serverShutdown', { 
            message: 'Server sedang shutdown, progress Anda akan disimpan',
            timeout: 5000 
        });

        // Tunggu beberapa detik untuk cleanup
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Close server
        this.io.close();

        process.exit(0);
    }

    /**
     * Health check untuk monitoring
     */
    getHealth() {
        return {
            connectedClients: Object.keys(this.players).length,
            uptime: process.uptime(),
            memory: process.memoryUsage(),
            timestamp: new Date().toISOString()
        };
    }
}

module.exports = NetworkHandler;
