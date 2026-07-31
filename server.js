const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*", // Allows connection from your game client
        methods: ["GET", "POST"]
    }
});

const PORT = process.env.PORT || 3000;

// Store connected players and map state
const players = {};
const mapEdits = {}; // Key: "x,y,z", Value: { type: 'place'/'break', material: 'grass' }

io.on('connection', (socket) => {
    console.log(`🎮 Player connected: ${socket.id}`);

    // 1. Send existing map modifications to new player
    socket.emit('initialMapEdits', mapEdits);

    // 2. Handle Player Joining
    socket.on('playerJoin', (data) => {
        players[socket.id] = {
            id: socket.id,
            position: data.position || { x: 0, y: 20, z: 0 },
            rotation: data.rotation || { yaw: 0, pitch: 0 },
            skin: data.skin || 'default'
        };

        // Notify existing players about the new player
        socket.broadcast.emit('playerJoined', players[socket.id]);

        // Send current list of players to the newly connected player
        socket.emit('currentPlayers', players);
    });

    // 3. Handle Movement & Head Rotation Updates
    socket.on('playerMove', (data) => {
        if (players[socket.id]) {
            players[socket.id].position = data.position;
            players[socket.id].rotation = data.rotation;

            // Broadcast movement to all other players
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
        mapEdits[key] = { type: 'place', material: data.material };

        // Broadcast block placement to all other players
        socket.broadcast.emit('blockPlaced', data);
    });

    // 5. Handle Block Breaking
    socket.on('blockBreak', (data) => {
        const key = `${data.x},${data.y},${data.z}`;
        mapEdits[key] = { type: 'break' };

        // Broadcast block removal to all other players
        socket.broadcast.emit('blockBroken', data);
    });

    // 6. Handle Disconnect
    socket.on('disconnect', () => {
        console.log(`❌ Player disconnected: ${socket.id}`);
        delete players[socket.id];
        io.emit('playerDisconnected', socket.id);
    });
});

app.get('/', (req, res) => {
    res.send('JergBuilder Server is running!');
});

server.listen(PORT, () => {
    console.log(`🚀 JergBServer live on port ${PORT}`);
});
