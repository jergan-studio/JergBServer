const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: "*", // Allows connections from JergBuilder client
        methods: ["GET", "POST"]
    }
});

const PORT = process.env.PORT || 3000;

// ==========================================
// SERVER STATE (In-Memory Data)
// ==========================================
// Stores all active players: { socketId: { id, position, rotation } }
const players = {}; 

// Stores map modifications made by players: { "x,y,z": { type: 'place'/'break', material: 'grass' } }
const mapEdits = {}; 

// Serve static HTML status page for Render
app.use(express.static('public'));

io.on('connection', (socket) => {
    console.log(`[+] Player connected: ${socket.id}`);

    // 1. Send all existing map edits to the newly connected player
    socket.emit('initialMapEdits', mapEdits);

    // 2. Handle Player Joining
    socket.on('playerJoin', (data) => {
        players[socket.id] = {
            id: socket.id,
            position: data.position || { x: 0, y: 10, z: 0 },
            rotation: data.rotation || { yaw: 0, pitch: 0 }
        };

        // Notify existing players about the new player
        socket.broadcast.emit('playerJoined', players[socket.id]);

        // Send full list of connected players to the new player
        socket.emit('currentPlayers', players);
    });

    // 3. Handle Player Movement & Look Rotation
    socket.on('playerMove', (data) => {
        if (players[socket.id]) {
            players[socket.id].position = data.position;
            players[socket.id].rotation = data.rotation;

            // Relays movement to all other clients immediately
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
        
        // Save edit to server memory so future players see it
        mapEdits[key] = { 
            type: 'place', 
            material: data.material || 'grass' 
        };

        // Broadcast block placement to every other client
        socket.broadcast.emit('blockPlaced', data);
    });

    // 5. Handle Block Destruction
    socket.on('blockBreak', (data) => {
        const key = `${data.x},${data.y},${data.z}`;

        // Save block removal to server memory
        mapEdits[key] = { type: 'break' };

        // Broadcast block break to every other client
        socket.broadcast.emit('blockBroken', data);
    });

    // 6. Handle Disconnection
    socket.on('disconnect', () => {
        console.log(`[-] Player disconnected: ${socket.id}`);
        delete players[socket.id];
        
        // Tell everyone else to remove this player's model from their scene
        io.emit('playerDisconnected', socket.id);
    });
});

server.listen(PORT, () => {
    console.log(`🚀 JergBServer listening on port ${PORT}`);
});
