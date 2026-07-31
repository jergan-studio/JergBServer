const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

const PORT = process.env.PORT || 3000;

// Direct raw GitHub URL for your player model (Fixes 404 / Not Found errors)
const PLAYER_MODEL_URL = 'https://raw.githubusercontent.com/jergan-studio/JergBServer/main/jergplr.glb';

// World Configuration
const MAP_SIZE = 32;
const WATER_LEVEL = 2;
const WORLD_SEED = 'JergBuilder_Default';

// ==========================================
// IN-MEMORY SERVER STATE
// ==========================================
const players = {};
const mapEdits = {}; // Tracks modified/placed/broken blocks

// Basic status dashboard for Render
app.use(express.static('public'));

app.get('/', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>JergBServer Online</title>
            <style>
                body { background: #0d0f12; color: #58a6ff; font-family: monospace; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
                .card { border: 2px solid #2a2f38; background: #16191e; padding: 30px; border-radius: 10px; text-align: center; box-shadow: 0 10px 25px rgba(0,0,0,0.5); }
                .status { color: #3fb950; font-weight: bold; }
            </style>
        </head>
        <body>
            <div class="card">
                <h1>JergBServer</h1>
                <p>Status: <span class="status">● ONLINE</span></p>
                <p>Seed: ${WORLD_SEED} | Map Size: ${MAP_SIZE}x${MAP_SIZE}</p>
                <p>Player Model: <code>jergplr.glb</code></p>
            </div>
        </body>
        </html>
    `);
});

// ==========================================
// SOCKET MULTIPLAYER LOGIC
// ==========================================
io.on('connection', (socket) => {
    console.log(`[+] Player Connected: ${socket.id}`);

    // 1. Send active seed and existing world modifications to newly joined player
    socket.emit('initWorld', {
        seed: WORLD_SEED,
        mapSize: MAP_SIZE,
        waterLevel: WATER_LEVEL,
        mapEdits: mapEdits,
        modelUrl: PLAYER_MODEL_URL
    });

    // 2. Handle Player Joining
    socket.on('playerJoin', (data) => {
        players[socket.id] = {
            id: socket.id,
            position: data.position || { x: 0, y: 15, z: 0 },
            rotation: data.rotation || { yaw: 0, pitch: 0 },
            modelUrl: PLAYER_MODEL_URL
        };

        // Send existing players to new player
        socket.emit('currentPlayers', players);

        // Broadcast new player to all existing clients
        socket.broadcast.emit('playerJoined', players[socket.id]);
    });

    // 3. Handle Movement & Head Angles
    socket.on('playerMove', (data) => {
        if (players[socket.id]) {
            players[socket.id].position = data.position;
            players[socket.id].rotation = data.rotation;

            socket.broadcast.emit('playerMoved', {
                id: socket.id,
                position: data.position,
                rotation: data.rotation
            });
        }
    });

    // 4. Handle Block Placement
    socket.on('blockPlace', (data) => {
        const key = `${data.x},${data.y},${data.z}`;
        mapEdits[key] = { type: 'place', material: data.material || 'grass' };

        socket.broadcast.emit('blockPlaced', data);
    });

    // 5. Handle Block Destruction
    socket.on('blockBreak', (data) => {
        const key = `${data.x},${data.y},${data.z}`;
        mapEdits[key] = { type: 'break' };

        socket.broadcast.emit('blockBroken', data);
    });

    // 6. Handle Disconnect
    socket.on('disconnect', () => {
        console.log(`[-] Player Disconnected: ${socket.id}`);
        delete players[socket.id];
        io.emit('playerDisconnected', socket.id);
    });
});

server.listen(PORT, () => {
    console.log(`🚀 JergBServer running on port ${PORT}`);
});
