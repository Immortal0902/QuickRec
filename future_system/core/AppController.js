const RemoteConfigService = require('../services/RemoteConfigService');
const UpdateService = require('../services/UpdateService');
const config = require('../config/app_config.json');

class AppController {
    constructor() {
        this.config = config;
        this.remoteService = new RemoteConfigService(config);
        this.updateService = new UpdateService(config);
        this.status = 'INITIALIZING';
        this.lastCheck = null;
    }

    /**
     * Main entry point called by the app on startup.
     * @returns {Promise<Object>} The decision on how the app should proceed.
     */
    async initialize() {
        console.log("[FutureSystem] Initializing Future Control System...");

        // 1. Fetch Remote Status
        const remoteStatus = await this.remoteService.fetchRemoteStatus();
        this.lastCheck = new Date();

        // 2. Analyze
        const analysis = this.updateService.analyzeStatus(remoteStatus);
        console.log("[FutureSystem] Analysis Result:", analysis);

        // 3. Handle Critical States
        if (analysis.action === 'KILL') {
            return { allowStart: false, reason: 'APP_DISABLED', message: "This application has been remotely disabled." };
        }

        if (analysis.action === 'FORCE_UPDATE') {
            return { allowStart: false, reason: 'FORCE_UPDATE', msg: "Critical update required.", url: this.config.update_url };
        }

        // 4. Return Normal Operation data
        return {
            allowStart: true,
            updateAvailable: analysis.action === 'UPDATE_AVAILABLE',
            latestVersion: analysis.version || this.config.current_version,
            message: analysis.message
        };
    }

    /**
     * Call this periodically to check for updates
     */
    async checkForUpdates() {
        const remoteStatus = await this.remoteService.fetchRemoteStatus();
        return this.updateService.analyzeStatus(remoteStatus);
    }
}

module.exports = AppController;
