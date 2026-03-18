(function (global) {
    const DEFAULT_ASSETS = {
        glbPath: "dildo.glb",
        throwSounds: ["sounds/Throw01.mp3", "sounds/Throw02.mp3"],
        woodHitSounds: ["sounds/WoodHit01.mp3", "sounds/WoodHit02.mp3", "sounds/WoodHit03.mp3"],
        correctSounds: [
            "sounds/hit-explosion-01.mp3",
            "sounds/hit-explosion-02.mp3",
            "sounds/hit-explosion-03.mp3",
            "sounds/hit-explosion-04.mp3"
        ],
        wrongSounds: ["sounds/wrong.wav"],
        beepleHitSounds: [
            "sounds/beeplehit1.mp3",
            "sounds/beeplehit2.mp3",
            "sounds/beeplehit3.mp3",
            "sounds/beeplehit4.mp3",
            "sounds/beeplehit5.mp3",
            "sounds/beeplehit6.mp3",
            "sounds/beeplehit7.mp3",
            "sounds/beeplehit8.mp3",
            "sounds/beeplehit9.mp3"
        ],
        explosionFrames: [
            "effects/enemy-explosion/enemy-explosion-1.png",
            "effects/enemy-explosion/enemy-explosion-2.png",
            "effects/enemy-explosion/enemy-explosion-3.png",
            "effects/enemy-explosion/enemy-explosion-4.png",
            "effects/enemy-explosion/enemy-explosion-5.png",
            "effects/enemy-explosion/enemy-explosion-6.png"
        ]
    };

    function clamp(value, min, max) {
        return Math.min(max, Math.max(min, value));
    }

    function buildAudioPool(srcs, options = {}) {
        const {
            volume = 1,
            cooldownMs = 0,
            stopPrevious = false,
            label = "audio"
        } = options;
        const pool = srcs.map((src) => {
            const audio = new Audio(src);
            audio.preload = "auto";
            audio.volume = volume;
            return audio;
        });
        let index = 0;
        let lastPlayTime = 0;
        let currentlyPlaying = null;

        function play() {
            const now = performance.now();
            if (cooldownMs > 0 && now - lastPlayTime < cooldownMs) return null;
            lastPlayTime = now;

            if (!pool.length) return null;
            const sound = pool[index];
            if (stopPrevious && currentlyPlaying && currentlyPlaying !== sound) {
                currentlyPlaying.pause();
                currentlyPlaying.currentTime = 0;
            }
            sound.currentTime = 0;
            sound.volume = volume;
            sound.play().catch((error) => console.warn(`${label} playback blocked`, error));
            currentlyPlaying = sound;
            index = (index + 1) % pool.length;
            return sound;
        }

        function stop() {
            pool.forEach((sound) => {
                sound.pause();
                sound.currentTime = 0;
            });
            currentlyPlaying = null;
        }

        return { play, stop, pool };
    }

    const throwSoundPool = buildAudioPool(DEFAULT_ASSETS.throwSounds, {
        label: "throw sound",
        cooldownMs: 120,
        volume: 0.35
    });
    const woodHitSoundPool = buildAudioPool(DEFAULT_ASSETS.woodHitSounds, {
        label: "wood hit sound",
        cooldownMs: 100,
        volume: 0.28
    });
    const correctSoundPool = buildAudioPool(DEFAULT_ASSETS.correctSounds, {
        label: "correct sound",
        cooldownMs: 70,
        volume: 0.27
    });
    const wrongSoundPool = buildAudioPool(DEFAULT_ASSETS.wrongSounds, {
        label: "wrong sound",
        cooldownMs: 70,
        volume: 0.4
    });
    const beepleHitSoundPool = buildAudioPool(DEFAULT_ASSETS.beepleHitSounds, {
        label: "beeple hit sound",
        cooldownMs: 150,
        stopPrevious: true,
        volume: 0.46
    });

    let flashOverlay = null;
    const activeCameraShakes = new WeakMap();
    let nextCameraShakeId = 1;

    function readCameraTarget(camera) {
        return camera?.getTarget?.()?.clone?.() || camera?.target?.clone?.() || null;
    }

    function writeCameraTarget(camera, target) {
        if (!camera || !target) return;
        if (typeof camera.setTarget === "function") {
            camera.setTarget(target);
        } else if (camera.target?.copyFrom) {
            camera.target.copyFrom(target);
        } else {
            camera.target = target.clone();
        }
    }

    function ensureFlashOverlay(doc = global.document) {
        if (!doc) return null;
        if (flashOverlay && flashOverlay.ownerDocument === doc) return flashOverlay;

        flashOverlay = doc.getElementById("dildo-flash-overlay");
        if (flashOverlay) return flashOverlay;

        flashOverlay = doc.createElement("div");
        flashOverlay.id = "dildo-flash-overlay";
        Object.assign(flashOverlay.style, {
            position: "fixed",
            inset: "0",
            pointerEvents: "none",
            backgroundColor: "white",
            opacity: "0",
            zIndex: "9999",
            mixBlendMode: "screen",
            willChange: "opacity, background-color",
            transition: "opacity 70ms linear"
        });
        doc.body.appendChild(flashOverlay);
        return flashOverlay;
    }

    function screenFlash(color = "white", intensity = 0.3, duration = 100, doc = global.document) {
        const overlay = ensureFlashOverlay(doc);
        if (!overlay) return;

        overlay.style.backgroundColor = color;
        overlay.style.transition = `opacity ${Math.max(45, Math.round(duration * 0.45))}ms linear`;
        overlay.style.opacity = String(clamp(intensity, 0, 1));
        global.setTimeout(() => {
            overlay.style.opacity = "0";
        }, duration);
    }

    function cameraShake(camera, intensity = 0.3, duration = 150) {
        const originalPosition = camera?.position?.clone?.();
        const originalTarget = readCameraTarget(camera);
        const originalFov = typeof camera?.fov === "number" ? camera.fov : null;
        if (!camera || !originalPosition || !originalTarget) {
            return { stop() {} };
        }

        let shakeState = activeCameraShakes.get(camera);
        if (!shakeState) {
            shakeState = {
                basePosition: originalPosition.clone(),
                baseTarget: originalTarget.clone(),
                baseFov: originalFov,
                effects: new Map(),
                intervalId: null
            };

            const tick = () => {
                const currentState = activeCameraShakes.get(camera);
                if (!currentState) return;

                const now = performance.now();
                const positionOffset = BABYLON.Vector3.Zero();
                const targetOffset = BABYLON.Vector3.Zero();
                let fovKick = 0;

                currentState.effects.forEach((effect, effectId) => {
                    const elapsed = now - effect.startTime;
                    if (elapsed >= effect.duration) {
                        currentState.effects.delete(effectId);
                        return;
                    }

                    const progress = clamp(elapsed / effect.duration, 0, 1);
                    const decay = Math.pow(1 - progress, 1.15);
                    const pulse = 0.55 + Math.abs(Math.sin(progress * Math.PI * 6.5));
                    const power = effect.intensity * decay * pulse;

                    positionOffset.addInPlace(new BABYLON.Vector3(
                        (Math.random() - 0.5) * power * 1.9,
                        (Math.random() - 0.5) * power * 1.5,
                        (Math.random() - 0.5) * power * 0.75
                    ));
                    targetOffset.addInPlace(new BABYLON.Vector3(
                        (Math.random() - 0.5) * power * 2.7,
                        (Math.random() - 0.5) * power * 2.15,
                        (Math.random() - 0.5) * power * 0.7
                    ));
                    fovKick += power * 0.018;
                });

                if (!currentState.effects.size) {
                    camera.position.copyFrom(currentState.basePosition);
                    writeCameraTarget(camera, currentState.baseTarget);
                    if (currentState.baseFov !== null) {
                        camera.fov = currentState.baseFov;
                    }
                    if (currentState.intervalId !== null) {
                        global.clearInterval(currentState.intervalId);
                    }
                    activeCameraShakes.delete(camera);
                    return;
                }

                camera.position.copyFrom(currentState.basePosition.add(positionOffset));
                writeCameraTarget(camera, currentState.baseTarget.add(targetOffset));
                if (currentState.baseFov !== null) {
                    camera.fov = currentState.baseFov - fovKick;
                }
            };

            shakeState.intervalId = global.setInterval(tick, 16);
            activeCameraShakes.set(camera, shakeState);
        }

        const effectId = nextCameraShakeId++;
        shakeState.effects.set(effectId, {
            intensity,
            duration,
            startTime: performance.now()
        });

        return {
            stop() {
                const currentState = activeCameraShakes.get(camera);
                if (!currentState) return;
                currentState.effects.delete(effectId);
                if (!currentState.effects.size) {
                    camera.position.copyFrom(currentState.basePosition);
                    writeCameraTarget(camera, currentState.baseTarget);
                    if (currentState.baseFov !== null) {
                        camera.fov = currentState.baseFov;
                    }
                    if (currentState.intervalId !== null) {
                        global.clearInterval(currentState.intervalId);
                    }
                    activeCameraShakes.delete(camera);
                }
            }
        };
    }

    function createImpactBurst(scene, position, size = 1, color = new BABYLON.Color3(1, 1, 1)) {
        if (!scene || !position) return null;

        const burst = BABYLON.MeshBuilder.CreateSphere(`impact_${Date.now()}`, {
            diameter: 0.5 * size,
            segments: 8
        }, scene);
        burst.position = position.clone();

        const material = new BABYLON.StandardMaterial(`impact_mat_${Date.now()}`, scene);
        material.emissiveColor = color;
        material.disableLighting = true;
        material.alpha = 0.8;
        burst.material = material;

        const startTime = performance.now();
        const duration = 150 * size;
        const observer = scene.onBeforeRenderObservable.add(() => {
            const progress = (performance.now() - startTime) / duration;
            if (progress >= 1) {
                scene.onBeforeRenderObservable.remove(observer);
                burst.dispose();
                material.dispose();
                return;
            }

            const scale = 1 + progress * 2 * size;
            burst.scaling.setAll(scale);
            material.alpha = 0.8 * (1 - progress);
        });

        return {
            mesh: burst,
            material,
            stop() {
                scene.onBeforeRenderObservable.remove(observer);
                burst.dispose();
                material.dispose();
            }
        };
    }

    function getEffectTextureCache(scene) {
        if (!scene.metadata || typeof scene.metadata !== "object") {
            scene.metadata = {};
        }
        if (!scene.metadata.__dildoMechanicsEffectTextures) {
            scene.metadata.__dildoMechanicsEffectTextures = new Map();
        }
        return scene.metadata.__dildoMechanicsEffectTextures;
    }

    function getTextureSequence(scene, framePaths) {
        const cache = getEffectTextureCache(scene);
        const key = framePaths.join("|");
        if (!cache.has(key)) {
            cache.set(key, framePaths.map((path) => {
                const texture = new BABYLON.Texture(
                    path,
                    scene,
                    false,
                    true,
                    BABYLON.Texture.NEAREST_SAMPLINGMODE
                );
                texture.hasAlpha = true;
                return texture;
            }));
        }
        return cache.get(key);
    }

    function preloadExplosionFrames(scene, framePaths = DEFAULT_ASSETS.explosionFrames) {
        if (!scene) return [];
        return getTextureSequence(scene, framePaths);
    }

    function createExplosionSprite(scene, position, options = {}) {
        if (!scene || !position) return null;

        const {
            framePaths = DEFAULT_ASSETS.explosionFrames,
            size = 5.4,
            growth = 1.85,
            duration = 380,
            alpha = 1,
            zOffset = 0.72
        } = options;

        const frames = getTextureSequence(scene, framePaths);
        if (!frames.length) return null;

        const plane = BABYLON.MeshBuilder.CreatePlane(`explosion_${Date.now()}`, { size }, scene);
        plane.position = position.clone();
        plane.position.z += zOffset;
        plane.billboardMode = BABYLON.Mesh.BILLBOARDMODE_ALL;
        plane.renderingGroupId = 2;

        const material = new BABYLON.StandardMaterial(`explosion_mat_${Date.now()}`, scene);
        let frameIndex = Math.min(frames.length - 1, 2);
        material.diffuseTexture = frames[frameIndex];
        material.opacityTexture = frames[frameIndex];
        material.emissiveTexture = frames[frameIndex];
        material.diffuseColor = BABYLON.Color3.FromHexString("#ff7043");
        material.emissiveColor = BABYLON.Color3.FromHexString("#ffc56d");
        material.disableLighting = true;
        material.useAlphaFromDiffuseTexture = true;
        material.backFaceCulling = false;
        material.alpha = alpha;
        material.transparencyMode = BABYLON.Material.MATERIAL_ALPHABLEND;
        plane.material = material;

        const startTime = performance.now();
        const observer = scene.onBeforeRenderObservable.add(() => {
            const elapsed = performance.now() - startTime;
            const progress = clamp(elapsed / duration, 0, 1);
            const nextFrame = Math.min(frames.length - 1, 2 + Math.floor(progress * Math.max(1, frames.length - 2)));
            if (nextFrame !== frameIndex) {
                frameIndex = nextFrame;
                material.diffuseTexture = frames[frameIndex];
                material.opacityTexture = frames[frameIndex];
                material.emissiveTexture = frames[frameIndex];
            }

            const scale = 0.72 + progress * growth;
            plane.scaling.set(scale, scale, scale);
            material.alpha = alpha * (1 - progress * 0.65);

            if (progress >= 1) {
                scene.onBeforeRenderObservable.remove(observer);
                plane.dispose();
                material.dispose();
            }
        });

        return {
            mesh: plane,
            material,
            stop() {
                scene.onBeforeRenderObservable.remove(observer);
                plane.dispose();
                material.dispose();
            }
        };
    }

    function loadDildoTemplate(scene, options = {}) {
        const {
            rootUrl = "./",
            file = DEFAULT_ASSETS.glbPath,
            hideSource = true
        } = options;

        if (!scene || !global.BABYLON) {
            return Promise.reject(new Error("BABYLON scene is required"));
        }

        return BABYLON.SceneLoader.ImportMeshAsync("", rootUrl, file, scene).then((result) => {
            if (result.animationGroups) {
                result.animationGroups.forEach((group) => {
                    group.stop();
                    group.dispose();
                });
            }

            const meshes = result.meshes || [];
            const geometryMeshes = meshes.filter((mesh) => mesh && mesh.name !== "__root__" && (mesh.getTotalVertices?.() || 0) > 0);
            if (hideSource) {
                meshes.forEach((mesh) => mesh.setEnabled(false));
            }

            const template = geometryMeshes[0] || meshes[0] || null;
            if (template) {
                template._allMeshes = meshes;
            }

            return {
                template,
                meshes,
                geometryMeshes,
                file
            };
        });
    }

    function cloneTemplateMeshes(template, scene, options = {}) {
        if (!template || !template._allMeshes || !scene) {
            return null;
        }

        const root = new BABYLON.TransformNode(options.name || `dildo_root_${Date.now()}`, scene);
        const clones = [];
        const skipNames = options.skipNames || ["plane", "cube", "floor", "ground", "grid", "background", "rect"];

        template._allMeshes.forEach((mesh) => {
            const hasGeometry = mesh && mesh.name !== "__root__" && (mesh.getTotalVertices?.() || 0) > 0;
            const nameLower = String(mesh?.name || "").toLowerCase();
            const shouldSkip = skipNames.some((skip) => nameLower.includes(skip));
            if (!hasGeometry || shouldSkip) return;

            const clone = mesh.clone(`${mesh.name}_${options.name || "dildo"}`, root);
            if (clone) {
                clone.setEnabled(true);
                clone.isVisible = true;
                clones.push(clone);
            }
        });

        return { root, clones };
    }

    function setNodeRotation(node, rotation = {}) {
        if (!node) return;

        const hasQuaternion = node.rotationQuaternion && typeof node.rotationQuaternion.copyFromFloats === "function";
        if (rotation.quaternion) {
            if (!node.rotationQuaternion) {
                node.rotationQuaternion = rotation.quaternion.clone();
            } else {
                node.rotationQuaternion.copyFrom(rotation.quaternion);
            }
            return;
        }

        if (rotation.axis && typeof rotation.angle === "number") {
            const quaternion = BABYLON.Quaternion.RotationAxis(rotation.axis, rotation.angle);
            if (!node.rotationQuaternion) {
                node.rotationQuaternion = quaternion;
            } else {
                node.rotationQuaternion.copyFrom(quaternion);
            }
            return;
        }

        if (hasQuaternion) {
            node.rotationQuaternion = BABYLON.Quaternion.FromEulerAngles(
                rotation.x || 0,
                rotation.y || 0,
                rotation.z || 0
            );
            return;
        }

        node.rotation.x = rotation.x || 0;
        node.rotation.y = rotation.y || 0;
        node.rotation.z = rotation.z || 0;
    }

    function playThrowSound() {
        return throwSoundPool.play();
    }

    function playWoodHitSound() {
        return woodHitSoundPool.play();
    }

    function playCorrectSound() {
        return correctSoundPool.play();
    }

    function playWrongSound() {
        return wrongSoundPool.play();
    }

    function playBeepleHitSound() {
        return beepleHitSoundPool.play();
    }

    function spawnThrownDildo(scene, template, options = {}) {
        const {
            startPosition = new BABYLON.Vector3(0, 0, 0),
            endPosition = new BABYLON.Vector3(0, 0, 10),
            duration = 0.5,
            arc = 1.2,
            scale = 0.3,
            name = `thrown_dildo_${Date.now()}`,
            autoPlaySound = true,
            rotation = null,
            onComplete = null
        } = options;

        const clone = cloneTemplateMeshes(template, scene, { name });
        if (!clone) {
            return null;
        }

        const { root, clones } = clone;
        root.position.copyFrom(startPosition);
        root.scaling.setAll(scale);
        if (rotation) {
            setNodeRotation(root, rotation);
        }

        const state = {
            elapsed: 0,
            done: false
        };

        if (autoPlaySound) {
            playThrowSound();
        }

        const observer = scene.onBeforeRenderObservable.add(() => {
            if (state.done) return;

            const dt = scene.getEngine().getDeltaTime() / 1000;
            state.elapsed += dt;
            const t = clamp(state.elapsed / duration, 0, 1);

            const position = BABYLON.Vector3.Lerp(startPosition, endPosition, t);
            position.y += Math.sin(Math.PI * t) * arc;
            root.position.copyFrom(position);

            if (t >= 1) {
                state.done = true;
                scene.onBeforeRenderObservable.remove(observer);
                if (typeof onComplete === "function") onComplete({ root, clones });
            }
        });

        return {
            root,
            clones,
            stop() {
                state.done = true;
                scene.onBeforeRenderObservable.remove(observer);
            },
            dispose() {
                state.done = true;
                scene.onBeforeRenderObservable.remove(observer);
                clones.forEach((mesh) => mesh?.dispose?.());
                root?.dispose?.();
            }
        };
    }

    const api = {
        loadDildoTemplate,
        cloneTemplateMeshes,
        spawnThrownDildo,
        playThrowSound,
        playWoodHitSound,
        playCorrectSound,
        playWrongSound,
        playBeepleHitSound,
        screenFlash,
        cameraShake,
        createImpactBurst,
        createExplosionSprite,
        preloadExplosionFrames,
        ensureFlashOverlay,
        createAudioPool: buildAudioPool
    };

    global.DildoMechanics = api;
    global.createDildoMechanics = () => api;
    global.playThrowSound = playThrowSound;
    global.playWoodHitSound = playWoodHitSound;
    global.playCorrectSound = playCorrectSound;
    global.playWrongSound = playWrongSound;
    global.playBeepleHitSound = playBeepleHitSound;
    global.screenFlash = screenFlash;
    global.cameraShake = cameraShake;
    global.createImpactBurst = createImpactBurst;
    global.createExplosionSprite = createExplosionSprite;
    global.preloadExplosionFrames = preloadExplosionFrames;
    global.loadDildoTemplate = loadDildoTemplate;
    global.spawnThrownDildo = spawnThrownDildo;
    global.ensureDildoFlashOverlay = ensureFlashOverlay;
})(globalThis);
