import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export class NetworkManager {
    constructor(game, serverUrl, username) {
        this.game = game;
        this.remotePlayers = new Map();
        this.loader = new GLTFLoader();

        // Connect socket & listeners
        this.initSocket(serverUrl, username);
    }

    initSocket(serverUrl, username) {
        this.socket = io(serverUrl);

        this.socket.on('connect', () => {
            this.socket.emit('playerJoin', {
                username: username,
                position: this.game.player.position,
                rotation: { yaw: this.game.player.yaw, pitch: this.game.player.pitch }
            });
        });

        // Handle existing players
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

        // Sync position & rotation
        this.socket.on('playerMoved', (data) => {
            const remote = this.remotePlayers.get(data.id);
            if (remote && remote.mesh) {
                remote.mesh.position.set(data.position.x, data.position.y, data.position.z);
                remote.mesh.rotation.y = data.rotation.yaw;
            }
        });

        // Handle disconnects
        this.socket.on('playerDisconnected', (id) => {
            const remote = this.remotePlayers.get(id);
            if (remote && remote.mesh) {
                this.game.scene.remove(remote.mesh);
            }
            this.remotePlayers.delete(id);
        });
    }

    addRemotePlayer(id, data) {
        // Direct raw URL to your jergplr.glb model
        const modelUrl = 'https://raw.githubusercontent.com/jergan-studio/JergBServer/main/jergplr.glb';

        this.loader.load(modelUrl, (gltf) => {
            const playerMesh = gltf.scene;
            
            // Adjust scale if the model is too big/small
            playerMesh.scale.set(1, 1, 1); 
            playerMesh.position.set(data.position.x, data.position.y, data.position.z);

            this.game.scene.add(playerMesh);
            this.remotePlayers.set(id, { mesh: playerMesh, username: data.username });
        }, undefined, (error) => {
            console.error('Error loading player model:', error);
        });
    }

    update() {
        if (this.socket && this.socket.connected && this.game.player) {
            this.socket.emit('playerMove', {
                position: this.game.player.position,
                rotation: { yaw: this.game.player.yaw, pitch: this.game.player.pitch }
            });
        }
    }
}
