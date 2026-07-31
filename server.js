const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

const PORT = process.env.PORT || 3000;
const PLAYER_MODEL_URL = 'https://raw.githubusercontent.com/jergan-studio/JergBServer/main/jergplr.glb';

const players = {};
const mapEdits = {};

app.use(express.static(path.join(__dirname, 'public')));

io.on('connection', (socket) => {
    console.log(`[+] Socket Connected: ${socket.id}`);

    // Send world state to new connection
    socket.emit('initWorld', {
        seed: 'JergBuilder_Default',
        mapSize: 32,
        mapEdits: mapEdits,
        modelUrl: PLAYER_MODEL_URL
    });

    // 1. Handle Player Join with Username
    socket.on('playerJoin', (data) => {
        const username = data.username || `Player_${socket.id.substring(0, 4)}`;
        
        players[socket.id] = {
            id: socket.id,
            username: username,
            position: data.position || { x: 0, y: 15, z: 0 },
            rotation: data.rotation || { yaw: 0, pitch: 0 }
        };

        // Send existing players list to joined client
        socket.emit('currentPlayers', players);

        // Broadcast new player to all others
        socket.broadcast.emit('playerJoined', players[socket.id]);

        // Server Broadcast Chat Message
        io.emit('chatMessage', { sender: 'Server', text: `${username} joined the game!` });
    });

    // 2. Handle Player Movement
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

    // 3. Handle In-Game Chat Messages
    socket.on('sendChat', (messageText) => {
        const player = players[socket.id];
        if (player && messageText.trim() !== "") {
            io.emit('chatMessage', {
                sender: player.username,
                text: messageText
            });
        }
    });

    // 4. Handle Block Modifications
    socket.on('blockPlace', (data) => {
        mapEdits[`${data.x},${data.y},${data.z}`] = { type: 'place', material: data.material };
        socket.broadcast.emit('blockPlaced', data);
    });

    socket.on('blockBreak', (data) => {
        mapEdits[`${data.x},${data.y},${data.z}`] = { type: 'break' };
        socket.broadcast.emit('blockBroken', data);
    });

    // 5. Handle Disconnect
    socket.on('disconnect', () => {
        const player = players[socket.id];
        if (player) {
            io.emit('chatMessage', { sender: 'Server', text: `${player.username} left the game.` });
            delete players[socket.id];
            io.emit('playerDisconnected', socket.id);
        }
    });
});

server.listen(PORT, () => console.log(`🚀 JergBServer listening on port ${PORT}`));
