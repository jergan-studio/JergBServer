import * as THREE from 'three';

class SeededRandom {
    constructor(seed = 12345) {
        this.setSeed(seed);
    }

    setSeed(seed) {
        if (typeof seed === 'string') {
            let h = 2166136261;
            for (let i = 0; i < seed.length; i++) {
                h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
            }
            this.seed = h >>> 0;
        } else {
            this.seed = Math.abs(seed) || 12345;
        }
    }

    next() {
        this.seed = (this.seed * 9301 + 49297) % 233280;
        return this.seed / 233280;
    }
}

class FastNoise {
    constructor(prng) {
        this.prng = prng;
        this.perm = new Uint8Array(512);
        this.init();
    }

    init() {
        const p = new Uint8Array(256);
        for (let i = 0; i < 256; i++) p[i] = i;
        for (let i = 255; i > 0; i--) {
            const j = Math.floor(this.prng.next() * (i + 1));
            const temp = p[i];
            p[i] = p[j];
            p[j] = temp;
        }
        for (let i = 0; i < 512; i++) {
            this.perm[i] = p[i & 255];
        }
    }

    fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }
    lerp(t, a, b) { return a + t * (b - a); }

    get2D(x, y) {
        const X = Math.floor(x) & 255;
        const Y = Math.floor(y) & 255;
        const xf = x - Math.floor(x);
        const yf = y - Math.floor(y);
        const u = this.fade(xf);
        const v = this.fade(yf);

        const aa = this.perm[this.perm[X] + Y];
        const ab = this.perm[this.perm[X] + Y + 1];
        const ba = this.perm[this.perm[X + 1] + Y];
        const bb = this.perm[this.perm[X + 1] + Y + 1];

        const x1 = this.lerp(u, aa / 255, ba / 255);
        const x2 = this.lerp(u, ab / 255, bb / 255);

        return this.lerp(v, x1, x2);
    }
}

export class MapGenerator {
    constructor(scene, seed = 'JergBuilder_Default', mapSize = 32) {
        this.scene = scene;
        this.seed = seed;
        this.mapSize = mapSize;
        this.waterLevel = 2;

        this.prng = new SeededRandom(this.seed);
        this.noise = new FastNoise(this.prng);

        this.blockGeometry = new THREE.BoxGeometry(1, 1, 1);
        this.materials = this.initMaterials();

        this.worldBlocks = [];
        this.blockMap = new Map();
    }

    initMaterials() {
        return {
            grass: new THREE.MeshLambertMaterial({ color: 0x557a2b }),
            dirt: new THREE.MeshLambertMaterial({ color: 0x5c4033 }),
            stone: new THREE.MeshLambertMaterial({ color: 0x777777 }),
            water: new THREE.MeshLambertMaterial({ color: 0x3388ff, transparent: true, opacity: 0.75 }),
            gray: new THREE.MeshLambertMaterial({ color: 0x808080 }),
            blue: new THREE.MeshLambertMaterial({ color: 0x1e90ff }),
            red: new THREE.MeshLambertMaterial({ color: 0xff3333 }),
            yellow: new THREE.MeshLambertMaterial({ color: 0xffd700 })
        };
    }

    setSeed(newSeed) {
        this.seed = newSeed;
        this.prng.setSeed(newSeed);
        this.noise = new FastNoise(this.prng);
    }

    generate(seedOverride = null) {
        if (seedOverride !== null) this.setSeed(seedOverride);
        this.clearMap();

        const halfSize = Math.floor(this.mapSize / 2);

        for (let x = -halfSize; x < halfSize; x++) {
            for (let z = -halfSize; z < halfSize; z++) {
                const nx = x * 0.08;
                const nz = z * 0.08;
                const rawHeight = this.noise.get2D(nx + 100, nz + 100);
                const maxTerrainHeight = Math.floor(rawHeight * 8) + 1;

                for (let y = 0; y <= maxTerrainHeight; y++) {
                    let mat = this.materials.stone;
                    if (y === maxTerrainHeight) {
                        mat = (y <= this.waterLevel) ? this.materials.dirt : this.materials.grass;
                    } else if (y >= maxTerrainHeight - 2) {
                        mat = this.materials.dirt;
                    }
                    this.addBlock(x, y, z, mat);
                }

                for (let y = maxTerrainHeight + 1; y <= this.waterLevel; y++) {
                    this.addBlock(x, y, z, this.materials.water);
                }
            }
        }
        return this.worldBlocks;
    }

    addBlock(x, y, z, material = this.materials.grass) {
        const key = `${x},${y},${z}`;
        if (this.blockMap.has(key)) return null;

        const block = new THREE.Mesh(this.blockGeometry, material);
        block.position.set(x + 0.5, y + 0.5, z + 0.5);
        block.castShadow = true;
        block.receiveShadow = true;

        if (this.scene) this.scene.add(block);
        this.worldBlocks.push(block);
        this.blockMap.set(key, block);
        return block;
    }

    removeBlock(x, y, z) {
        const key = `${x},${y},${z}`;
        const block = this.blockMap.get(key);
        if (block) {
            if (this.scene) this.scene.remove(block);
            const idx = this.worldBlocks.indexOf(block);
            if (idx !== -1) this.worldBlocks.splice(idx, 1);
            this.blockMap.delete(key);
        }
    }

    hasBlock(x, y, z) {
        return this.blockMap.has(`${Math.floor(x)},${Math.floor(y)},${Math.floor(z)}`);
    }

    clearMap() {
        if (this.scene) {
            this.worldBlocks.forEach(block => this.scene.remove(block));
        }
        this.worldBlocks = [];
        this.blockMap.clear();
    }
}
