import * as THREE from "three";
import { gsap } from "gsap";
const BLOCK_HEIGHT = 2.4;
const STARTING_BLOCK_COLORS = [
    0xe76f51,
    0xf4a261,
    0x2a9d8f,
    0x6c63ff,
    0x4a90e2,
];

function getRequiredElement(id) {
    const element = document.getElementById(id);
    if (!element) {
        throw new Error(`Required HTML element #${id} was not found.`);
    }
    return element;
}
class Stage {
    container;
    camera;
    scene;
    renderer;
    light;
    softLight;
    cameraTarget;
    constructor() {
        this.container = getRequiredElement("game");
        // Renderer
        this.renderer = new THREE.WebGLRenderer({
            antialias: true,
            alpha: false,
        });
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setClearColor(0xb58cff, 1);
        this.container.appendChild(this.renderer.domElement);
        // Scene
        this.scene = new THREE.Scene();
        // Camera
        const aspect = window.innerWidth / window.innerHeight;
        const viewSize = 20;
        this.camera = new THREE.OrthographicCamera(-viewSize * aspect, viewSize * aspect, viewSize, -viewSize, -100, 1000);
        this.camera.position.set(2, 2, 2);
        // Store the point the camera looks at separately.
        // camera.lookAt is a method, not an animatable position.
        this.cameraTarget = new THREE.Vector3(0, 0, 0);
        this.camera.lookAt(this.cameraTarget);
        // Lighting
        this.light = new THREE.DirectionalLight(0xffffff, 0.5);
        this.light.position.set(0, 499, 0);
        this.scene.add(this.light);
        this.softLight = new THREE.AmbientLight(0xffffff, 0.4);
        this.scene.add(this.softLight);
        window.addEventListener("resize", this.onResize);
        this.onResize();
    }
    setCamera(y, speed = 0.3) {
        gsap.to(this.camera.position, {
            duration: speed,
            y: y + 4,
            ease: "power1.inOut",
        });
        gsap.to(this.cameraTarget, {
            duration: speed,
            y,
            ease: "power1.inOut",
            onUpdate: () => {
                this.camera.lookAt(this.cameraTarget);
            },
        });
    }
    onResize = () => {
        const viewSize = 20;
        const aspect = window.innerWidth / window.innerHeight;
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.camera.left = -viewSize * aspect;
        this.camera.right = viewSize * aspect;
        this.camera.top = viewSize;
        this.camera.bottom = -viewSize;
        this.camera.updateProjectionMatrix();
    };
    render = () => {
        this.renderer.render(this.scene, this.camera);
    };
    add(element) {
        this.scene.add(element);
    }
    remove(element) {
        this.scene.remove(element);
    }
}
class Block {
    STATES = {
        ACTIVE: "active",
        STOPPED: "stopped",
        MISSED: "missed",
    };
    MOVE_AMOUNT = 12;
    dimension;
    position;
    mesh;
    state;
    index;
    speed;
    direction;
    colorOffset;
    color;
    material;
    workingPlane;
    workingDimension;
    targetBlock;
    constructor(block) {
        this.targetBlock = block;
        this.index = (block?.index ?? 0) + 1;
        this.workingPlane = this.index % 2 ? "x" : "z";
        this.workingDimension = this.index % 2 ? "width" : "depth";
        this.dimension = {
            width: block?.dimension.width ?? 12,
            height: block?.dimension.height ?? BLOCK_HEIGHT,
            depth: block?.dimension.depth ?? 12,
        };
        this.position = {
            x: block?.position.x ?? 0,
            y: this.dimension.height * this.index,
            z: block?.position.z ?? 0,
        };
        this.colorOffset =
            block?.colorOffset ?? Math.round(Math.random() * 100);
        // Color
        if (!block) {
            this.color =
                STARTING_BLOCK_COLORS[
                    Math.floor(Math.random() * STARTING_BLOCK_COLORS.length)
                ];
        }
        else {
            const offset = this.index + this.colorOffset;
            const r = Math.sin(0.3 * offset) * 55 + 200;
            const g = Math.sin(0.3 * offset + 2) * 55 + 200;
            const b = Math.sin(0.3 * offset + 4) * 55 + 200;
            this.color = new THREE.Color(r / 255, g / 255, b / 255);
        }
        // State
        this.state = this.index > 1 ? this.STATES.ACTIVE : this.STATES.STOPPED;
        // Movement speed
        this.speed = Math.max(-0.1 - this.index * 0.005, -4);
        this.direction = this.speed;
        // Geometry
        const geometry = new THREE.BoxGeometry(this.dimension.width, this.dimension.height, this.dimension.depth);
        geometry.applyMatrix4(new THREE.Matrix4().makeTranslation(this.dimension.width / 2, this.dimension.height / 2, this.dimension.depth / 2));
        this.material = new THREE.MeshToonMaterial({
            color: this.color,
        });
        this.mesh = new THREE.Mesh(geometry, this.material);
        this.mesh.position.set(this.position.x, this.position.y, this.position.z);
        if (this.state === this.STATES.ACTIVE) {
            this.position[this.workingPlane] =
                Math.random() > 0.5 ? -this.MOVE_AMOUNT : this.MOVE_AMOUNT;
        }
    }
    reverseDirection() {
        this.direction = this.direction > 0 ? this.speed : Math.abs(this.speed);
    }
    place() {
        this.state = this.STATES.STOPPED;
        const target = this.targetBlock;
        if (!target) {
            throw new Error("Cannot place the base block.");
        }
        let overlap = target.dimension[this.workingDimension] -
            Math.abs(this.position[this.workingPlane] -
                target.position[this.workingPlane]);
        const result = {
            plane: this.workingPlane,
            direction: this.direction,
        };
        // Nearly perfect placement bonus
        if (this.dimension[this.workingDimension] - overlap < 0.3) {
            overlap = this.dimension[this.workingDimension];
            result.bonus = true;
            this.position.x = target.position.x;
            this.position.z = target.position.z;
            this.dimension.width = target.dimension.width;
            this.dimension.depth = target.dimension.depth;
        }
        if (overlap > 0) {
            const choppedDimensions = {
                width: this.dimension.width,
                height: this.dimension.height,
                depth: this.dimension.depth,
            };
            choppedDimensions[this.workingDimension] -= overlap;
            this.dimension[this.workingDimension] = overlap;
            // The remaining placed block
            const placedGeometry = new THREE.BoxGeometry(this.dimension.width, this.dimension.height, this.dimension.depth);
            placedGeometry.applyMatrix4(new THREE.Matrix4().makeTranslation(this.dimension.width / 2, this.dimension.height / 2, this.dimension.depth / 2));
            const placedMesh = new THREE.Mesh(placedGeometry, this.material);
            // The chopped-off piece
            const choppedGeometry = new THREE.BoxGeometry(choppedDimensions.width, choppedDimensions.height, choppedDimensions.depth);
            choppedGeometry.applyMatrix4(new THREE.Matrix4().makeTranslation(choppedDimensions.width / 2, choppedDimensions.height / 2, choppedDimensions.depth / 2));
            const choppedMesh = new THREE.Mesh(choppedGeometry, this.material);
            const choppedPosition = {
                x: this.position.x,
                y: this.position.y,
                z: this.position.z,
            };
            if (this.position[this.workingPlane] <
                target.position[this.workingPlane]) {
                this.position[this.workingPlane] =
                    target.position[this.workingPlane];
            }
            else {
                choppedPosition[this.workingPlane] += overlap;
            }
            placedMesh.position.set(this.position.x, this.position.y, this.position.z);
            choppedMesh.position.set(choppedPosition.x, choppedPosition.y, choppedPosition.z);
            result.placed = placedMesh;
            if (!result.bonus) {
                result.chopped = choppedMesh;
            }
        }
        else {
            this.state = this.STATES.MISSED;
        }
        this.dimension[this.workingDimension] = overlap;
        return result;
    }
    tick() {
        if (this.state !== this.STATES.ACTIVE) {
            return;
        }
        const value = this.position[this.workingPlane];
        if (value > this.MOVE_AMOUNT || value < -this.MOVE_AMOUNT) {
            this.reverseDirection();
        }
        this.position[this.workingPlane] += this.direction;
        this.mesh.position[this.workingPlane] =
            this.position[this.workingPlane];
    }
}
class Game {
    STATES = {
        LOADING: "loading",
        PLAYING: "playing",
        READY: "ready",
        ENDED: "ended",
        RESETTING: "resetting",
    };
    blocks = [];
    state = this.STATES.LOADING;
    // Stage
    stage;
    // Groups
    newBlocks;
    placedBlocks;
    choppedBlocks;
    // UI
    scoreContainer;
    mainContainer;
    instructions;
    constructor() {
        this.stage = new Stage();
        this.mainContainer = getRequiredElement("container");
        this.scoreContainer = getRequiredElement("score");
        getRequiredElement("start-button");
        this.instructions = getRequiredElement("instructions");
        this.scoreContainer.textContent = "0";
        this.newBlocks = new THREE.Group();
        this.placedBlocks = new THREE.Group();
        this.choppedBlocks = new THREE.Group();
        this.stage.add(this.newBlocks);
        this.stage.add(this.placedBlocks);
        this.stage.add(this.choppedBlocks);
        this.addBlock();
        this.tick();
        this.updateState(this.STATES.READY);
        document.addEventListener("keydown", (event) => {
            if (event.code === "Space") {
                event.preventDefault();
                this.onAction();
            }
        });
        document.addEventListener("click", () => {
            this.onAction();
        });
        document.addEventListener("touchstart", (event) => {
            // Preserve the original behavior: touchstart does not
            // place a block because mobile browsers also emit clicks.
            event.preventDefault();
        }, { passive: false });
    }
    updateState(newState) {
        Object.values(this.STATES).forEach((state) => {
            this.mainContainer.classList.remove(state);
        });
        this.mainContainer.classList.add(newState);
        this.state = newState;
    }
    onAction() {
        switch (this.state) {
            case this.STATES.READY:
                this.startGame();
                break;
            case this.STATES.PLAYING:
                this.placeBlock();
                break;
            case this.STATES.ENDED:
                this.restartGame();
                break;
        }
    }
    startGame() {
        if (this.state === this.STATES.PLAYING) {
            return;
        }
        this.scoreContainer.textContent = "0";
        this.updateState(this.STATES.PLAYING);
        this.addBlock();
    }
    restartGame() {
        this.updateState(this.STATES.RESETTING);
        // Take a snapshot because children are removed during animation.
        const oldBlocks = [...this.placedBlocks.children];
        const removeSpeed = 0.2;
        const delayAmount = 0.02;
        oldBlocks.forEach((block, index) => {
            const delay = (oldBlocks.length - index) * delayAmount;
            gsap.to(block.scale, {
                duration: removeSpeed,
                x: 0,
                y: 0,
                z: 0,
                delay,
                ease: "power1.in",
                onComplete: () => {
                    this.placedBlocks.remove(block);
                },
            });
            gsap.to(block.rotation, {
                duration: removeSpeed,
                y: 0.5,
                delay,
                ease: "power1.in",
            });
        });
        const cameraMoveSpeed = removeSpeed * 2 + oldBlocks.length * delayAmount;
        this.stage.setCamera(BLOCK_HEIGHT, cameraMoveSpeed);
        const countdown = {
            value: this.blocks.length - 1,
        };
        gsap.to(countdown, {
            duration: cameraMoveSpeed,
            value: 0,
            onUpdate: () => {
                this.scoreContainer.textContent = String(Math.round(countdown.value));
            },
        });
        this.blocks = this.blocks.slice(0, 1);
        window.setTimeout(() => {
            this.startGame();
        }, cameraMoveSpeed * 1000);
    }
    placeBlock() {
        const currentBlock = this.blocks[this.blocks.length - 1];
        if (!currentBlock) {
            return;
        }
        const result = currentBlock.place();
        this.newBlocks.remove(currentBlock.mesh);
        if (result.placed) {
            this.placedBlocks.add(result.placed);
        }
        if (result.chopped && result.placed) {
            const chopped = result.chopped;
            this.choppedBlocks.add(chopped);
            const moveDirection = chopped.position[result.plane] >
                result.placed.position[result.plane]
                ? 1
                : -1;
            const rotateRandomness = 10;
            const rotationParams = {
                x: result.plane === "z"
                    ? Math.random() * rotateRandomness -
                        rotateRandomness / 2
                    : 0.1,
                z: result.plane === "x"
                    ? Math.random() * rotateRandomness -
                        rotateRandomness / 2
                    : 0.1,
                y: Math.random() * 0.1,
            };
            gsap.to(chopped.position, {
                duration: 1,
                y: "-=30",
                [result.plane]: moveDirection * 40 * Math.abs(result.direction),
                ease: "power1.in",
                onComplete: () => {
                    this.choppedBlocks.remove(chopped);
                },
            });
            gsap.to(chopped.rotation, {
                duration: 1,
                delay: 0.05,
                ...rotationParams,
            });
        }
        this.addBlock();
    }
    addBlock() {
        const lastBlock = this.blocks[this.blocks.length - 1];
        if (lastBlock && lastBlock.state === lastBlock.STATES.MISSED) {
            this.endGame();
            return;
        }
        this.scoreContainer.textContent = String(this.blocks.length - 1);
        const newBlock = new Block(lastBlock);
        this.newBlocks.add(newBlock.mesh);
        this.blocks.push(newBlock);
        this.stage.setCamera(this.blocks.length * BLOCK_HEIGHT);
        if (this.blocks.length >= 5) {
            this.instructions.classList.add("hide");
        }
    }
    endGame() {
        this.updateState(this.STATES.ENDED);
    }
    tick = () => {
        const currentBlock = this.blocks[this.blocks.length - 1];
        currentBlock?.tick();
        this.stage.render();
        requestAnimationFrame(this.tick);
    };
}
const game = new Game();
