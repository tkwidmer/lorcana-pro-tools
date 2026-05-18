# Lorcana Game Scraper Extension

Automatically capture live Lorcana Duels gameplay from duels.ink spectate pages.

## Installation

### Option 1: Load from Local Repository (Development)

1. Clone or download this repository
2. Open `chrome://extensions` in your browser
3. Turn on **Developer mode** (toggle in top-right)
4. Click **Load unpacked**
5. Navigate to the `chrome-extension` folder in this repository
6. Click **Select Folder**

### Option 2: Download from GitHub (Production)

1. Go to [https://github.com/tkwidmer/lorcana-pro-tools/releases](https://github.com/tkwidmer/lorcana-pro-tools/releases)
2. Find the latest release
3. Download `lorcana-extension.zip`
4. Extract the zip file to your computer
5. Open `chrome://extensions` in your browser
6. Turn on **Developer mode** (toggle in top-right)
7. Click **Load unpacked**
8. Select the extracted `lorcana-extension` folder
9. Click **Select Folder**

## Usage

Once installed, the extension automatically captures game data whenever you visit a duels.ink spectate page. No additional setup needed per game.

## How It Works

- Intercepts WebSocket messages from duels.ink
- Stores game data in Chrome's local storage
- Data can be accessed by any Lorcana Pro Tools page in your browser
