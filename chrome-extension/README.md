# Lorcana Game Scraper Extension

Automatically capture live Lorcana Duels gameplay from duels.ink spectate pages.

## Installation

1. Download the repository from [GitHub](https://github.com/tkwidmer/lorcana-pro-tools) (Code → Download ZIP)
2. Extract the zip file to your computer
3. Navigate to the `chrome-extension` folder
4. Open `chrome://extensions` in your browser
5. Turn on **Developer mode** (toggle in top-right)
6. Click **Load unpacked**
7. Select the `chrome-extension` folder
8. Done! The extension is now installed.

## Usage

Once installed, the extension automatically captures game data whenever you visit a duels.ink spectate page. No additional setup needed per game.

## How It Works

- Intercepts WebSocket messages from duels.ink spectate pages
- Forwards game data to the InkbornForge application
- Works seamlessly with Game History, Player Profiles, and other tools
