# BlockWorld (Alpha)

![Node.js](https://img.shields.io/badge/Node.js-v14+-brightgreen) ![Tests](https://img.shields.io/badge/tests-42%20passing-brightgreen) ![Database](https://img.shields.io/badge/database-SQLite-blue) ![License](https://img.shields.io/badge/license-MIT-blue)

A 2D multiplayer sandbox web game inspired by mechanics from Growtopia and Terraria. Built from scratch using Node.js, Express, Socket.IO, and HTML5 Canvas.

## Features

- **Procedural World Generation:** Natural terrain featuring rolling hills, trees, surface grass, subsurface dirt, and deep stone layers with underground ice and lava pockets.
- **Chunked World Sync & Spatial Partitioning:** Efficient 32x32 chunk-room routing and spatial event broadcasting, emitting events only to nearby players for optimal bandwidth and network performance.
- **Offloaded Web Worker Physics:** Multi-threaded client-side physics execution offloaded to a dedicated Web Worker (`physicsWorker.js`) for smooth 60 FPS gameplay rendering.
- **Technical Infrastructure & Reliability:**
  - **SaveManager Service:** Automatic periodic world saves with automated rolling backup rotation to prevent data corruption.
  - **Validator Utility:** Server-side input validation, string sanitization, and chat rate-limiting for enhanced security.
  - **Logger Service:** Centralized structured logging for server events and diagnostic monitoring.
  - **NetworkHandler Service:** Robust Socket.IO error handling, connection tracking, and rate limiting.
  - **Health Endpoint:** Dedicated `/health` REST endpoint for server health and uptime monitoring.
- **Day and Night Cycle:** Dynamic sky color transitions and celestial rendering with night-only mob spawns.
- **Enemy Mobs & Combat:** Knight mobs spawn at night and attack non-admin players. Weapons include fists, wooden swords, and stone swords.
- **Door Warp Teleportation System:** Door pair teleportation system with stable matching IDs. Press `W` at a door to warp to its pair.
- **Ambient Audio:** CC0 lofi music playlist and procedural rain soundscape with dedicated audio controls.
- **Inventory & Crafting:** Tabbed inventory interface with hotbar, crafting system for structures/tools, and physical item drops with proximity pickup.
- **Admin / Moderation Mode:** Moderation commands including flight, noclip collision bypass, mob immunity, and item spawning.

## Tech Stack

- **Backend:** Node.js, Express.js
- **Real-time Networking:** Socket.IO
- **Frontend:** HTML5 Canvas, Web Workers, Web Audio API, Vanilla JavaScript, CSS

## Getting Started

### Prerequisites

- Node.js (v14 or higher)

### Installation & Execution

1. Clone the repository:
   ```bash
   git clone https://github.com/AlvisChrs/BlockWorld.git
   cd BlockWorld
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the server:
   ```bash
   npm start
   ```

4. Open `http://localhost:3000` in your web browser.

## Controls

| Key / Action | Function |
|---|---|
| WASD / Arrow Keys | Move & Jump |
| W / Arrow Up (On Door) | Enter / Warp Through Door |
| Left Click | Break Block / Attack Enemy |
| Right Click | Place Block |
| 1 - 5 | Select Hotbar Slot |
| E | Toggle Inventory & Crafting Overlay |
| G | Drop Selected Item |

## Admin Commands

Execute via global chat:

- `/loginadmin <password>` - Enable administrator privileges. Set the password with `ADMIN_PASSWORD`.
- `/logoutadmin` - Relinquish administrator privileges.
- `/fly` - Toggle flight mode.
- `/noclip` - Toggle block collision bypass.
- `/give <item_id> <quantity>` - Add items directly to inventory.

## Server Endpoints & Configuration

- `PORT` - Server port. Defaults to `3000`.
- `ADMIN_PASSWORD` - Enables the `/loginadmin` command when set.
- `GET /health` - Returns JSON response with server health status, active connections, and memory usage.

World state is managed by `SaveManager` with rolling backups in `data/` and automatically saved during normal operation and graceful shutdowns.

## Running Tests

```bash
npm test
```

## Database Migration

To migrate world data from JSON to SQLite:

```bash
npm run migrate
```
