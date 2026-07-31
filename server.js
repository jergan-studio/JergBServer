const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);

// Enable CORS so JergBuilder clients on any domain can connect
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

const PORT = process.env.PORT || 3000;

// ==========================================
// SERVER CONFIGURATION TEMPLATE
// ==========================================
const SERVER_CONFIG = {
    serverName: "JergBuilder Dedicated Server",
    seed: "JergBuilder_Default",
    mapSize: 32,
    waterLevel: 2,
    maxPlayers: 20,
    playerModelUrl: 'https://raw.githubusercontent.com/jergan-studio/JergBServer/main/jergplr.glb'
};

// ==========================================
// IN-MEMORY WORLD STATE
// ==========================================
const players = {};
const mapEdits = {}; // Saved block modifications: { "x,y,z": { type: 'place'/'break', material: 'grass' } }

// Serve static status page from the /public directory
app.use(express.static(path.join(__dirname, 'public')));

// API endpoint for clients/launchers to query server info
app.get('/api/info', (req, res) => {
    res.json({
        name: SERVER_CONFIG.serverName,
        seed: SERVER_CONFIG.seed,
        onlinePlayers: Object.keys(players).length,
        maxPlayers: SERVER_CONFIG.maxPlayers,
        mapSize: SERVER_CONFIG.mapSize
    });
});

// ==========================================
// SOCKET MULTIPLAYER LOGIC
// ==========================================
io.on('connection', (socket) => {
    console.log(`[+] Player connected: ${socket.id}`);

    // 1. Send initial world configuration & saved map edits to new client
    socket.emit('initWorld', {
        serverName: SERVER_CONFIG.serverName,
        seed: SERVER_CONFIG.seed,
        mapSize: SERVER_CONFIG.mapSize,
        waterLevel: SERVER_CONFIG.waterLevel,
        mapEdits: mapEdits,
        modelUrl: SERVER_CONFIG.playerModelUrl
    });

    // 2. Handle Player Joining
    socket.on('playerJoin', (data) => {
        if (Object.keys(players).length >= SERVER_CONFIG.maxPlayers) {
            socket.emit('kick', 'Server is full!');
            return;
        }

        const username = data.username || `Player_${socket.id.substring(0, 4)}`;

        players[socket.id] = {
            id: socket.id,
            username: username,
            position: data.position || { x: 0, y: 15, z: 0 },
            rotation: data.rotation || { yaw: 0, pitch: 0 }
        };

        // Send existing player list to newly joined player
        socket.emit('currentPlayers', players);

        // Broadcast new player to all existing players
        socket.broadcast.emit('playerJoined', players[socket.id]);

        // System message in chat
        io.emit('chatMessage', {
            sender: 'Server',
            text: `${username} joined the game!`
        });
    });

    // 3. Handle Real-Time Player Movement & Rotation
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

    // 4. Handle In-Game Chat
    socket.on('sendChat', (messageText) => {
        const player = players[socket.id];
        if (player && messageText && messageText.trim() !== "") {
            io.emit('chatMessage', {
                sender: player.username,
                text: messageText.trim().substring(0, 120) // Limit length
            });
        }
    });

    // 5. Sync Block Placements
    socket.on('blockPlace', (data) => {
        const key = `${data.x},${data.y},${data.z}`;
        mapEdits[key] = {
            type: 'place',
            material: data.material || 'grass'
        };

        socket.broadcast.emit('blockPlaced', data);
    });

    // 6. Sync Block Destruction
    socket.on('blockBreak', (data) => {
        const key = `${data.x},${data.y},${data.z}`;
        mapEdits[key] = { type: 'break' };

        socket.broadcast.emit('blockBroken', data);
    });

    // 7. Handle Disconnection
    socket.on('disconnect', () => {
        const player = players[socket.id];
        if (player) {
            console.log(`[-] Player disconnected: ${player.username} (${socket.id})`);
            io.emit('chatMessage', {
                sender: 'Server',
                text: `${player.username} left the game.`
            });
            delete players[socket.id];
            io.emit('playerDisconnected', socket.id);
        }
    });
});

server.listen(PORT, () => {
    console.log(`===========================================`);
    console.log(`🚀 JergBuilder Server Active on Port ${PORT}`);
    console.log(`   Name: ${SERVER_CONFIG.serverName}`);
    console.log(`   Seed: ${SERVER_CONFIG.seed}`);
    console.log(`===========================================`);
});
