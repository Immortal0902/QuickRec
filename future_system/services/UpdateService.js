class UpdateService {
    constructor(config) {
        this.currentVersion = config.current_version;
    }

    /**
     * Compares versions to determine app state.
     * @param {Object} remoteStatus returned from RemoteConfigService
     * @returns {Object} status analysis
     */
    analyzeStatus(remoteStatus) {
        const isKillSwitch = remoteStatus.kill_switch === true;

        if (isKillSwitch) {
            return { action: 'KILL', reason: 'Remote Kill Switch Activated' };
        }

        const isForceUpdate = this._compare(remoteStatus.min_usable_version, this.currentVersion) > 0;
        if (isForceUpdate) {
            return { action: 'FORCE_UPDATE', reason: 'Current version is depreciated.' };
        }

        const isUpdateAvailable = this._compare(remoteStatus.latest_version, this.currentVersion) > 0;
        if (isUpdateAvailable) {
            return { action: 'UPDATE_AVAILABLE', version: remoteStatus.latest_version };
        }

        return { action: 'NORMAL', message: remoteStatus.message };
    }

    /**
     * Simple SemVer comparison
     * Returns: 1 if v1 > v2, -1 if v1 < v2, 0 if equal
     */
    _compare(v1, v2) {
        const p1 = v1.split('.').map(Number);
        const p2 = v2.split('.').map(Number);

        for (let i = 0; i < Math.max(p1.length, p2.length); i++) {
            const n1 = p1[i] || 0;
            const n2 = p2[i] || 0;
            if (n1 > n2) return 1;
            if (n2 > n1) return -1;
        }
        return 0;
    }
}

module.exports = UpdateService;
