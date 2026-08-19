/**
 * Logger Service - Centralized logging untuk debugging & production
 * Mendukung: console output, file logging (future), severity levels
 */

const fs = require('fs');
const path = require('path');

class Logger {
    constructor(options = {}) {
        this.name = options.name || 'BlockWorld';
        this.logDir = options.logDir || path.join(__dirname, '../logs');
        this.isDev = options.isDev !== false;
        this.logLevel = options.logLevel || (this.isDev ? 'DEBUG' : 'INFO');
        
        // Ensure log directory exists
        if (!fs.existsSync(this.logDir)) {
            fs.mkdirSync(this.logDir, { recursive: true });
        }
        
        this.levels = { ERROR: 0, WARN: 1, INFO: 2, DEBUG: 3 };
        this.currentLevel = this.levels[this.logLevel];
    }

    /**
     * Format log message dengan timestamp
     */
    format(level, message, data) {
        const timestamp = new Date().toISOString();
        const dataStr = data ? ` ${JSON.stringify(data)}` : '';
        return `[${timestamp}] [${level}] [${this.name}]${dataStr} - ${message}`;
    }

    /**
     * Write ke console dan file
     */
    write(level, message, data) {
        if (this.levels[level] > this.currentLevel) return;
        
        const formatted = this.format(level, message, data);
        
        // Console output
        const consoleMethod = level === 'ERROR' ? 'error' : level === 'WARN' ? 'warn' : 'log';
        console[consoleMethod](formatted);
        
        // File output (production)
        if (!this.isDev) {
            const logFile = path.join(this.logDir, `${level.toLowerCase()}.log`);
            fs.appendFileSync(logFile, formatted + '\n', { encoding: 'utf8' });
        }
    }

    error(message, data) { this.write('ERROR', message, data); }
    warn(message, data) { this.write('WARN', message, data); }
    info(message, data) { this.write('INFO', message, data); }
    debug(message, data) { this.write('DEBUG', message, data); }
}

module.exports = Logger;
