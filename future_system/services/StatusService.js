const { net } = require('electron');
const semver = require('semver');

class StatusService {
    constructor(currentVersion, statusUrl) {
        this.currentVersion = currentVersion;
        this.statusUrl = statusUrl;
    }

    /**
     * Fetches the remote status.json with strict cache busting
     */
    async fetchStatus() {
        return new Promise((resolve, reject) => {
            const urlWithCacheBust = `${this.statusUrl}?t=${Date.now()}`;
            const request = net.request({
                method: 'GET',
                url: urlWithCacheBust,
                cache: 'no-store'
            });

            // Set strict cache headers to bypass GitHub CDN/Proxy cache
            request.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
            request.setHeader('Pragma', 'no-cache');
            request.setHeader('Expires', '0');

            request.on('response', (response) => {
                let data = '';
                response.on('data', (chunk) => { data += chunk; });
                response.on('end', () => {
                    try {
                        const parsed = JSON.parse(data);
                        resolve(parsed);
                    } catch (e) {
                        reject(new Error("Failed to parse remote status JSON"));
                    }
                });
            });

            request.on('error', (err) => {
                reject(err);
            });

            request.end();
        });
    }

    /**
     * Analyzes the status and returns actions
     */
    analyze(data) {
        const results = [];

        if (!data) return results;

        const { app_control, update_control, info_control } = data;

        // 1. App Enabled Check (Kill Switch)
        // Supports both boolean false and string "false"
        if (app_control && (app_control.enabled === false || app_control.enabled === 'false')) {
            results.push({
                type: 'SHUTDOWN',
                message: app_control.message || "This application is currently disabled by administrator."
            });
            return results; // Critical: stop here
        }

        // 2. Version Check & Update Logic
        if (update_control) {
            const isOutdated = semver.gt(update_control.latest_version, this.currentVersion);

            if (isOutdated) {
                const deadline = new Date(update_control.update_deadline);
                const now = new Date();

                // Force update if explicitly flagged OR if deadline passed
                const isForced = update_control.force_update === true || now > deadline;

                if (isForced) {
                    results.push({
                        type: 'FORCE_UPDATE',
                        message: update_control.update_message || "Current version is no longer supported. Update now."
                    });
                } else {
                    results.push({
                        type: 'SHOW_REMINDER',
                        message: update_control.update_message || `New version ${update_control.latest_version} is available!`
                    });
                }
            }
        }

        // 3. Info Messages
        if (info_control && info_control.show && info_control.info_message) {
            results.push({
                type: 'SHOW_INFO',
                message: info_control.info_message
            });
        }

        return results;
    }
}

module.exports = StatusService;
