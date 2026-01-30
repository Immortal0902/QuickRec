const { net } = require('electron');

class RemoteConfigService {
    constructor(config) {
        this.config = config;
    }

    /**
     * Fetches the app status from the remote endpoint.
     * Uses Electron's 'net' module for better system integration.
     * @returns {Promise<Object>} The remote status JSON or default fallback.
     */
    async fetchRemoteStatus() {
        // MOCK RESPONSE (Since we don't have a real URL yet)
        // In production, this would actually fetch from this.config.remote_endpoint
        return new Promise((resolve) => {
            // Un-comment the real code below when you have a URL
            /*
            const request = net.request(this.config.remote_endpoint);
            request.on('response', (response) => {
                let data = '';
                response.on('data', (chunk) => { data += chunk; });
                response.on('end', () => {
                    try {
                        resolve(JSON.parse(data));
                    } catch (e) {
                        console.error("Failed to parse remote config", e);
                        resolve(this._getOfflineFallback());
                    }
                });
            });
            request.on('error', (error) => {
                console.warn("Network error fetching config", error);
                resolve(this._getOfflineFallback());
            });
            request.end();
            */

            // Mock Return
            console.log("[FutureSystem] Mocking remote status check...");
            resolve({
                latest_version: "1.0.0", // Change this to test updates
                min_usable_version: "1.0.0", // Change this to test force updates
                kill_switch: false, // Set true to test kill switch
                maintenance_mode: false,
                message: {
                    title: "Welcome",
                    body: "Welcome to Pro Screen Recorder!",
                    show: false
                }
            });
        });
    }

    _getOfflineFallback() {
        return {
            latest_version: this.config.current_version,
            min_usable_version: "0.0.0",
            kill_switch: false,
            offline: true
        };
    }
}

module.exports = RemoteConfigService;
