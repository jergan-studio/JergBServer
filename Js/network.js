import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export class NetworkManager {
    constructor(gameInstance, serverUrl = 'http://localhost:3000') {
        this.game = gameInstance;
        this.serverUrl = serverUrl;
        this.remotePlayers = new Map();
        this.loader = new GLTFLoader();

        this.initSocket();
    }

    initSocket() {
        // Socket.io client script must be loaded in index.html
        if (typeof io === 'undefined') {
            console.error('Socket.io client script not found in index.html!');
            return;
        }

        this.socket = io(this.serverUrl);

        this.socket.on('connect', () => {
            console.log('🌐 Connected to JergBServer!');
            this.socket.emit('playerJoin', {
                position: this.game.player.position,
                rotation: { yaw: this.game.player.yaw, pitch: this.game.player.pitch }
            });
        });

        // Load existing map modifications on join
        this.socket.on('initialMapEdits', (edits) => {
            for (let key in edits) {
                const [x, y, z] = key.split(',').map(Number);
                const edit = edits[key];
                if (edit.type === 'place') {
                    const mat = this.game.mapGenerator.materials[edit.material] || this.game.mapGenerator.materials.grass;
                    this.game.mapGenerator.addBlock(x, y, z, mat);
                } else if (edit.type === 'break') {
                    this.game.mapGenerator.removeBlock(x, y, z);
                }
            }
        });

        // Receive current online players
        this.socket.on('currentPlayers', (players) => {
            for (let id in players) {
                if (id !== this.socket.id) {
                    this.addRemotePlayer(id, players[id]);
                }
            }
        });

        // Handle new player joining
        this.socket.on('playerJoined', (data) => {
            this.addRemotePlayer(data.id, data);
        });

        // Handle remote player moving
        this.socket.on('playerMoved', (data) => {
            const remote = this.remotePlayers.get(data.id);
            if (remote && remote.mesh) {
                remote.mesh.position.set(data.position.x, data.position.y, data.position.z);
                remote.mesh.rotation.y = data.rotation.yaw;
            }
        });

        // Handle remote block placement
        this.socket.on('blockPlaced', (data) => {
            const mat = this.game.mapGenerator.materials[data.material] || this.game.mapGenerator.materials.grass;
            this.game.mapGenerator.addBlock(data.x, data.y, data.z, mat);
        });

        // Handle remote block breaking
        this.socket.on('blockBroken', (data) => {
            this.game.mapGenerator.removeBlock(data.x, data.y, data.z);
        });

        // Handle player leaving
        this.socket.on('playerDisconnected', (id) => {
            const remote = this.remotePlayers.get(id);
            if (remote && remote.mesh) {
                this.game.scene.remove(remote.mesh);
            }
            this.remotePlayers.delete(id);
        });

        // Hook into local block actions to send events to server
        this.setupLocalEventHooks();
    }

    setupLocalEventHooks() {
        this.game.on('onBlockPlace', (pos, matKey) => {
            if (this.socket && this.socket.connected) {
                this.socket.emit('blockPlace', { x: pos.x, y: pos.y, z: pos.z, material: matKey });
            }
        });

        this.game.on('onBlockBreak', (pos) => {
            if (this.socket && this.socket.connected) {
                this.socket.emit('blockBreak', { x: pos.x, y: pos.y, z: pos.z });
            }
        });
    }

    addRemotePlayer(id, data) {
        if (this.remotePlayers.has(id)) return;

        const modelUrl = 'https://raw.githubusercontent.com/jergan-studio/JergBuilder/main/jergplr.glb';
        this.loader.load(modelUrl, (gltf) => {
            const mesh = gltf.scene;
            mesh.scale.set(0.5, 0.5, 0.5);
            mesh.position.set(data.position.x, data.position.y, data.position.z);
            this.game.scene.add(mesh);

            this.remotePlayers.set(id, { mesh });
        });
    }

    // Call this inside game loop to send local movement
    update() {
        if (this.socket && this.socket.connected && this.game.player) {
            this.socket.emit('playerMove', {
                position: {
                    x: this.game.player.position.x,
                    y: this.game.player.position.y,
                    z: this.game.player.position.z
                },
                rotation: {
                    yaw: this.game.player.yaw,
                    pitch: this.game.player.pitch
                }
            });
        }
    }
}
