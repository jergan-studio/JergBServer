const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

const PORT = process.env.PORT || 3000;
const PLAYER_MODEL_URL = 'https://raw.githubusercontent.com/jergan-studio/JergBServer/main/jergplr.glb';

// Active Server Rooms System
// Structure: { roomId: { id, name, host, seed, maxPlayers, players: {}, mapEdits: {} } }
const servers = {};

app.use(express.static(path.join(__dirname, 'public')));

// Default lobby room created on start
servers['lobby-main'] = {
    id: 'lobby-main',
    name: 'Official Main Server',
    host: 'ServerAdmin',
    seed: 'JergBuilder_Official',
    maxPlayers: 20,
    players: {},
    mapEdits: {}
};

io.on('connection', (socket) => {
    console.log(`[+] Socket connected: ${socket.id}`);

    // 1. Send public server list to client on connect
    socket.emit('serverListUpdate', getPublicServerList());

    // 2. Create a Custom Multiplayer Server Room
    socket.on('createServer', (data) => {
        const roomId = `srv_${Date.now()}`;
        servers[roomId] = {
            id: roomId,
            name: data.serverName || `${data.username}'s World`,
            host: data.username,
            seed: data.seed || 'JergSeed',
            maxPlayers: data.maxPlayers || 10,
            players: {},
            mapEdits: {}
        };

        socket.emit('serverCreated', { roomId: roomId });
        io.emit('serverListUpdate', getPublicServerList());
    });

    // 3. Join a Multiplayer Server Room
    socket.on('joinServer', (data) => {
        const room = servers[data.roomId];
        if (!room) {
            return socket.emit('joinError', 'Server room not found.');
        }

        if (Object.keys(room.players).length >= room.maxPlayers) {
            return socket.emit('joinError', 'Server room is full.');
        }

        // Leave previous socket room if any
        if (socket.currentRoom) {
            leaveRoom(socket);
        }

        socket.join(data.roomId);
        socket.currentRoom = data.roomId;

        const playerInfo = {
            id: socket.id,
            username: data.username || 'Builder',
            position: { x: 0, y: 15, z: 0 },
            rotation: { yaw: 0, pitch: 0 }
        };

        room.players[socket.id] = playerInfo;

        // Send world init payload to player
        socket.emit('initWorld', {
            roomId: room.id,
            seed: room.seed,
            mapEdits: room.mapEdits,
            modelUrl: PLAYER_MODEL_URL,
            players: room.players
        });

        // Notify others in room
        socket.to(room.id).emit('playerJoined', playerInfo);
        io.to(room.id).emit('chatMessage', { sender: 'System', text: `${playerInfo.username} joined the server.` });

        // Update overall directory
        io.emit('serverListUpdate', getPublicServerList());
    });

    // 4. Relay Player Movement
    socket.on('playerMove', (data) => {
        const room = servers[socket.currentRoom];
        if (room && room.players[socket.id]) {
            room.players[socket.id].position = data.position;
            room.players[socket.id].rotation = data.rotation;

            socket.to(socket.currentRoom).emit('playerMoved', {
                id: socket.id,
                position: data.position,
                rotation: data.rotation
            });
        }
    });

    // 5. Chat System Inside Room
    socket.on('sendChat', (text) => {
        const room = servers[socket.currentRoom];
        if (room && room.players[socket.id]) {
            io.to(socket.currentRoom).emit('chatMessage', {
                sender: room.players[socket.id].username,
                text: text
            });
        }
    });

    // 6. Sync Block Placement & Destruction
    socket.on('blockPlace', (data) => {
        const room = servers[socket.currentRoom];
        if (room) {
            room.mapEdits[`${data.x},${data.y},${data.z}`] = { type: 'place', material: data.material };
            socket.to(socket.currentRoom).emit('blockPlaced', data);
        }
    });

    socket.on('blockBreak', (data) => {
        const room = servers[socket.currentRoom];
        if (room) {
            room.mapEdits[`${data.x},${data.y},${data.z}`] = { type: 'break' };
            socket.to(socket.currentRoom).emit('blockBroken', data);
        }
    });

    // 7. Handle Disconnections
    socket.on('disconnect', () => {
        leaveRoom(socket);
    });
});

function leaveRoom(socket) {
    const roomId = socket.currentRoom;
    if (roomId && servers[roomId]) {
        const room = servers[roomId];
        const player = room.players[socket.id];
        
        if (player) {
            delete room.players[socket.id];
            socket.to(roomId).emit('playerDisconnected', socket.id);
            io.to(roomId).emit('chatMessage', { sender: 'System', text: `${player.username} left the server.` });
        }

        // Clean up empty custom servers (keep main lobby active)
        if (Object.keys(room.players).length === 0 && roomId !== 'lobby-main') {
            delete servers[roomId];
        }

        io.emit('serverListUpdate', getPublicServerList());
    }
}

function getPublicServerList() {
    return Object.values(servers).map(s => ({
        id: s.id,
        name: s.name,
        host: s.host,
        playerCount: Object.keys(s.players).length,
        maxPlayers: s.maxPlayers
    }));
}

server.listen(PORT, () => console.log(`🚀 JergBServer Multiplayer Directory active on port ${PORT}`));
