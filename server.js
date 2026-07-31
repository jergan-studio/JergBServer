const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: "*", // Allows connections from JergBuilder WebGL client
        methods: ["GET", "POST"]
    }
});

const PORT = process.env.PORT || 3000;

// Raw URL to the 3D player model in GitHub repository
const PLAYER_MODEL_URL = 'https://raw.githubusercontent.com/jergan-studio/JergBServer/main/jergplr.glb';

// Default World Configuration
const MAP_SIZE = 32;
const WATER_LEVEL = 2;
const WORLD_SEED = 'JergBuilder_Default';

// In-Memory Server State
const players = {};
const mapEdits = {}; // Tracks modified, placed, or broken blocks: { "x,y,z": { type, material } }

// Serve static dashboard files from public folder
app.use(express.static(path.join(__dirname, 'public')));

// Root Route Fallback
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ==========================================
// SOCKET MULTIPLAYER NETWORKING
// ==========================================
io.on('connection', (socket) => {
    console.log(`[+] Player connected: ${socket.id}`);

    // 1. Send seed, configuration, and past block edits to the newly connected player
    socket.emit('initWorld', {
        seed: WORLD_SEED,
        mapSize: MAP_SIZE,
        waterLevel: WATER_LEVEL,
        mapEdits: mapEdits,
        modelUrl: PLAYER_MODEL_URL
    });

    // 2. Handle Player Join
    socket.on('playerJoin', (data) => {
        players[socket.id] = {
            id: socket.id,
            position: data.position || { x: 0, y: 15, z: 0 },
            rotation: data.rotation || { yaw: 0, pitch: 0 },
            modelUrl: PLAYER_MODEL_URL
        };

        // Send existing active players to the newly connected player
        socket.emit('currentPlayers', players);

        // Broadcast new player to all existing clients
        socket.broadcast.emit('playerJoined', players[socket.id]);
    });

    // 3. Sync Player Movement & Look Rotation
    socket.on('playerMove', (data) => {
        if (players[socket.id]) {
            players[socket.id].position = data.position;
            players[socket.id].rotation = data.rotation;

            // Relay position update to other players
            socket.broadcast.emit('playerMoved', {
                id: socket.id,
                position: data.position,
                rotation: data.rotation
            });
        }
    });

    // 4. Broadcast & Save Block Placements
    socket.on('blockPlace', (data) => {
        const key = `${data.x},${data.y},${data.z}`;
        mapEdits[key] = { 
            type: 'place', 
            material: data.material || 'grass' 
        };

        socket.broadcast.emit('blockPlaced', data);
    });

    // 5. Broadcast & Save Block Destruction
    socket.on('blockBreak', (data) => {
        const key = `${data.x},${data.y},${data.z}`;
        mapEdits[key] = { type: 'break' };

        socket.broadcast.emit('blockBroken', data);
    });

    // 6. Handle Disconnection
    socket.on('disconnect', () => {
        console.log(`[-] Player disconnected: ${socket.id}`);
        delete players[socket.id];
        io.emit('playerDisconnected', socket.id);
    });
});

server.listen(PORT, () => {
    console.log(`🚀 JergBServer listening on port ${PORT}`);
});
