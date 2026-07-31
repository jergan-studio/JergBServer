import * as THREE from 'three';

export class Player {
    constructor(scene, camera, mapGenerator, game) {
        this.scene = scene;
        this.camera = camera;
        this.map = mapGenerator;
        this.game = game;

        // Position & Movement Vectors
        this.position = new THREE.Vector3(0, 12, 0);
        this.velocity = new THREE.Vector3();
        this.dimensions = new THREE.Vector3(0.6, 1.8, 0.6); // Player Bounding Box

        // Rotation
        this.yaw = 0;
        this.pitch = 0;

        // States
        this.isGrounded = false;
        this.speed = 6.0;
        this.jumpForce = 7.5;
        this.gravity = 22.0;

        // Controls
        this.keys = {};
        this.activeSlot = 1;
        this.raycaster = new THREE.Raycaster();
        this.raycaster.far = 6; // Reach distance in blocks

        this.initControls();
    }

    initControls() {
        window.addEventListener('keydown', (e) => {
            this.keys[e.code] = true;

            // Hotbar slot selection (1-8)
            if (e.key >= '1' && e.key <= '8') {
                this.activeSlot = parseInt(e.key);
                this.updateHotbarUI();
            }
        });

        window.addEventListener('keyup', (e) => {
            this.keys[e.code] = false;
        });

        // Mouse Look
        window.addEventListener('mousemove', (e) => {
            if (document.pointerLockElement === document.body || document.pointerLockElement === this.game.renderer?.domElement) {
                const sensitivity = 0.002;
                this.yaw -= e.movementX * sensitivity;
                this.pitch -= e.movementY * sensitivity;

                // Clamp looking up and down (89 degrees)
                this.pitch = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, this.pitch));
            }
        });

        // Mouse Click Interaction (Break & Place)
        window.addEventListener('mousedown', (e) => {
            if (document.pointerLockElement !== document.body && document.pointerLockElement !== this.game.renderer?.domElement) return;

            if (e.button === 0) {
                this.breakBlock();
            } else if (e.button === 2) {
                this.placeBlock();
            }
        });
    }

    updateHotbarUI() {
        const slots = document.querySelectorAll('.hotbar-slot');
        slots.forEach((slot, idx) => {
            if (idx + 1 === this.activeSlot) {
                slot.classList.add('active');
            } else {
                slot.classList.remove('active');
            }
        });
    }

    update(delta) {
        this.handleMovement(delta);
        this.applyPhysics(delta);
        this.updateCamera();
    }

    handleMovement(delta) {
        const moveDir = new THREE.Vector3();

        if (this.keys['KeyW']) moveDir.z -= 1;
        if (this.keys['KeyS']) moveDir.z += 1;
        if (this.keys['KeyA']) moveDir.x -= 1;
        if (this.keys['KeyD']) moveDir.x += 1;

        moveDir.normalize();

        // Rotate movement direction relative to camera yaw
        const forward = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw)).negate();
        const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).negate();

        const wishDir = new THREE.Vector3()
            .addScaledVector(forward, -moveDir.z)
            .addScaledVector(right, moveDir.x);

        this.velocity.x = wishDir.x * this.speed;
        this.velocity.z = wishDir.z * this.speed;

        // Jump
        if (this.keys['Space'] && this.isGrounded) {
            this.velocity.y = this.jumpForce;
            this.isGrounded = false;
        }
    }

    applyPhysics(delta) {
        // Apply Gravity
        this.velocity.y -= this.gravity * delta;

        // Y Collision
        this.position.y += this.velocity.y * delta;
        if (this.checkCollision()) {
            if (this.velocity.y < 0) {
                this.isGrounded = true;
                this.position.y = Math.ceil(this.position.y);
            }
            this.velocity.y = 0;
        } else {
            this.isGrounded = false;
        }

        // X Collision
        this.position.x += this.velocity.x * delta;
        if (this.checkCollision()) {
            this.position.x -= this.velocity.x * delta;
        }

        // Z Collision
        this.position.z += this.velocity.z * delta;
        if (this.checkCollision()) {
            this.position.z -= this.velocity.z * delta;
        }
    }

    checkCollision() {
        const minX = Math.floor(this.position.x - this.dimensions.x / 2);
        const maxX = Math.floor(this.position.x + this.dimensions.x / 2);
        const minY = Math.floor(this.position.y);
        const maxY = Math.floor(this.position.y + this.dimensions.y);
        const minZ = Math.floor(this.position.z - this.dimensions.z / 2);
        const maxZ = Math.floor(this.position.z + this.dimensions.z / 2);

        for (let x = minX; x <= maxX; x++) {
            for (let y = minY; y <= maxY; y++) {
                for (let z = minZ; z <= maxZ; z++) {
                    if (this.map.hasBlock(x, y, z)) {
                        return true;
                    }
                }
            }
        }
        return false;
    }

    updateCamera() {
        // Position camera at eye height (~1.6 units above base)
        this.camera.position.set(this.position.x, this.position.y + 1.6, this.position.z);

        const lookDir = new THREE.Vector3(
            Math.sin(this.yaw) * Math.cos(this.pitch),
            Math.sin(this.pitch),
            Math.cos(this.yaw) * Math.cos(this.pitch)
        );

        const target = this.camera.position.clone().sub(lookDir);
        this.camera.lookAt(target);
    }

    breakBlock() {
        this.raycaster.setFromCamera(new THREE.Vector2(0, 0), this.camera);
        const intersects = this.raycaster.intersectObjects(this.map.worldBlocks);

        if (intersects.length > 0) {
            const hit = intersects[0];
            const p = hit.object.position;
            const bx = Math.floor(p.x);
            const by = Math.floor(p.y);
            const bz = Math.floor(p.z);

            this.map.removeBlock(bx, by, bz);
            if (this.game.emit) this.game.emit('onBlockBreak', { x: bx, y: by, z: bz });
        }
    }

    placeBlock() {
        this.raycaster.setFromCamera(new THREE.Vector2(0, 0), this.camera);
        const intersects = this.raycaster.intersectObjects(this.map.worldBlocks);

        if (intersects.length > 0) {
            const hit = intersects[0];
            const normal = hit.face.normal;
            const p = hit.object.position;

            const targetX = Math.floor(p.x + normal.x);
            const targetY = Math.floor(p.y + normal.y);
            const targetZ = Math.floor(p.z + normal.z);

            // Select block material based on slot
            const materialsList = ['grass', 'dirt', 'stone', 'gray', 'blue', 'red', 'yellow', 'water'];
            const matName = materialsList[(this.activeSlot - 1) % materialsList.length];
            const mat = this.map.materials[matName] || this.map.materials.grass;

            this.map.addBlock(targetX, targetY, targetZ, mat);
            if (this.game.emit) this.game.emit('onBlockPlace', { x: targetX, y: targetY, z: targetZ }, matName);
        }
    }
}
