# DAT Auto Refresh

A simple browser extension that automatically refreshes DAT load board pages on a custom interval. Built to solve DAT's frustrating timeout behavior by keeping your session alive and your load board fresh. Feature to copy coworkers' posts in development.

## ⚙️ Features

- Auto-refreshes DAT load board every 15 minutes
- Clean popup UI with start/stop toggle, timer, and refresh count
- Works with both Chrome and Edge
- Lightweight — no tracking, no login credentials needed or saved

## 🧱 File Structure

```
background.js   # Handles the refresh logic  
content.js      # (Optional) For future enhancements to page behavior  
manifest.json   # Defines extension settings and permissions  
popup.html      # Popup interface  
popup.css       # Popup styling  
popup.js        # UI logic (start/stop, timer)  
icon.png        # Extension icon  
```

## 🚀 Installation - Install in Chrome / Edge

1. **Download or clone this repo** to your local machine.
2. Open your browser and go to:
   - Chrome: `chrome://extensions/`
   - Edge: `edge://extensions/`
3. Enable **"Developer Mode"** (toggle in the top-right).
4. Click **“Load unpacked”**.
5. Select the folder where these files live (the folder containing `manifest.json`).
6. Done! You should see the DAT Auto Refresh icon in your extensions bar.

## 🔁 How It Works

Once installed:
- Navigate to your DAT 'My Shipments'
- Click the extension icon to open the popup
- Click “Start”
- The script will now auto-refresh your posts every 15 minutes

Still refreshes when on a different tab or if browser is minimized. DAT tab must stay on 'My Shipments' to refresh.

If you close or restart the browser, you’ll need to start the timer again manually.

## 🛠️ Customization

Users can toggle dark mode on or off

## 💬 Known Issues

- Will refresh all posts listed on screen. If you're looking at other user's posts through Workgroup Shipments, those will be refreshed as well. This is NOT a bug and is intended so the user can refresh their team's posts if necessary.

## 🧪 Coming Soon (maybe)

- Function to copy coworker's posts