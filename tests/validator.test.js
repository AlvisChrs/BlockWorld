const Validator = require('../utils/Validator');

// ─────────────────────────────────────────────
// isValidBlockId
// ─────────────────────────────────────────────
describe('Validator.isValidBlockId', () => {
    const validIds = new Set([1, 2, 3, 10, 99]);

    test('returns true for a valid integer id in the set', () => {
        expect(Validator.isValidBlockId(1, validIds)).toBe(true);
        expect(Validator.isValidBlockId(99, validIds)).toBe(true);
    });

    test('returns false for an integer not in the set', () => {
        expect(Validator.isValidBlockId(5, validIds)).toBe(false);
        expect(Validator.isValidBlockId(100, validIds)).toBe(false);
    });

    test('returns false for a non-integer (float, string, null)', () => {
        expect(Validator.isValidBlockId(1.5, validIds)).toBe(false);
        expect(Validator.isValidBlockId('1', validIds)).toBe(false);
        expect(Validator.isValidBlockId(null, validIds)).toBe(false);
        expect(Validator.isValidBlockId(undefined, validIds)).toBe(false);
    });
});

// ─────────────────────────────────────────────
// isValidCoordinate
// ─────────────────────────────────────────────
describe('Validator.isValidCoordinate', () => {
    const W = 500;
    const H = 200;

    test('returns true for coordinates within world bounds', () => {
        expect(Validator.isValidCoordinate(0, 0, W, H)).toBe(true);
        expect(Validator.isValidCoordinate(499, 199, W, H)).toBe(true);
        expect(Validator.isValidCoordinate(250, 100, W, H)).toBe(true);
    });

    test('returns false for coordinates out of bounds', () => {
        expect(Validator.isValidCoordinate(500, 0, W, H)).toBe(false);  // x === worldWidth
        expect(Validator.isValidCoordinate(0, 200, W, H)).toBe(false);  // y === worldHeight
        expect(Validator.isValidCoordinate(600, 300, W, H)).toBe(false);
    });

    test('returns false for negative coordinates', () => {
        expect(Validator.isValidCoordinate(-1, 0, W, H)).toBe(false);
        expect(Validator.isValidCoordinate(0, -1, W, H)).toBe(false);
        expect(Validator.isValidCoordinate(-10, -10, W, H)).toBe(false);
    });

    test('returns false for non-integer coordinates', () => {
        expect(Validator.isValidCoordinate(1.5, 0, W, H)).toBe(false);
        expect(Validator.isValidCoordinate(0, 1.5, W, H)).toBe(false);
    });
});

// ─────────────────────────────────────────────
// isWithinBuildRange  (default maxRange = 4)
// ─────────────────────────────────────────────
describe('Validator.isWithinBuildRange', () => {
    test('returns true when block is exactly at player position', () => {
        expect(Validator.isWithinBuildRange(10, 10, 10, 10)).toBe(true);
    });

    test('returns true when block is within default range of 4', () => {
        // distance = 3, within range 4
        expect(Validator.isWithinBuildRange(0, 0, 3, 0)).toBe(true);
        expect(Validator.isWithinBuildRange(0, 0, 0, 4)).toBe(true); // exactly 4
    });

    test('returns false when block is beyond default range of 4', () => {
        // distance = 5 > 4
        expect(Validator.isWithinBuildRange(0, 0, 5, 0)).toBe(false);
        expect(Validator.isWithinBuildRange(0, 0, 3, 4)).toBe(false); // distance = 5
    });

    test('respects custom maxRange parameter', () => {
        expect(Validator.isWithinBuildRange(0, 0, 10, 0, 10)).toBe(true);
        expect(Validator.isWithinBuildRange(0, 0, 11, 0, 10)).toBe(false);
    });
});

// ─────────────────────────────────────────────
// isValidMovement  (default maxSpeed = 900 px/s)
// ─────────────────────────────────────────────
describe('Validator.isValidMovement', () => {
    test('returns true for normal movement speed', () => {
        // 100 pixels in 1000ms = 100 px/s — well within 900 limit
        expect(Validator.isValidMovement(0, 0, 100, 0, 1000)).toBe(true);
    });

    test('returns true at exactly the speed limit', () => {
        // 900 pixels in 1000ms = 900 px/s — exactly at limit
        expect(Validator.isValidMovement(0, 0, 900, 0, 1000)).toBe(true);
    });

    test('returns false for teleport / speed-hack velocity', () => {
        // 5000 pixels in 100ms = 50 000 px/s — far above 900 limit
        expect(Validator.isValidMovement(0, 0, 5000, 0, 100)).toBe(false);
        // 1000 pixels in 500ms = 2000 px/s — above 900 limit
        expect(Validator.isValidMovement(0, 0, 1000, 0, 500)).toBe(false);
    });
});

