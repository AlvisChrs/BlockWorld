/**
 * Save Manager - Auto-save dengan backup system
 * Features:
 * - Auto-save setiap interval
 * - Backup rotation (keep last 5 saves)
 * - Corruption recovery
 * - Atomic writes (prevent incomplete saves)
 */

const fs = require('fs');
const path = require('path');

class SaveManager {
    constructor(options = {}) {
        this.savePath = options.savePath || path.join(__dirname, '../data/world-state.json');
        this.backupDir = options.backupDir || path.join(__dirname, '../data/backups');
        this.maxBackups = options.maxBackups || 5;
        this.autoSaveInterval = options.autoSaveInterval || 300000; // 5 menit
        this.logger = options.logger || console;
        
        this.ensureDirectories();
        this.autoSaveTimer = null;
    }

    /**
     * Pastikan direktori ada
     */
    ensureDirectories() {
        const dirs = [
            path.dirname(this.savePath),
            this.backupDir
        ];
        
        for (const dir of dirs) {
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
        }
    }

    /**
     * Start auto-save timer
     */
    startAutoSave(saveFunction) {
        if (this.autoSaveTimer) clearInterval(this.autoSaveTimer);
        
        this.autoSaveTimer = setInterval(() => {
            this.save(saveFunction, 'auto');
        }, this.autoSaveInterval);
        
        this.logger.info('Auto-save started', { interval: this.autoSaveInterval });
    }

    /**
     * Stop auto-save
     */
    stopAutoSave() {
        if (this.autoSaveTimer) {
            clearInterval(this.autoSaveTimer);
            this.autoSaveTimer = null;
        }
    }

    /**
     * Save world state dengan atomic write
     */
    save(saveFunction, type = 'manual') {
        try {
            const data = saveFunction();
            const tempPath = this.savePath + '.tmp';
            
            // Write ke temporary file dulu
            fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), 'utf8');
            
            // Atomic rename (atomic pada most OS)
            if (fs.existsSync(this.savePath)) {
                fs.renameSync(this.savePath, this.savePath + '.old');
            }
            fs.renameSync(tempPath, this.savePath);
            
            this.logger.info(`Save completed (${type})`, { path: this.savePath });
            
            // Create backup jika save berhasil
            if (type !== 'manual') {
                this.createBackup();
            }
            
            return { success: true };
        } catch (error) {
            this.logger.error('Save failed', { error: error.message, type });
            
            // Restore dari .old jika ada
            if (fs.existsSync(this.savePath + '.old')) {
                try {
                    fs.renameSync(this.savePath + '.old', this.savePath);
                    this.logger.warn('Restored from backup');
                } catch (restoreError) {
                    this.logger.error('Failed to restore backup', { error: restoreError.message });
                }
            }
            
            return { success: false, error: error.message };
        }
    }

    /**
     * Create backup dari current save
     */
    createBackup() {
        try {
            if (!fs.existsSync(this.savePath)) return;
            
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const backupPath = path.join(this.backupDir, `world-${timestamp}.json`);
            
            fs.copyFileSync(this.savePath, backupPath);
            this.logger.debug('Backup created', { path: backupPath });
            
            // Cleanup old backups
            this.rotateBackups();
        } catch (error) {
            this.logger.warn('Backup creation failed', { error: error.message });
        }
    }

    /**
     * Rotate backups (keep only maxBackups)
     */
    rotateBackups() {
        try {
            const files = fs.readdirSync(this.backupDir)
                .filter(f => f.startsWith('world-') && f.endsWith('.json'))
                .sort()
                .reverse();
            
            for (let i = this.maxBackups; i < files.length; i++) {
                const oldFile = path.join(this.backupDir, files[i]);
                fs.unlinkSync(oldFile);
                this.logger.debug('Old backup removed', { file: files[i] });
            }
        } catch (error) {
            this.logger.warn('Backup rotation failed', { error: error.message });
        }
    }

    /**
     * Load save dengan validation
     */
    load() {
        try {
            if (!fs.existsSync(this.savePath)) {
                this.logger.info('No existing save found');
                return null;
            }
            
            const data = JSON.parse(fs.readFileSync(this.savePath, 'utf8'));
            
            // Validate struktur
            if (!data.world || !Array.isArray(data.world)) {
                throw new Error('Invalid world structure');
            }
            
            this.logger.info('Save loaded successfully');
            return data;
        } catch (error) {
            this.logger.error('Load failed', { error: error.message });
            
            // Try restore dari backup terakhir
            return this.recoverFromBackup();
        }
    }

    /**
     * Recover dari backup terakhir
     */
    recoverFromBackup() {
        try {
            const files = fs.readdirSync(this.backupDir)
                .filter(f => f.startsWith('world-') && f.endsWith('.json'))
                .sort()
                .reverse();
            
            if (files.length === 0) {
                this.logger.error('No backups available for recovery');
                return null;
            }
            
            const latestBackup = path.join(this.backupDir, files[0]);
            const data = JSON.parse(fs.readFileSync(latestBackup, 'utf8'));
            
            this.logger.info('Recovered from backup', { file: files[0] });
            
            // Copy ke main save
            fs.copyFileSync(latestBackup, this.savePath);
            
            return data;
        } catch (error) {
            this.logger.error('Recovery failed', { error: error.message });
            return null;
        }
    }

    /**
     * Get backup info
     */
    getBackupInfo() {
        try {
            const files = fs.readdirSync(this.backupDir)
                .filter(f => f.startsWith('world-') && f.endsWith('.json'))
                .map(f => {
                    const fullPath = path.join(this.backupDir, f);
                    const stats = fs.statSync(fullPath);
                    return {
                        name: f,
                        size: stats.size,
                        modified: stats.mtime
                    };
                })
                .sort((a, b) => b.modified - a.modified);
            
            return files;
        } catch (error) {
            this.logger.warn('Failed to get backup info', { error: error.message });
            return [];
        }
    }
}

module.exports = SaveManager;
