/**
 * Validation & Security Module
 * Server-side input validation untuk mencegah cheating & exploitation
 */

class Validator {
    /**
     * Validasi block ID
     */
    static isValidBlockId(id, validIds) {
        return Number.isInteger(id) && validIds.has(id);
    }

    /**
     * Validasi koordinat (x, y)
     */
    static isValidCoordinate(x, y, worldWidth, worldHeight) {
        return Number.isInteger(x) && Number.isInteger(y) && 
               x >= 0 && x < worldWidth && y >= 0 && y < worldHeight;
    }

    /**
     * Validasi jarak yang reasonable untuk placement
     */
    static isWithinBuildRange(playerX, playerY, blockX, blockY, maxRange = 4) {
        const distance = Math.sqrt(
            Math.pow(blockX - playerX, 2) + Math.pow(blockY - playerY, 2)
        );
        return distance <= maxRange;
    }

    /**
     * Validasi movement velocity (detect teleport/speed hack)
     */
    static isValidMovement(oldX, oldY, newX, newY, deltaTime, maxSpeed = 900) {
        const distance = Math.sqrt(
            Math.pow(newX - oldX, 2) + Math.pow(newY - oldY, 2)
        );
        const pixelsPerSecond = (distance / deltaTime) * 1000;
        return pixelsPerSecond <= maxSpeed;
    }

    /**
     * Validasi username
     */
    static isValidUsername(name) {
        if (!name || typeof name !== 'string') return false;
        if (name.length < 1 || name.length > 18) return false;
        return /^[a-zA-Z0-9_\-]{1,18}$/.test(name);
    }

    /**
     * Validasi crafting request
     */
    static validateCraftRequest(recipeId, playerInventory, recipe) {
        if (!recipeId || !recipe) return { valid: false, reason: 'Invalid recipe' };
        
        for (const [itemId, required] of Object.entries(recipe.ingredients)) {
            const have = playerInventory[itemId] || 0;
            if (have < required) {
                return { 
                    valid: false, 
                    reason: `Need ${required} of item ${itemId}, have ${have}` 
                };
            }
        }
        
        return { valid: true };
    }

    /**
     * Sanitize chat message (prevent XSS, spam)
     */
    static sanitizeMessage(msg) {
        if (!msg || typeof msg !== 'string') return '';
        
        // Trim & limit length
        msg = msg.trim().substring(0, 200);
        
        // Remove potential HTML/script
        msg = msg
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#x27;');
        
        return msg;
    }

    /**
     * Rate limiting check
     */
    static checkRateLimit(lastAction, cooldownMs) {
        return Date.now() - lastAction >= cooldownMs;
    }
}

module.exports = Validator;
