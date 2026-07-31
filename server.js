const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
    cors: { origin: "*" }
});

const PORT = process.env.PORT || 3000;
const PLAYER_MODEL_URL = 'https://raw.githubusercontent.com/jergan-studio/JergBServer/main/jergplr.glb';

// ==========================================
// SERVER WORLD CONFIGURATION
// ==========================================
const WORLD = {
    seed: 'JergBuilder_Official',
    mapSize: 32,
    waterLevel: 2,
    maxPlayers: 20
};

// World Data Storage
const players = {};
const mapEdits = {}; // Saved block changes: { "x,y,z": { type: 'place'/'break', material: 'grass' } }

app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/serverinfo', (req, res) => {
    res.json({
        name: "JergBuilder Dedicated Server",
        seed: WORLD.seed,
        online: Object.keys(players).length,
        max: WORLD.maxPlayers,
        size: WORLD.mapSize
    });
});

// ==========================================
// SOCKET MULTIPLAYER ENGINE
// ==========================================
io.on('connection', (socket) => {
    console.log(`[+] Socket joined: ${socket.id}`);

    // 1. Send seed, configuration, and all world changes on connect
    socket.emit('initWorld', {
        seed: WORLD.seed,
        mapSize: WORLD.mapSize,
        waterLevel: WORLD.waterLevel,
        mapEdits: mapEdits,
        modelUrl: PLAYER_MODEL_URL
    });

    // 2. Handle Player Login
    socket.on('playerJoin', (data) => {
        if (Object.keys(players).length >= WORLD.maxPlayers) {
            socket.emit('kickReason', 'Server is full!');
            return;
        }

        const name = data.username || `Player_${socket.id.substring(0, 4)}`;

        players[socket.id] = {
            id: socket.id,
            username: name,
            position: data.position || { x: 0, y: 12, z: 0 },
            rotation: data.rotation || { yaw: 0, pitch: 0 }
        };

        // Sync existing connected players to new client
        socket.emit('currentPlayers', players);

        // Broadcast newly joined player to everyone else
        socket.broadcast.emit('playerJoined', players[socket.id]);

        // Chat notification
        io.emit('chatMessage', { sender: 'Server', text: `${name} connected to the server.` });
    });

    // 3. Real-Time Player Physics/Movement Sync
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

    // 4. In-Game Chat System
    socket.on('sendChat', (text) => {
        const p = players[socket.id];
        if (p && text.trim()) {
            io.emit('chatMessage', { sender: p.username, text: text.trim() });
        }
    });

    // 5. Global Block Placement (Updates server world state & relays to all)
    socket.on('blockPlace', (data) => {
        const key = `${data.x},${data.y},${data.z}`;
        mapEdits[key] = { type: 'place', material: data.material || 'grass' };

        socket.broadcast.emit('blockPlaced', data);
    });

    // 6. Global Block Destruction
    socket.on('blockBreak', (data) => {
        const key = `${data.x},${data.y},${data.z}`;
        mapEdits[key] = { type: 'break' };

        socket.broadcast.emit('blockBroken', data);
    });

    // 7. Disconnection Clean-Up
    socket.on('disconnect', () => {
        const p = players[socket.id];
        if (p) {
            console.log(`[-] Socket disconnected: ${p.username}`);
            io.emit('chatMessage', { sender: 'Server', text: `${p.username} disconnected.` });
            delete players[socket.id];
            io.emit('playerDisconnected', socket.id);
        }
    });
});

server.listen(PORT, () => console.log(`🚀 JergBuilder Server online on port ${PORT}`));