// ─────────────────────────────────────────────
// isValidUsername
// ─────────────────────────────────────────────
describe('Validator.isValidUsername', () => {
    test('returns true for valid usernames', () => {
        expect(Validator.isValidUsername('Alice')).toBe(true);
        expect(Validator.isValidUsername('player_1')).toBe(true);
        expect(Validator.isValidUsername('hero-99')).toBe(true);
        expect(Validator.isValidUsername('a')).toBe(true); // min length 1
    });

    test('returns false for username exceeding 18 characters', () => {
        expect(Validator.isValidUsername('a'.repeat(19))).toBe(false);
        expect(Validator.isValidUsername('VeryLongUserNameOver')).toBe(false); // 19 chars
    });

    test('returns false for username with special characters', () => {
        expect(Validator.isValidUsername('bad name!')).toBe(false);  // space + !
        expect(Validator.isValidUsername('user@domain')).toBe(false);
        expect(Validator.isValidUsername('<script>')).toBe(false);
    });

    test('returns false for empty, null, or non-string input', () => {
        expect(Validator.isValidUsername('')).toBe(false);
        expect(Validator.isValidUsername(null)).toBe(false);
        expect(Validator.isValidUsername(undefined)).toBe(false);
        expect(Validator.isValidUsername(123)).toBe(false);
    });
});

// ─────────────────────────────────────────────
// validateCraftRequest
// ─────────────────────────────────────────────
describe('Validator.validateCraftRequest', () => {
    const recipe = {
        ingredients: {
            '1': 5,   // 5x item id 1
            '3': 2    // 2x item id 3
        }
    };

    test('returns valid:true when player has enough materials', () => {
        const inventory = { '1': 5, '3': 3 };
        const result = Validator.validateCraftRequest('recipe_sword', inventory, recipe);
        expect(result.valid).toBe(true);
    });

    test('returns valid:false with reason when player lacks materials', () => {
        const inventory = { '1': 3, '3': 3 }; // only 3 of item 1, need 5
        const result = Validator.validateCraftRequest('recipe_sword', inventory, recipe);
        expect(result.valid).toBe(false);
        expect(result.reason).toMatch(/3/);  // should mention have amount
        expect(result.reason).toMatch(/5/);  // should mention required amount
    });

    test('returns valid:false when ingredient is completely missing from inventory', () => {
        const inventory = {};
        const result = Validator.validateCraftRequest('recipe_sword', inventory, recipe);
        expect(result.valid).toBe(false);
    });

    test('returns valid:false for null recipeId or null recipe', () => {
        const result1 = Validator.validateCraftRequest(null, {}, recipe);
        expect(result1.valid).toBe(false);
        expect(result1.reason).toBe('Invalid recipe');

        const result2 = Validator.validateCraftRequest('id', {}, null);
        expect(result2.valid).toBe(false);
        expect(result2.reason).toBe('Invalid recipe');
    });
});

// ─────────────────────────────────────────────
// sanitizeMessage
// ─────────────────────────────────────────────
describe('Validator.sanitizeMessage', () => {
    test('strips potential XSS by escaping HTML characters', () => {
        const result = Validator.sanitizeMessage('<script>alert("xss")</script>');
        expect(result).not.toContain('<script>');
        expect(result).toContain('&lt;script&gt;');
        expect(result).toContain('&quot;');
    });

    test('escapes single quotes', () => {
        const result = Validator.sanitizeMessage("it's a test");
        expect(result).toContain('&#x27;');
        expect(result).not.toContain("'");
    });

    test('truncates messages to 200 characters', () => {
        const longMsg = 'a'.repeat(300);
        const result = Validator.sanitizeMessage(longMsg);
        expect(result.length).toBe(200);
    });

    test('trims leading and trailing whitespace', () => {
        const result = Validator.sanitizeMessage('  hello  ');
        expect(result).toBe('hello');
    });

    test('returns empty string for empty, null, or non-string input', () => {
        expect(Validator.sanitizeMessage('')).toBe('');
        expect(Validator.sanitizeMessage(null)).toBe('');
        expect(Validator.sanitizeMessage(undefined)).toBe('');
        expect(Validator.sanitizeMessage(42)).toBe('');
    });
});

// ─────────────────────────────────────────────
// checkRateLimit
// ─────────────────────────────────────────────
describe('Validator.checkRateLimit', () => {
    test('returns true when cooldown has expired', () => {
        const lastAction = Date.now() - 2000; // 2 seconds ago
        const cooldownMs = 1000;              // 1 second cooldown
        expect(Validator.checkRateLimit(lastAction, cooldownMs)).toBe(true);
    });

    test('returns true when exactly at the cooldown boundary', () => {
        const cooldownMs = 1000;
        const lastAction = Date.now() - cooldownMs;
        // Date.now() - lastAction >= cooldownMs should be true
        expect(Validator.checkRateLimit(lastAction, cooldownMs)).toBe(true);
    });

    test('returns false when still within cooldown window', () => {
        const lastAction = Date.now() - 200; // only 200ms ago
        const cooldownMs = 1000;             // 1 second cooldown
        expect(Validator.checkRateLimit(lastAction, cooldownMs)).toBe(false);
    });

    test('returns false immediately after an action (lastAction = now)', () => {
        const lastAction = Date.now();
        const cooldownMs = 500;
        expect(Validator.checkRateLimit(lastAction, cooldownMs)).toBe(false);
    });
});
