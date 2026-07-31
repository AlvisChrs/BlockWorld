# BlockWorld (Alpha)

A 2D multiplayer sandbox web game inspired by mechanics from Growtopia and Terraria. Built from scratch using Node.js, Express, Socket.IO, and HTML5 Canvas.

## Features

- Procedural World Generation: Natural terrain featuring rolling hills, trees, surface grass, subsurface dirt, and deep stone layers with underground ice and lava pockets.
- Day and Night Cycle: A 2-minute cycle alternating between day and night with dynamic sky color transitions and celestial rendering.
- Enemy Mobs & Combat: Knight mobs spawn exclusively at night and attack non-admin players. Daytime causes night mobs to despawn. Weapons include fists, wooden swords, and stone swords.
- Door Warp Teleportation System: Place multiple wooden doors in the world to warp between them seamlessly by pressing `W` when standing in front of a door.
- Ambient Lofi Music & Rain Audio: Integrated Web Audio synthesizer providing chill lofi 7th-chord progressions and procedural rain soundscapes with a toggle button.
- Inventory & Crafting: Tabbed inventory interface with a 5-slot hotbar, crafting system for solid structures, doors, and weapons, and physical item drops with proximity pickup.
- Admin / Moderation Mode: Moderation commands including flight, noclip collision bypass, mob immunity, and unconstrained build range.

## Tech Stack

- Backend: Node.js, Express.js
- Real-time Networking: Socket.IO
- Frontend: HTML5 Canvas, Web Audio API, Vanilla JavaScript, CSS

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
   node server.js
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

- `/loginadmin admin123` - Enable administrator privileges.
- `/fly` - Toggle flight mode.
- `/noclip` - Toggle block collision bypass.
- `/give <item_id> <quantity>` - Add items directly to inventory.
