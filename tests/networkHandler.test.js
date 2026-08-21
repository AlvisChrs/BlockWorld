const NetworkHandler = require('../services/NetworkHandler');

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

/** Build a minimal NetworkHandler instance without real Socket.IO */
function makeHandler(playersObj = {}) {
    return new NetworkHandler({
        io: null,     // not needed for the methods under test
        logger: {
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
        },
        players: playersObj,
    });
}

// ─────────────────────────────────────────────
// createRateLimiter
// ─────────────────────────────────────────────
describe('NetworkHandler.createRateLimiter', () => {
    test('allows requests that are under the limit', () => {
        const handler = makeHandler();
        const limiter = handler.createRateLimiter(3, 1000); // max 3 per second

        expect(limiter('socket-1')).toBe(true);
        expect(limiter('socket-1')).toBe(true);
        expect(limiter('socket-1')).toBe(true);
    });

    test('blocks requests that exceed the max limit', () => {
        const handler = makeHandler();
        const limiter = handler.createRateLimiter(3, 1000);

        limiter('socket-2'); // 1
        limiter('socket-2'); // 2
        limiter('socket-2'); // 3
        // 4th request should be blocked (count 4 > maxRequests 3)
        expect(limiter('socket-2')).toBe(false);
        expect(limiter('socket-2')).toBe(false);
    });

    test('treats different socket IDs independently', () => {
        const handler = makeHandler();
        const limiter = handler.createRateLimiter(2, 1000);

        limiter('A'); // A: 1
        limiter('A'); // A: 2
        expect(limiter('A')).toBe(false); // A: 3 > 2, blocked

        // Socket B is a fresh record — should still be allowed
        expect(limiter('B')).toBe(true);
        expect(limiter('B')).toBe(true);
    });

    test('resets count after the time window expires', async () => {
        const handler = makeHandler();
        const windowMs = 50; // very short window for testing
        const limiter = handler.createRateLimiter(2, windowMs);

        limiter('socket-3'); // 1
        limiter('socket-3'); // 2
        expect(limiter('socket-3')).toBe(false); // 3 > 2, blocked

        // Wait for the window to expire
        await new Promise(resolve => setTimeout(resolve, windowMs + 10));

        // After window reset, should be allowed again
        expect(limiter('socket-3')).toBe(true);
        expect(limiter('socket-3')).toBe(true);
    });

    test('first request to a new socket ID is always allowed', () => {
        const handler = makeHandler();
        const limiter = handler.createRateLimiter(100, 1000);
        expect(limiter('brand-new-socket')).toBe(true);
    });
});

// ─────────────────────────────────────────────
// getHealth
// ─────────────────────────────────────────────
describe('NetworkHandler.getHealth', () => {
    test('returns an object with the expected shape', () => {
        const players = { p1: {}, p2: {}, p3: {} };
        const handler = makeHandler(players);

        const health = handler.getHealth();

        expect(health).toHaveProperty('connectedClients');
        expect(health).toHaveProperty('uptime');
        expect(health).toHaveProperty('memory');
        expect(health).toHaveProperty('timestamp');
    });

    test('connectedClients reflects the number of players', () => {
        const players = { p1: {}, p2: {} };
        const handler = makeHandler(players);

        expect(handler.getHealth().connectedClients).toBe(2);
    });

    test('returns 0 connected clients when players object is empty', () => {
        const handler = makeHandler({});
        expect(handler.getHealth().connectedClients).toBe(0);
    });

    test('uptime is a non-negative number', () => {
        const handler = makeHandler();
        const { uptime } = handler.getHealth();
        expect(typeof uptime).toBe('number');
        expect(uptime).toBeGreaterThanOrEqual(0);
    });

    test('memory contains expected Node.js memory fields', () => {
        const handler = makeHandler();
        const { memory } = handler.getHealth();
        expect(memory).toHaveProperty('rss');
        expect(memory).toHaveProperty('heapTotal');
        expect(memory).toHaveProperty('heapUsed');
    });

    test('timestamp is a valid ISO 8601 string', () => {
        const handler = makeHandler();
        const { timestamp } = handler.getHealth();
        expect(typeof timestamp).toBe('string');
        expect(() => new Date(timestamp)).not.toThrow();
        expect(new Date(timestamp).toISOString()).toBe(timestamp);
    });
});
