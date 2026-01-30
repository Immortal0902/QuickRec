# Future Control System Integration Guide

This folder (`future_system/`) contains the complete logic for controlling your app remotely.
It is designed to be plug-and-play.

## 1. Folder Structure
- **config/**: Contains `app_config.json`. Edit this to change your remote URLs.
- **core/**: Contains the main logic (`AppController.js`).
- **services/**: Contains helper logic for updates and networking.
- **index.js**: The main entry point.

## 2. Integration
To connect your existing `main.js` to this system, add this small snippet at the top of your `app.whenReady()` block:

```javascript
// --- FUTURE SYSTEM INTEGRATION ---
const futureSystem = require('./future_system/index');

app.whenReady().then(async () => {
    // 1. Check Status before creating window
    const status = await futureSystem.initialize();

    if (!status.allowStart) {
        // Handle Kill Switch or Force Update
        const { dialog, shell } = require('electron');
        const choice = dialog.showMessageBoxSync({
            type: 'error',
            title: status.reason === 'APP_DISABLED' ? 'App Disabled' : 'Update Required',
            message: status.message || "A critical update is required to continue.",
            buttons: status.reason === 'FORCE_UPDATE' ? ['Update Now', 'Exit'] : ['Exit']
        });

        if (status.reason === 'FORCE_UPDATE' && choice === 0) {
            shell.openExternal(status.url || 'https://your-website.com');
        }
        
        app.quit();
        return; 
    }

    // 2. If allowed, proceed normally
    if (status.updateAvailable) {
        console.log("An update is available!");
        // Optional: Show a notification or small update banner
    }

    createWindow();
    // ... rest of your code
});
```

## 3. How to Remote Control
You can control the app by hosting a `status.json` file on GitHub (or any web server).

**Example status.json hosted online:**
```json
{
    "latest_version": "1.1.0",
    "min_usable_version": "1.0.0",
    "kill_switch": false,
    "message": {
        "show": true,
        "title": "Welcome",
        "body": "Thanks for using Pro Screen Recorder!"
    }
}
```

- **To Force Update**: Change `min_usable_version` to be higher than the user's current version (e.g., "1.1.0").
- **To Kill App**: Set `kill_switch` to `true`.
- **To Notify Update**: Set `latest_version` to be higher than current.

## 4. Configuring
Edit `future_system/config/app_config.json` to point `remote_endpoint` to your raw GitHub URL.
