(function () {
    const MODES = {
        BOOT: "boot",
        INTRO_TAP: "intro_tap",
        INTRO_THROW: "intro_throw",
        INTRO_HIT: "intro_hit",
        COUNTDOWN: "countdown",
        PLAYING: "playing",
        RESULTS: "results",
        CAMERA_ERROR: "camera_error"
    };

    const DEFAULT_CONFIG = {
        backgroundPath: "HDogQOybEAAutN2.jpeg",
        roundDuration: 60,
        cameraZ: 18,
        cameraFov: 0.72,
        stageWidth: 26,
        throwOrigin: { x: 0, y: -5.1, z: 11.2 },
        throwArc: 1.35,
        throwDuration: 0.5,
        throwCooldownMs: 500,
        targetCooldown: 0.9,
        handThrowThreshold: 0.05,
        dildoWorldHeight: 3.2,
        dildoScaleNear: 1.08,
        dildoScaleFar: 0.7
    };

    const DEFAULT_TARGETS = [
        { id: "target-1", label: "1", points: 3, u: 0.129, v: 0.739, width: 0.168, height: 0.339 },
        { id: "target-2", label: "2", points: 5, u: 0.258, v: 0.488, width: 0.074, height: 0.31 },
        { id: "target-3", label: "3", points: 7, u: 0.339, v: 0.55, width: 0.07, height: 0.268 },
        { id: "target-4", label: "4", points: 3, u: 0.422, v: 0.525, width: 0.117, height: 0.46 },
        { id: "target-5", label: "5", points: 10, u: 0.554, v: 0.709, width: 0.116, height: 0.58 },
        { id: "target-6", label: "6", points: 1, u: 0.666, v: 0.665, width: 0.135, height: 0.67 },
        { id: "target-7", label: "7", points: 1, u: 0.824, v: 0.616, width: 0.09, height: 0.2 }
    ];

    const FIXED_STEP = 1 / 60;
    const VELOCITY_HISTORY_SIZE = 5;
    const MAX_REALTIME_FRAME_DELTA = 0.1;
    const MAX_SIMULATION_STEPS_PER_FRAME = 5;
    const DILDO_FILE = "dildo.glb";
    const BACKGROUND_MUSIC_FILES = [
        "sounds/CTBDTBTS1.mp3",
        "sounds/CTBDTBTS2.mp3"
    ];
    const BACKGROUND_MUSIC_VOLUME = 0.9;
    const GAME_TITLE = "CTBD\nTBTS";
    const PLAYFUN_STORAGE_KEY = "vanity-fair-session-history-v1";
    const MAX_SESSION_HISTORY = 20;
    const HIT_EXPLOSION_FRAMES = [
        "effects/enemy-explosion/enemy-explosion-3.png",
        "effects/enemy-explosion/enemy-explosion-4.png",
        "effects/enemy-explosion/enemy-explosion-5.png",
        "effects/enemy-explosion/enemy-explosion-6.png"
    ];
    const HIT_STOP_DURATION = 0.085;
    const DEFAULT_PLAYFUN_CONFIG = {
        enabled: false,
        apiKey: "",
        gameId: "",
        usePointsWidget: true,
        theme: "system",
        accuracyBonusMultiplier: 0.5
    };
    const DEVICE_PROFILE = detectDeviceProfile();

    const state = {
        mode: MODES.BOOT,
        config: null,
        stageWidth: 0,
        stageHeight: 0,
        targets: [],
        projectiles: [],
        score: 0,
        throws: 0,
        hits: 0,
        misses: 0,
        bestHit: 0,
        timeRemaining: 60,
        countdownRemaining: 0,
        hitStopRemaining: 0,
        sceneReady: false,
        useVirtualTime: false,
        realTimeLast: 0,
        realTimeAccumulator: 0,
        nextThrowAt: 0,
        assets: {
            status: "loading",
            file: DILDO_FILE,
            template: null
        },
        audio: {
            soundtrack: null,
            soundtrackTrackIndex: 0,
            soundtrackUnlocked: false,
            soundtrackRequested: false,
            soundtrackPlaying: false,
            soundtrackError: ""
        },
        playfun: {
            config: { ...DEFAULT_PLAYFUN_CONFIG },
            sdk: null,
            ready: false,
            status: "disabled",
            error: "",
            currentSessionId: 0,
            currentSessionSummary: null,
            pendingSessionSummary: null,
            savingSessionId: null,
            history: []
        },
        hand: {
            trackingState: "idle",
            visible: false,
            screenU: 0.5,
            screenV: 0.5,
            currentVelocity: { x: 0, y: 0, z: 0 },
            velocityHistory: [],
            previousWristX: null,
            previousWristY: null,
            previousHandZ: null,
            aimTargetId: null,
            error: "",
            stream: null,
            pumpToken: 0
        }
    };

    const ui = {
        appShell: document.getElementById("app-shell"),
        canvas: document.getElementById("renderCanvas"),
        hud: document.getElementById("play-hud"),
        hudScore: document.getElementById("hud-score"),
        hudTimer: document.getElementById("hud-timer"),
        instructionOverlay: document.getElementById("instruction-overlay"),
        instructionEyebrow: document.getElementById("instruction-eyebrow"),
        instructionTitle: document.getElementById("instruction-title"),
        instructionCopy: document.getElementById("instruction-copy"),
        aimReticle: document.getElementById("aim-reticle"),
        cameraPreviewShell: document.getElementById("camera-preview-shell"),
        hitEffectsLayer: document.getElementById("hit-effects-layer"),
        countdownOverlay: document.getElementById("countdown-overlay"),
        countdownValue: document.getElementById("countdown-value"),
        modalShell: document.getElementById("modal-shell"),
        modalEyebrow: document.getElementById("modal-eyebrow"),
        modalTitle: document.getElementById("modal-title"),
        modalCopy: document.getElementById("modal-copy"),
        retryCameraBtn: document.getElementById("retry-camera-btn"),
        playAgainBtn: document.getElementById("play-again-btn"),
        resultsGrid: document.getElementById("results-grid"),
        resultScore: document.getElementById("result-score"),
        resultThrows: document.getElementById("result-throws"),
        resultHits: document.getElementById("result-hits"),
        resultMisses: document.getElementById("result-misses"),
        resultAccuracy: document.getElementById("result-accuracy"),
        resultBestHit: document.getElementById("result-best-hit"),
        resultBonus: document.getElementById("result-bonus"),
        resultSessionReward: document.getElementById("result-session-reward"),
        resultSaveStatus: document.getElementById("result-save-status"),
        playfunApiKeyMeta: document.getElementById("ogp-key-meta") || document.getElementById("playfun-api-key-meta"),
        webcamVideo: document.getElementById("webcam"),
        handCanvas: document.getElementById("hand-canvas")
    };

    let engine;
    let scene;
    let camera;
    let backdropMesh;
    let handCtx;

    bootstrap().catch((error) => {
        console.error("Failed to bootstrap Vanity Fair:", error);
        state.mode = MODES.CAMERA_ERROR;
        state.hand.error = "The game failed to load.";
        updateUi();
    });

    async function bootstrap() {
        bindUi();
        initBackgroundMusic();

        const [config, fileTargets, playfunConfig] = await Promise.all([
            loadJson("scene-config.json", DEFAULT_CONFIG),
            loadJson("targets.json", DEFAULT_TARGETS),
            loadJson("playfun-config.json", DEFAULT_PLAYFUN_CONFIG)
        ]);

        state.config = { ...DEFAULT_CONFIG, ...config };
        state.targets = fileTargets.map(inflateTarget);
        state.timeRemaining = state.config.roundDuration;
        state.playfun.config = { ...DEFAULT_PLAYFUN_CONFIG, ...playfunConfig };
        state.playfun.history = loadSessionHistory();

        const backgroundImage = await loadImage(state.config.backgroundPath);
        state.stageWidth = state.config.stageWidth;
        state.stageHeight = state.stageWidth * (backgroundImage.height / backgroundImage.width);

        engine = new BABYLON.Engine(ui.canvas, !DEVICE_PROFILE.mobileLike, {
            preserveDrawingBuffer: false,
            stencil: true,
            powerPreference: "high-performance"
        });
        if (typeof engine.setHardwareScalingLevel === "function") {
            engine.setHardwareScalingLevel(DEVICE_PROFILE.hardwareScalingLevel);
        }

        scene = createScene(backgroundImage);
        if (typeof window.preloadExplosionFrames === "function") {
            window.preloadExplosionFrames(scene);
        }
        initPlayfun();
        updateUi();
        setupRealtimeLoop();
        window.addEventListener("resize", handleResize);
        window.addEventListener("pagehide", stopBackgroundMusic);
        state.sceneReady = true;

        void loadDildoAsset();
        if (DEVICE_PROFILE.mobileLike) {
            state.hand.trackingState = "disabled";
            maybeEnterIntro();
            updateUi();
        } else {
            void initHandTracking();
        }
    }

    function bindUi() {
        document.addEventListener("pointerdown", () => {
            if (typeof window.primeDildoAudio === "function") {
                void window.primeDildoAudio();
            }
            void primeBackgroundMusicFromGesture();
        }, { passive: true });
        ui.retryCameraBtn.addEventListener("click", () => {
            if (typeof window.primeDildoAudio === "function") {
                void window.primeDildoAudio();
            }
            void primeBackgroundMusicFromGesture();
            void initHandTracking(true);
        });
        ui.playAgainBtn.addEventListener("click", () => {
            if (typeof window.primeDildoAudio === "function") {
                void window.primeDildoAudio();
            }
            void primeBackgroundMusicFromGesture();
            if (DEVICE_PROFILE.mobileLike && state.mode === MODES.INTRO_TAP) {
                beginCountdown();
                return;
            }
            if (DEVICE_PROFILE.mobileLike || state.hand.trackingState === "ready") {
                beginCountdown();
            }
        });
    }

    function initBackgroundMusic() {
        const soundtrack = new Audio(BACKGROUND_MUSIC_FILES[0]);
        soundtrack.preload = "auto";
        soundtrack.loop = false;
        soundtrack.volume = BACKGROUND_MUSIC_VOLUME;
        soundtrack.addEventListener("play", () => {
            state.audio.soundtrackPlaying = true;
            state.audio.soundtrackError = "";
        });
        soundtrack.addEventListener("pause", () => {
            state.audio.soundtrackPlaying = false;
        });
        soundtrack.addEventListener("ended", () => {
            state.audio.soundtrackPlaying = false;
            if (state.audio.soundtrackRequested) {
                void advanceBackgroundMusicTrack();
            }
        });
        soundtrack.addEventListener("error", () => {
            state.audio.soundtrackError = "Background music failed to load.";
        });
        state.audio.soundtrack = soundtrack;
    }

    function syncBackgroundMusicSource() {
        const soundtrack = state.audio.soundtrack;
        if (!soundtrack) return;

        const nextSrc = BACKGROUND_MUSIC_FILES[state.audio.soundtrackTrackIndex] || BACKGROUND_MUSIC_FILES[0];
        if (soundtrack.src.endsWith(nextSrc)) return;

        soundtrack.src = nextSrc;
        soundtrack.currentTime = 0;
    }

    async function advanceBackgroundMusicTrack() {
        const soundtrack = state.audio.soundtrack;
        if (!soundtrack) return;

        soundtrack.pause();
        state.audio.soundtrackTrackIndex = (state.audio.soundtrackTrackIndex + 1) % BACKGROUND_MUSIC_FILES.length;
        syncBackgroundMusicSource();
        await ensureBackgroundMusicPlaying();
    }

    async function primeBackgroundMusicFromGesture() {
        const soundtrack = state.audio.soundtrack;
        if (!soundtrack || state.audio.soundtrackUnlocked) return;
        if (!soundtrack.paused && !soundtrack.ended) {
            state.audio.soundtrackUnlocked = true;
            return;
        }

        syncBackgroundMusicSource();

        const previousMuted = soundtrack.muted;
        soundtrack.muted = true;

        try {
            await soundtrack.play();
            soundtrack.pause();
            soundtrack.currentTime = 0;
            state.audio.soundtrackUnlocked = true;
        } catch (error) {
            state.audio.soundtrackError = error?.message || "Background music is waiting for a user gesture.";
        } finally {
            soundtrack.muted = previousMuted;
        }

        if (state.audio.soundtrackRequested) {
            void ensureBackgroundMusicPlaying();
        }
    }

    async function ensureBackgroundMusicPlaying() {
        const soundtrack = state.audio.soundtrack;
        if (!soundtrack) return;

        state.audio.soundtrackRequested = true;
        if (!soundtrack.paused && !soundtrack.ended) {
            state.audio.soundtrackPlaying = true;
            return;
        }

        syncBackgroundMusicSource();
        soundtrack.loop = false;
        soundtrack.volume = BACKGROUND_MUSIC_VOLUME;

        try {
            await soundtrack.play();
            state.audio.soundtrackPlaying = true;
            state.audio.soundtrackUnlocked = true;
            state.audio.soundtrackError = "";
        } catch (error) {
            state.audio.soundtrackPlaying = false;
            state.audio.soundtrackError = error?.message || "Background music playback was blocked.";
        }
    }

    function stopBackgroundMusic() {
        const soundtrack = state.audio.soundtrack;
        if (!soundtrack) return;
        soundtrack.pause();
        soundtrack.currentTime = 0;
        state.audio.soundtrackTrackIndex = 0;
        syncBackgroundMusicSource();
        state.audio.soundtrackPlaying = false;
        state.audio.soundtrackRequested = false;
    }

    function initPlayfun() {
        const config = state.playfun.config;
        const hasCredentials = Boolean(config.apiKey && config.gameId);

        if (ui.playfunApiKeyMeta) {
            ui.playfunApiKeyMeta.content = config.apiKey || "";
        }

        if (!config.enabled) {
            state.playfun.status = "disabled";
            return;
        }

        if (!hasCredentials) {
            state.playfun.status = "missing-config";
            state.playfun.error = "Add your Play.fun creator API key and game ID to playfun-config.json.";
            return;
        }

        if (typeof window.OpenGameSDK === "undefined") {
            state.playfun.status = "sdk-missing";
            state.playfun.error = "Play.fun SDK did not load.";
            return;
        }

        state.playfun.status = "connecting";
        try {
            const sdk = new window.OpenGameSDK({
                ui: {
                    usePointsWidget: config.usePointsWidget !== false,
                    theme: config.theme || "system"
                },
                logLevel: "info"
            });

            sdk.on("OnReady", () => {
                state.playfun.ready = true;
                state.playfun.status = "ready";
                state.playfun.error = "";
                void flushPendingPlayfunSave();
                updateUi();
            });

            sdk.on("SavePointsSuccess", () => {
                if (!state.playfun.currentSessionSummary) return;
                state.playfun.currentSessionSummary.saveState = "saved";
                state.playfun.currentSessionSummary.saveMessage = `Saved ${state.playfun.currentSessionSummary.rewardPoints} points to Play.fun.`;
                persistSessionSummary(state.playfun.currentSessionSummary);
                updateUi();
            });

            sdk.on("SavePointsFailed", (error) => {
                if (!state.playfun.currentSessionSummary) return;
                state.playfun.currentSessionSummary.saveState = "error";
                state.playfun.currentSessionSummary.saveMessage = "Play.fun save failed. Session kept locally.";
                state.playfun.currentSessionSummary.saveError = String(error?.message || error || "");
                persistSessionSummary(state.playfun.currentSessionSummary);
                updateUi();
            });

            sdk.init({ gameId: config.gameId });
            state.playfun.sdk = sdk;
        } catch (error) {
            state.playfun.status = "error";
            state.playfun.error = String(error?.message || error || "Play.fun initialization failed.");
        }
    }

    function loadSessionHistory() {
        try {
            const raw = window.localStorage.getItem(PLAYFUN_STORAGE_KEY);
            if (!raw) return [];
            const parsed = JSON.parse(raw);
            return Array.isArray(parsed) ? parsed : [];
        } catch (error) {
            console.warn("Failed to read local session history:", error);
            return [];
        }
    }

    function persistSessionSummary(summary) {
        if (!summary) return;

        const nextHistory = [...state.playfun.history];
        const existingIndex = nextHistory.findIndex((entry) => entry.sessionId === summary.sessionId);
        const serializedSummary = JSON.parse(JSON.stringify(summary));

        if (existingIndex >= 0) {
            nextHistory[existingIndex] = serializedSummary;
        } else {
            nextHistory.unshift(serializedSummary);
        }

        state.playfun.history = nextHistory.slice(0, MAX_SESSION_HISTORY);
        try {
            window.localStorage.setItem(PLAYFUN_STORAGE_KEY, JSON.stringify(state.playfun.history));
        } catch (error) {
            console.warn("Failed to write local session history:", error);
        }
    }

    function buildSessionSummary() {
        const accuracy = state.throws > 0 ? state.hits / state.throws : 0;
        const accuracyBonus = Math.round(state.score * accuracy * (state.playfun.config.accuracyBonusMultiplier || 0));
        const rewardPoints = Math.max(0, state.score + accuracyBonus);
        return {
            sessionId: state.playfun.currentSessionId,
            finishedAt: new Date().toISOString(),
            score: state.score,
            throws: state.throws,
            hits: state.hits,
            misses: state.misses,
            bestHit: state.bestHit,
            accuracy,
            accuracyPercent: Math.round(accuracy * 100),
            accuracyBonus,
            rewardPoints,
            saveState: "pending",
            saveMessage: "Saving session locally.",
            saveError: ""
        };
    }

    async function saveSessionRewards(summary) {
        if (!summary) return;

        state.playfun.currentSessionSummary = summary;
        persistSessionSummary(summary);
        updateUi();

        if (summary.rewardPoints <= 0) {
            summary.saveState = "idle";
            summary.saveMessage = "No reward this round. Session still recorded locally.";
            persistSessionSummary(summary);
            updateUi();
            return;
        }

        if (!state.playfun.config.enabled) {
            summary.saveState = "success";
            summary.saveMessage = `Saved ${summary.rewardPoints} session points locally. Add Play.fun credentials to publish rewards.`;
            persistSessionSummary(summary);
            updateUi();
            return;
        }

        if (!state.playfun.config.apiKey || !state.playfun.config.gameId) {
            summary.saveState = "error";
            summary.saveMessage = "Play.fun config is incomplete. Session kept locally.";
            persistSessionSummary(summary);
            updateUi();
            return;
        }

        if (state.playfun.status === "sdk-missing" || state.playfun.status === "error") {
            summary.saveState = "error";
            summary.saveMessage = "Play.fun SDK is unavailable. Session kept locally.";
            persistSessionSummary(summary);
            updateUi();
            return;
        }

        if (!state.playfun.ready || !state.playfun.sdk) {
            summary.saveState = "pending";
            summary.saveMessage = "Waiting for Play.fun to connect.";
            state.playfun.pendingSessionSummary = summary;
            persistSessionSummary(summary);
            updateUi();
            return;
        }

        await submitSessionToPlayfun(summary);
    }

    async function flushPendingPlayfunSave() {
        if (!state.playfun.pendingSessionSummary || !state.playfun.ready || !state.playfun.sdk) {
            return;
        }

        const pending = state.playfun.pendingSessionSummary;
        state.playfun.pendingSessionSummary = null;
        await submitSessionToPlayfun(pending);
    }

    async function submitSessionToPlayfun(summary) {
        if (!summary || !state.playfun.sdk || state.playfun.savingSessionId === summary.sessionId) {
            return;
        }

        state.playfun.savingSessionId = summary.sessionId;
        summary.saveState = "pending";
        summary.saveMessage = `Saving ${summary.rewardPoints} points to Play.fun...`;
        persistSessionSummary(summary);
        updateUi();

        try {
            state.playfun.sdk.addPoints(summary.rewardPoints);
            await state.playfun.sdk.endGame();
            summary.saveState = "success";
            summary.saveMessage = `Saved ${summary.rewardPoints} points to Play.fun.`;
            summary.saveError = "";
        } catch (error) {
            console.warn("Failed to save session to Play.fun:", error);
            summary.saveState = "error";
            summary.saveMessage = "Play.fun save failed. Session kept locally.";
            summary.saveError = String(error?.message || error || "");
        } finally {
            state.playfun.savingSessionId = null;
            persistSessionSummary(summary);
            updateUi();
        }
    }

    function inflateTarget(target, index) {
        return {
            id: target.id || `target-${index + 1}`,
            label: String(target.label || index + 1),
            points: Number(target.points) || 1,
            u: clamp01(target.u ?? 0.5),
            v: clamp01(target.v ?? 0.5),
            width: clamp(Number(target.width) || inferLegacySize(target.radius, 0.08), 0.02, 0.5),
            height: clamp(Number(target.height) || inferLegacySize(target.radius, 0.08), 0.02, 0.9),
            cooldownRemaining: 0
        };
    }

    function inferLegacySize(radius, fallback) {
        if (typeof radius === "number") {
            return radius * 2;
        }
        return fallback;
    }

    async function loadDildoAsset() {
        if (typeof window.loadDildoTemplate !== "function" || !BABYLON.SceneLoader) {
            state.assets.status = "fallback";
            maybeEnterIntro();
            updateUi();
            return;
        }

        state.assets.status = "loading";
        updateUi();

        try {
            const result = await window.loadDildoTemplate(scene, {
                rootUrl: "./",
                file: DILDO_FILE
            });
            state.assets.template = result?.template || null;
            state.assets.status = state.assets.template ? "ready" : "fallback";
        } catch (error) {
            console.warn("Failed to load dildo asset:", error);
            state.assets.template = null;
            state.assets.status = "fallback";
        }

        maybeEnterIntro();
        updateUi();
    }

    async function initHandTracking(forceRetry = false) {
        if (DEVICE_PROFILE.mobileLike) {
            state.hand.trackingState = "disabled";
            maybeEnterIntro();
            updateUi();
            return;
        }
        if (!forceRetry && (state.hand.trackingState === "starting" || state.hand.trackingState === "ready")) {
            return;
        }
        if (!window.Hands || !navigator.mediaDevices?.getUserMedia) {
            state.hand.trackingState = "error";
            state.hand.error = "Camera tracking failed to load.";
            state.mode = MODES.CAMERA_ERROR;
            updateUi();
            return;
        }

        state.hand.trackingState = "starting";
        state.hand.error = "";
        if (state.mode === MODES.CAMERA_ERROR) {
            state.mode = MODES.BOOT;
        }
        updateUi();

        try {
            handCtx = ui.handCanvas.getContext("2d");
            stopHandStream();

            const hands = new Hands({
                locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
            });

            hands.setOptions({
                maxNumHands: 1,
                modelComplexity: DEVICE_PROFILE.handModelComplexity,
                minDetectionConfidence: 0.65,
                minTrackingConfidence: 0.45
            });

            hands.onResults(onHandResults);

            const stream = await promiseWithTimeout(
                navigator.mediaDevices.getUserMedia({
                    video: {
                        facingMode: "user",
                        width: { ideal: DEVICE_PROFILE.cameraWidth },
                        height: { ideal: DEVICE_PROFILE.cameraHeight }
                    },
                    audio: false
                }),
                8000,
                "Camera access timed out."
            );
            state.hand.stream = stream;
            ui.webcamVideo.srcObject = stream;
            await promiseWithTimeout(
                ui.webcamVideo.play(),
                5000,
                "Camera video did not start."
            );
            ui.handCanvas.width = ui.webcamVideo.videoWidth || 320;
            ui.handCanvas.height = ui.webcamVideo.videoHeight || 240;

            state.hand.trackingState = "ready";
            state.hand.error = "";
            const pumpToken = state.hand.pumpToken + 1;
            state.hand.pumpToken = pumpToken;
            startHandPump(hands, pumpToken);
            maybeEnterIntro();
            updateUi();
        } catch (error) {
            console.warn("Camera access failed:", error);
            stopHandStream();
            state.hand.trackingState = "error";
            state.hand.visible = false;
            state.hand.error = error?.message || "Camera access was denied.";
            state.mode = MODES.CAMERA_ERROR;
            updateUi();
        }
    }

    function startHandPump(hands, pumpToken) {
        let sendInFlight = false;
        let lastSentAt = 0;

        const pump = async (timestamp) => {
            if (state.hand.pumpToken !== pumpToken || state.hand.trackingState !== "ready") {
                return;
            }

            try {
                if (
                    !sendInFlight &&
                    ui.webcamVideo.readyState >= 2 &&
                    timestamp - lastSentAt >= DEVICE_PROFILE.handTrackingFrameIntervalMs
                ) {
                    sendInFlight = true;
                    lastSentAt = timestamp;
                    await hands.send({ image: ui.webcamVideo });
                }
            } catch (error) {
                console.warn("Hand frame send failed:", error);
            } finally {
                sendInFlight = false;
            }

            requestAnimationFrame(pump);
        };

        requestAnimationFrame(pump);
    }

    function stopHandStream() {
        state.hand.pumpToken += 1;
        if (state.hand.stream) {
            state.hand.stream.getTracks().forEach((track) => track.stop());
            state.hand.stream = null;
        }
        if (ui.webcamVideo) {
            ui.webcamVideo.srcObject = null;
        }
        state.hand.aimTargetId = null;
    }

    function maybeEnterIntro() {
        if (state.mode === MODES.RESULTS || state.mode === MODES.COUNTDOWN || state.mode === MODES.PLAYING) {
            return;
        }
        if (DEVICE_PROFILE.mobileLike) {
            if (state.assets.status === "loading") {
                return;
            }
            if (state.mode === MODES.BOOT || state.mode === MODES.CAMERA_ERROR) {
                clearProjectiles();
                resetTargets();
                state.mode = MODES.INTRO_TAP;
            }
            return;
        }
        if (state.hand.trackingState !== "ready") {
            return;
        }
        if (state.assets.status === "loading") {
            return;
        }
        if (state.mode === MODES.BOOT || state.mode === MODES.CAMERA_ERROR) {
            clearProjectiles();
            resetTargets();
            state.mode = MODES.INTRO_THROW;
        }
    }

    function beginCountdown() {
        clearProjectiles();
        resetTargets();
        resetRoundStats();
        state.mode = MODES.COUNTDOWN;
        state.countdownRemaining = 3;
        updateUi();
    }

    function startRound() {
        clearProjectiles();
        resetTargets();
        resetRoundStats();
        state.playfun.currentSessionId += 1;
        state.playfun.currentSessionSummary = null;
        state.mode = MODES.PLAYING;
        state.timeRemaining = state.config.roundDuration;
        void ensureBackgroundMusicPlaying();
        updateUi();
    }

    function finishRound() {
        const sessionSummary = buildSessionSummary();
        clearProjectiles();
        resetTargets();
        state.playfun.currentSessionSummary = sessionSummary;
        state.mode = MODES.RESULTS;
        updateUi();
        void saveSessionRewards(sessionSummary);
    }

    function resetRoundStats() {
        state.score = 0;
        state.throws = 0;
        state.hits = 0;
        state.misses = 0;
        state.bestHit = 0;
        state.timeRemaining = state.config.roundDuration;
        state.nextThrowAt = 0;
    }

    function resetTargets() {
        state.targets.forEach((target) => {
            target.cooldownRemaining = 0;
        });
    }

    function clearProjectiles() {
        state.projectiles.forEach(disposeProjectile);
        state.projectiles = [];
    }

    function createScene(backgroundImage) {
        const createdScene = new BABYLON.Scene(engine);
        createdScene.clearColor = BABYLON.Color4.FromColor3(BABYLON.Color3.FromHexString("#070b08"), 1);
        createdScene.skipPointerMovePicking = true;

        camera = new BABYLON.FreeCamera("camera", new BABYLON.Vector3(0, 0, state.config.cameraZ), createdScene);
        camera.fov = state.config.cameraFov;
        camera.setTarget(BABYLON.Vector3.Zero());
        camera.minZ = 0.1;
        camera.maxZ = 100;
        camera.inputs.clear();

        const fillLight = new BABYLON.HemisphericLight("fill", new BABYLON.Vector3(0, 1, 0), createdScene);
        fillLight.intensity = 0.92;
        fillLight.groundColor = BABYLON.Color3.FromHexString("#18211b");

        const rimLight = new BABYLON.PointLight("rim", new BABYLON.Vector3(0, 0, 10), createdScene);
        rimLight.intensity = 0.4;
        rimLight.diffuse = BABYLON.Color3.FromHexString("#f5dfbf");

        backdropMesh = BABYLON.MeshBuilder.CreatePlane(
            "backdrop",
            { width: state.stageWidth, height: state.stageHeight },
            createdScene
        );
        backdropMesh.isPickable = true;

        const backdropMaterial = new BABYLON.StandardMaterial("backdrop-mat", createdScene);
        const backdropTexture = new BABYLON.Texture(backgroundImage.src, createdScene, true, false);
        backdropTexture.uScale = -1;
        backdropTexture.vScale = -1;
        backdropTexture.uOffset = 1;
        backdropTexture.vOffset = 1;
        backdropMaterial.diffuseTexture = backdropTexture;
        backdropMaterial.emissiveTexture = backdropTexture;
        backdropMaterial.specularColor = BABYLON.Color3.Black();
        backdropMaterial.emissiveColor = BABYLON.Color3.White();
        backdropMaterial.disableLighting = true;
        backdropMaterial.backFaceCulling = false;
        backdropMesh.material = backdropMaterial;
        backdropMesh.freezeWorldMatrix();
        backdropMaterial.freeze();

        createdScene.onPointerObservable.add((pointerInfo) => {
            if (pointerInfo.type !== BABYLON.PointerEventTypes.POINTERDOWN) return;
            handlePointerDown(pointerInfo.event);
        });

        return createdScene;
    }

    function handlePointerDown(event) {
        if (!state.sceneReady) return;
        if (event.target && event.target.closest && event.target.closest("button")) return;
        if (shouldShowRotatePrompt()) return;
        if (DEVICE_PROFILE.mobileLike && state.mode === MODES.INTRO_TAP) {
            beginCountdown();
            return;
        }
        if (!canThrowNow()) return;
        if (state.audio.soundtrackRequested && !state.audio.soundtrackPlaying) {
            void ensureBackgroundMusicPlaying();
        }

        const pickInfo = scene.pick(scene.pointerX, scene.pointerY, (mesh) => mesh === backdropMesh);
        launchProjectileFromPick(pickInfo, "pointer", { x: 0, y: 0, z: 0 });
    }

    function canThrowNow() {
        if (!state.sceneReady) return false;
        if (![MODES.INTRO_THROW, MODES.INTRO_HIT, MODES.PLAYING].includes(state.mode)) return false;
        return performance.now() >= state.nextThrowAt;
    }

    function launchProjectileFromHand() {
        if (!state.hand.visible) return;
        if (state.audio.soundtrackRequested && !state.audio.soundtrackPlaying) {
            void ensureBackgroundMusicPlaying();
        }
        const pickInfo = pickBackdropAtScreenUv(state.hand.screenU, state.hand.screenV);
        launchProjectileFromPick(pickInfo, "hand", state.hand.currentVelocity);
    }

    function pickBackdropAtScreenUv(screenU, screenV) {
        if (!scene || !engine || !backdropMesh) return null;
        const canvasRect = ui.canvas?.getBoundingClientRect?.();
        const hardwareScale = typeof engine.getHardwareScalingLevel === "function"
            ? engine.getHardwareScalingLevel()
            : 1;
        const x = screenU * (canvasRect?.width || ui.canvas?.clientWidth || engine.getRenderWidth()) * hardwareScale;
        const y = screenV * (canvasRect?.height || ui.canvas?.clientHeight || engine.getRenderHeight()) * hardwareScale;
        return scene.pick(x, y, (mesh) => mesh === backdropMesh, false, camera);
    }

    function launchProjectileFromPick(pickInfo, source, handVelocity) {
        if (!pickInfo || !pickInfo.hit || !pickInfo.pickedPoint) return;
        if (!canThrowNow()) return;

        const imageUv = worldToImageUv(pickInfo.pickedPoint);
        const hitTarget = findTargetAtUv(imageUv.u, imageUv.v);
        const destination = hitTarget
            ? imageUvToWorld(hitTarget.u, hitTarget.v, 0.05)
            : pickInfo.pickedPoint.clone();

        const projectile = createProjectile(destination, hitTarget, handVelocity, source);
        if (!projectile) return;

        state.nextThrowAt = performance.now() + state.config.throwCooldownMs;
        state.projectiles.push(projectile);

        if (state.mode === MODES.PLAYING) {
            state.throws += 1;
        } else if (state.mode === MODES.INTRO_THROW) {
            state.mode = MODES.INTRO_HIT;
        }

        updateUi();
    }

    function createProjectile(destination, target, handVelocity, source) {
        if (typeof window.playThrowSound === "function") {
            window.playThrowSound();
        }

        const start = new BABYLON.Vector3(
            state.config.throwOrigin.x,
            state.config.throwOrigin.y,
            state.config.throwOrigin.z
        );

        const visual = createProjectileVisual(start);
        if (!visual) return null;

        const velocityMagnitude = vectorMagnitude(handVelocity);
        return {
            ...visual,
            start,
            end: destination,
            startDistanceFromCamera: camera ? BABYLON.Vector3.Distance(start, camera.position) : 0,
            endDistanceFromCamera: camera ? BABYLON.Vector3.Distance(destination, camera.position) : 0,
            elapsed: 0,
            duration: state.config.throwDuration,
            arc: state.config.throwArc,
            target,
            awarded: false,
            countsForRound: state.mode === MODES.PLAYING,
            phaseAtLaunch: state.mode,
            spinPhase: Math.random() * Math.PI * 2,
            spinSpeed: 4 + velocityMagnitude * 180,
            source
        };
    }

    function createProjectileVisual(start) {
        if (state.assets.template && window.DildoMechanics?.cloneTemplateMeshes) {
            const clone = window.DildoMechanics.cloneTemplateMeshes(state.assets.template, scene, {
                name: `dildo_throw_${Date.now()}`
            });
            if (clone?.root) {
                clone.root.position.copyFrom(start);
                const height = hierarchyHeight(clone.root);
                const scale = height > 0.001
                    ? state.config.dildoWorldHeight / height
                    : 1;
                clone.root.scaling.setAll(scale);
                return {
                    type: "dildo",
                    root: clone.root,
                    clones: clone.clones || [],
                    file: DILDO_FILE,
                    baseScale: scale
                };
            }
        }

        const mesh = BABYLON.MeshBuilder.CreateCapsule(
            `projectile-${Date.now()}-${Math.random()}`,
            { height: 1.12, radius: 0.18, tessellation: 12, subdivisions: 3 },
            scene
        );

        const material = new BABYLON.StandardMaterial(`projectile-mat-${Date.now()}`, scene);
        material.diffuseColor = BABYLON.Color3.FromHexString("#e5a1b2");
        material.emissiveColor = BABYLON.Color3.FromHexString("#44222d");
        material.specularColor = BABYLON.Color3.FromHexString("#f6dde4");
        mesh.material = material;
        mesh.position.copyFrom(start);
        mesh.rotation.x = Math.PI * 0.5;

        return {
            type: "capsule",
            mesh,
            file: "capsule-fallback",
            baseScale: 1
        };
    }

    function hierarchyHeight(root) {
        if (!root || typeof root.getHierarchyBoundingVectors !== "function") return 0;
        const bounds = root.getHierarchyBoundingVectors(true);
        return Math.abs(bounds.max.y - bounds.min.y);
    }

    function findTargetAtUv(u, v) {
        const ranked = state.targets
            .filter((target) => target.cooldownRemaining <= 0)
            .map((target) => ({
                target,
                ...targetHitMetric(u, v, target)
            }))
            .filter((entry) => entry.inside)
            .sort((a, b) => a.distance - b.distance);

        return ranked[0] ? ranked[0].target : null;
    }

    function updateHandAimTarget() {
        if (!state.hand.visible) {
            state.hand.aimTargetId = null;
            return null;
        }

        const pickInfo = pickBackdropAtScreenUv(state.hand.screenU, state.hand.screenV);
        if (!pickInfo?.hit || !pickInfo.pickedPoint) {
            state.hand.aimTargetId = null;
            return null;
        }

        const imageUv = worldToImageUv(pickInfo.pickedPoint);
        const target = findTargetAtUv(imageUv.u, imageUv.v);
        state.hand.aimTargetId = target?.id || null;
        return target || null;
    }

    function targetHitMetric(u, v, target) {
        const halfWidth = Math.max(target.width * 0.5, 0.0001);
        const halfHeight = Math.max(target.height * 0.5, 0.0001);
        const normalizedX = (u - target.u) / halfWidth;
        const normalizedY = (v - target.v) / halfHeight;
        return {
            inside: Math.abs(normalizedX) <= 1 && Math.abs(normalizedY) <= 1,
            distance: normalizedX * normalizedX + normalizedY * normalizedY
        };
    }

    function restartClassAnimation(element, className, durationMs) {
        if (!element) return;
        element.classList.remove(className);
        void element.offsetWidth;
        element.classList.add(className);
        window.setTimeout(() => {
            element.classList.remove(className);
        }, durationMs);
    }

    function triggerImpactFlashes() {
        if (typeof window.screenFlash !== "function") return;

        window.screenFlash("#ff2b2b", 0.7, 120);
        window.setTimeout(() => {
            window.screenFlash("#fff3dc", 0.42, 90);
        }, 26);
        window.setTimeout(() => {
            window.screenFlash("#ff5a2f", 0.34, 130);
        }, 78);
        window.setTimeout(() => {
            window.screenFlash("#7e0000", 0.22, 160);
        }, 118);
    }

    function triggerImpactPunch(target) {
        restartClassAnimation(ui.appShell, "impact-pulse", 240);
        restartClassAnimation(ui.appShell, "impact-flash", 260);

        if (!ui.hitEffectsLayer || !engine) return;

        const projected = projectTargetToScreen(target);
        if (!projected.screenVisible || projected.screenX === null || projected.screenY === null) {
            return;
        }

        const shockwave = document.createElement("div");
        shockwave.className = "hit-shockwave";
        shockwave.style.left = `${projected.screenX}px`;
        shockwave.style.top = `${projected.screenY}px`;

        const shockwaveSize = clamp(
            engine.getRenderHeight() * Math.max(target.width, target.height) * 1.95,
            360,
            760
        );
        shockwave.style.width = `${shockwaveSize}px`;
        shockwave.style.height = `${shockwaveSize}px`;
        ui.hitEffectsLayer.appendChild(shockwave);

        const coreFlash = document.createElement("div");
        coreFlash.className = "hit-impact-core";
        coreFlash.style.left = `${projected.screenX}px`;
        coreFlash.style.top = `${projected.screenY}px`;
        const coreSize = clamp(
            engine.getRenderHeight() * Math.max(target.width, target.height) * 1.05,
            200,
            420
        );
        coreFlash.style.width = `${coreSize}px`;
        coreFlash.style.height = `${coreSize}px`;
        ui.hitEffectsLayer.appendChild(coreFlash);

        window.setTimeout(() => {
            shockwave.remove();
        }, 420);
        window.setTimeout(() => {
            coreFlash.remove();
        }, 220);
    }

    function registerHit(projectile) {
        const target = projectile.target;
        if (!target || target.cooldownRemaining > 0) return false;

        target.cooldownRemaining = state.config.targetCooldown;

        const impactPosition = imageUvToWorld(target.u, target.v, 0.14);
        if (typeof window.playCorrectSound === "function") {
            window.playCorrectSound();
        }
        if (typeof window.playWoodHitSound === "function") {
            window.playWoodHitSound();
            window.setTimeout(() => {
                window.playWoodHitSound();
            }, 34);
        }
        triggerImpactFlashes();
        if (typeof window.cameraShake === "function") {
            window.cameraShake(camera, 1.02, 320);
            window.setTimeout(() => {
                window.cameraShake(camera, 0.68, 260);
            }, 72);
        }
        if (typeof window.createImpactBurst === "function") {
            window.createImpactBurst(
                scene,
                impactPosition,
                2.55,
                BABYLON.Color3.FromHexString("#ff4d42")
            );
            window.createImpactBurst(
                scene,
                impactPosition.add(new BABYLON.Vector3(0, 0, 0.08)),
                1.9,
                BABYLON.Color3.FromHexString("#fff0d1")
            );
        }
        if (typeof window.createExplosionSprite === "function") {
            window.createExplosionSprite(
                scene,
                impactPosition,
                {
                    size: 8.8,
                    growth: 2.9,
                    duration: 480,
                    zOffset: 0.86
                }
            );
        }
        triggerImpactPunch(target);
        spawnHitOverlay(target);
        state.hitStopRemaining = Math.max(state.hitStopRemaining, HIT_STOP_DURATION);

        if (projectile.countsForRound) {
            state.score += target.points;
            state.hits += 1;
            state.bestHit = Math.max(state.bestHit, target.points);
            updateUi();
            return true;
        }

        if (projectile.phaseAtLaunch === MODES.INTRO_HIT) {
            beginCountdown();
            return true;
        }

        return true;
    }

    function updateSimulation(dt) {
        if (state.hitStopRemaining > 0) {
            state.hitStopRemaining = Math.max(0, state.hitStopRemaining - dt);
            updateUi();
            return;
        }

        state.targets.forEach((target) => {
            target.cooldownRemaining = Math.max(0, target.cooldownRemaining - dt);
        });

        for (let index = state.projectiles.length - 1; index >= 0; index -= 1) {
            const projectile = state.projectiles[index];
            projectile.elapsed += dt;
            projectile.spinPhase += projectile.spinSpeed * dt;

            const t = clamp01(projectile.elapsed / projectile.duration);
            const position = BABYLON.Vector3.Lerp(projectile.start, projectile.end, t);
            position.y += Math.sin(Math.PI * t) * projectile.arc;

            const tangent = projectile.end.subtract(projectile.start);
            tangent.y += Math.cos(Math.PI * t) * projectile.arc * Math.PI;
            updateProjectileVisual(projectile, position, tangent);

            if (!projectile.awarded && projectile.target && t >= 0.92) {
                projectile.awarded = registerHit(projectile);
            }

            if (t >= 1) {
                if (projectile.countsForRound && !projectile.awarded) {
                    state.misses += 1;
                    if (typeof window.playWrongSound === "function") {
                        window.playWrongSound();
                    }
                }
                disposeProjectile(projectile);
                state.projectiles.splice(index, 1);
            }
        }

        if (state.mode === MODES.COUNTDOWN) {
            state.countdownRemaining = Math.max(0, state.countdownRemaining - dt);
            if (state.countdownRemaining <= 0) {
                startRound();
            }
        } else if (state.mode === MODES.PLAYING) {
            state.timeRemaining = Math.max(0, state.timeRemaining - dt);
            if (state.timeRemaining <= 0) {
                finishRound();
            }
        }

        updateUi();
    }

    function updateProjectileVisual(projectile, position, direction) {
        applyProjectileDepthScale(projectile, position);

        if (projectile.type === "dildo" && projectile.root) {
            projectile.root.position.copyFrom(position);
            orientNodeToDirection(projectile.root, direction, projectile.spinPhase);
            return;
        }

        if (projectile.mesh) {
            projectile.mesh.position.copyFrom(position);
            projectile.mesh.lookAt(projectile.mesh.position.add(direction.normalize()));
            projectile.mesh.rotation.z += 0.18;
        }
    }

    function applyProjectileDepthScale(projectile, position) {
        const scaleNode = projectile.root || projectile.mesh;
        if (!scaleNode || !camera) return;

        const startDistance = projectile.startDistanceFromCamera || 0;
        const endDistance = projectile.endDistanceFromCamera || startDistance;
        const distanceRange = Math.max(0.0001, endDistance - startDistance);
        const currentDistance = BABYLON.Vector3.Distance(position, camera.position);
        const depthT = clamp01((currentDistance - startDistance) / distanceRange);
        const depthScale = BABYLON.Scalar.Lerp(
            state.config.dildoScaleNear,
            state.config.dildoScaleFar,
            depthT
        );

        scaleNode.scaling.setAll((projectile.baseScale || 1) * depthScale);
    }

    function orientNodeToDirection(node, direction, spinAngle) {
        const dir = direction.clone();
        if (dir.lengthSquared() < 1e-8) return;
        dir.normalize();

        const up = new BABYLON.Vector3(0, 1, 0);
        const dot = clamp(BABYLON.Vector3.Dot(up, dir), -1, 1);
        const axis = BABYLON.Vector3.Cross(up, dir);
        let orientation;

        if (axis.lengthSquared() < 1e-8) {
            orientation = dot >= 0
                ? BABYLON.Quaternion.Identity()
                : BABYLON.Quaternion.RotationAxis(BABYLON.Axis.X, Math.PI);
        } else {
            orientation = BABYLON.Quaternion.RotationAxis(axis.normalize(), Math.acos(dot));
        }

        const spin = BABYLON.Quaternion.RotationAxis(dir, spinAngle);
        node.rotationQuaternion = orientation.multiply(spin);
    }

    function onHandResults(results) {
        if (!handCtx) return;

        if (ui.handCanvas.width !== (ui.webcamVideo.videoWidth || 320)) {
            ui.handCanvas.width = ui.webcamVideo.videoWidth || 320;
            ui.handCanvas.height = ui.webcamVideo.videoHeight || 240;
        }

        handCtx.clearRect(0, 0, ui.handCanvas.width, ui.handCanvas.height);

        if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
            const landmarks = results.multiHandLandmarks[0];

            if (typeof window.drawConnectors === "function" && window.HAND_CONNECTIONS) {
                window.drawConnectors(handCtx, landmarks, window.HAND_CONNECTIONS, {
                    color: "#00FF95",
                    lineWidth: 2
                });
            }
            if (typeof window.drawLandmarks === "function") {
                window.drawLandmarks(handCtx, landmarks, {
                    color: "#FF8C61",
                    lineWidth: 1,
                    radius: 3
                });
            }

            const indexTip = landmarks[8];
            const wrist = landmarks[0];
            const previousX = state.hand.previousWristX ?? wrist.x;
            const previousY = state.hand.previousWristY ?? wrist.y;
            const previousZ = state.hand.previousHandZ ?? wrist.z;
            const velocityX = wrist.x - previousX;
            const velocityY = wrist.y - previousY;
            const velocityZ = previousZ - wrist.z;
            const totalVelocity = Math.sqrt(
                velocityX * velocityX +
                velocityY * velocityY +
                velocityZ * velocityZ
            );

            state.hand.screenU = clamp01(1 - indexTip.x);
            state.hand.screenV = clamp01(indexTip.y);
            state.hand.currentVelocity = { x: velocityX, y: velocityY, z: velocityZ };
            state.hand.visible = true;

            state.hand.velocityHistory.push(totalVelocity);
            if (state.hand.velocityHistory.length > VELOCITY_HISTORY_SIZE) {
                state.hand.velocityHistory.shift();
            }

            state.hand.previousWristX = wrist.x;
            state.hand.previousWristY = wrist.y;
            state.hand.previousHandZ = wrist.z;
            updateHandAimTarget();

            const maxRecentVelocity = Math.max(...state.hand.velocityHistory);
            if (canThrowNow() && maxRecentVelocity > state.config.handThrowThreshold) {
                launchProjectileFromHand();
                state.hand.velocityHistory = [];
            }
        } else {
            state.hand.visible = false;
            state.hand.velocityHistory = [];
            state.hand.aimTargetId = null;
        }
    }

    function updateUi() {
        ui.hud.classList.toggle("hidden", state.mode !== MODES.PLAYING);
        ui.hudScore.textContent = `${state.score} pts`;
        ui.hudTimer.textContent = `${Math.ceil(state.timeRemaining)}s`;

        const instructionState = currentInstructionState();
        ui.instructionOverlay.classList.toggle("hidden", instructionState.hidden);
        if (!instructionState.hidden) {
            ui.instructionEyebrow.textContent = instructionState.eyebrow;
            ui.instructionTitle.textContent = instructionState.title;
            ui.instructionCopy.textContent = instructionState.copy;
        }

        const showCameraPreview = !DEVICE_PROFILE.mobileLike
            && state.hand.trackingState === "ready"
            && state.mode !== MODES.RESULTS
            && state.mode !== MODES.CAMERA_ERROR;
        ui.cameraPreviewShell.classList.toggle("hidden", !showCameraPreview);

        const countdownVisible = state.mode === MODES.COUNTDOWN;
        ui.countdownOverlay.classList.toggle("hidden", !countdownVisible);
        if (countdownVisible) {
            ui.countdownValue.textContent = `${Math.max(1, Math.ceil(state.countdownRemaining))}`;
        }

        const aimTarget = currentAimTarget();
        const reticleVisible = showCameraPreview && state.hand.visible;
        ui.aimReticle.classList.toggle("hidden", !reticleVisible);
        ui.aimReticle.classList.toggle("armed", reticleVisible && canThrowNow());
        ui.aimReticle.classList.toggle("locked", Boolean(aimTarget));
        if (reticleVisible) {
            ui.aimReticle.style.left = `${(state.hand.screenU * 100).toFixed(2)}%`;
            ui.aimReticle.style.top = `${(state.hand.screenV * 100).toFixed(2)}%`;
        }

        const modalState = currentModalState();
        ui.modalShell.classList.toggle("hidden", modalState.hidden);
        if (!modalState.hidden) {
            ui.modalEyebrow.textContent = modalState.eyebrow;
            ui.modalTitle.textContent = modalState.title;
            ui.modalCopy.textContent = modalState.copy;
        }

        const showResults = state.mode === MODES.RESULTS;
        const showRotatePrompt = shouldShowRotatePrompt();
        const showMobileIntroAction = DEVICE_PROFILE.mobileLike && state.mode === MODES.INTRO_TAP && !showRotatePrompt;
        ui.resultsGrid.classList.toggle("hidden", !showResults);
        ui.retryCameraBtn.classList.toggle("hidden", state.mode !== MODES.CAMERA_ERROR);
        ui.playAgainBtn.classList.toggle("hidden", !showResults && !showMobileIntroAction);
        if (showMobileIntroAction) {
            ui.playAgainBtn.textContent = "Tap To Throw";
        } else {
            ui.playAgainBtn.textContent = "Play Again";
        }

        if (showResults) {
            const sessionSummary = state.playfun.currentSessionSummary;
            const accuracy = state.throws > 0
                ? Math.round((state.hits / state.throws) * 100)
                : 0;
            ui.resultScore.textContent = `${state.score}`;
            ui.resultThrows.textContent = `${state.throws}`;
            ui.resultHits.textContent = `${state.hits}`;
            ui.resultMisses.textContent = `${state.misses}`;
            ui.resultAccuracy.textContent = `${accuracy}%`;
            ui.resultBestHit.textContent = `${state.bestHit || 0} pts`;
            ui.resultBonus.textContent = `+${sessionSummary?.accuracyBonus || 0}`;
            ui.resultSessionReward.textContent = `${sessionSummary?.rewardPoints || 0} pts`;
            ui.resultSaveStatus.textContent = sessionSummary?.saveMessage || "";
            ui.resultSaveStatus.className = `result-save-status${sessionSummary?.saveState ? ` ${mapSaveStateToClass(sessionSummary.saveState)}` : ""}`;
            ui.resultSaveStatus.classList.toggle("hidden", !sessionSummary?.saveMessage);
        } else {
            ui.resultSaveStatus.className = "result-save-status hidden";
            ui.resultSaveStatus.textContent = "";
        }
    }

    function mapSaveStateToClass(saveState) {
        if (saveState === "success" || saveState === "saved") return "success";
        if (saveState === "pending") return "pending";
        if (saveState === "error") return "error";
        return "";
    }

    function currentInstructionState() {
        if (DEVICE_PROFILE.mobileLike) {
            return { hidden: true };
        }
        if (state.mode === MODES.RESULTS || state.mode === MODES.CAMERA_ERROR || state.mode === MODES.COUNTDOWN || state.mode === MODES.PLAYING) {
            return { hidden: true };
        }

        if (state.mode === MODES.INTRO_THROW) {
            return {
                hidden: false,
                eyebrow: "Step 1",
                title: GAME_TITLE,
                copy: "Raise your hand and throw a dildo."
            };
        }

        if (state.mode === MODES.INTRO_HIT) {
            return {
                hidden: false,
                eyebrow: "Step 2",
                title: GAME_TITLE,
                copy: "Now try to hit the true believers."
            };
        }

        if (state.hand.trackingState === "starting") {
            return {
                hidden: false,
                eyebrow: "Camera",
                title: GAME_TITLE,
                copy: "Allow camera access to begin."
            };
        }

        if (state.hand.trackingState === "ready" && state.assets.status === "loading") {
            return {
                hidden: false,
                eyebrow: "Loading",
                title: GAME_TITLE,
                copy: "Getting the dildo ready."
            };
        }

        if (state.assets.status === "fallback" && state.hand.trackingState === "ready") {
            return {
                hidden: false,
                eyebrow: "Step 1",
                title: GAME_TITLE,
                copy: "Raise your hand and throw a dildo."
            };
        }

        return {
            hidden: false,
            eyebrow: "Camera",
            title: GAME_TITLE,
            copy: "Allow camera access so we can track your throw."
        };
    }

    function currentModalState() {
        if (shouldShowRotatePrompt()) {
            return {
                hidden: false,
                eyebrow: "Rotate",
                title: GAME_TITLE,
                copy: "Turn your phone sideways to play."
            };
        }

        if (DEVICE_PROFILE.mobileLike && state.mode === MODES.INTRO_TAP) {
            return {
                hidden: false,
                eyebrow: "Mobile",
                title: GAME_TITLE,
                copy: "Tap to throw. Then you have 60 seconds to hit the true believers."
            };
        }

        if (state.mode !== MODES.RESULTS && state.mode !== MODES.CAMERA_ERROR) {
            return { hidden: true };
        }

        if (state.mode === MODES.RESULTS) {
            return {
                hidden: false,
                eyebrow: "Time's Up",
                title: GAME_TITLE,
                copy: "Here is the damage."
            };
        }

        if (state.mode === MODES.CAMERA_ERROR) {
            return {
                hidden: false,
                eyebrow: "Camera Required",
                title: GAME_TITLE,
                copy: state.hand.error || "Allow camera access so we can track your throw."
            };
        }

        return { hidden: true };
    }

    function currentAimTarget() {
        if (!state.hand.visible || !state.hand.aimTargetId) {
            return null;
        }
        return state.targets.find((target) => target.id === state.hand.aimTargetId) || null;
    }

    function spawnHitOverlay(target) {
        if (!ui.hitEffectsLayer || !engine) return;

        const projected = projectTargetToScreen(target);
        if (!projected.screenVisible || projected.screenX === null || projected.screenY === null) {
            return;
        }

        const explosion = document.createElement("img");
        explosion.className = "hit-explosion";
        explosion.src = HIT_EXPLOSION_FRAMES[0];
        explosion.alt = "";
        explosion.style.left = `${projected.screenX}px`;
        explosion.style.top = `${projected.screenY}px`;

        const baseSize = clamp(
            engine.getRenderHeight() * Math.max(target.width, target.height) * 1.3,
            360,
            620
        );
        explosion.style.width = `${baseSize}px`;
        explosion.style.height = `${baseSize}px`;
        ui.hitEffectsLayer.appendChild(explosion);
        void explosion.offsetWidth;
        explosion.classList.add("active");

        HIT_EXPLOSION_FRAMES.forEach((frame, index) => {
            window.setTimeout(() => {
                explosion.src = frame;
            }, index * 52);
        });

        window.setTimeout(() => {
            explosion.classList.add("fade");
        }, 150);

        window.setTimeout(() => {
            explosion.remove();
        }, 320);
    }

    function setupRealtimeLoop() {
        handleResize();
        engine.runRenderLoop(() => {
            if (!state.useVirtualTime) {
                const now = performance.now();
                if (!state.realTimeLast) {
                    state.realTimeLast = now;
                }
                const dt = Math.min(MAX_REALTIME_FRAME_DELTA, Math.max(0, (now - state.realTimeLast) / 1000));
                state.realTimeLast = now;
                state.realTimeAccumulator = Math.min(
                    state.realTimeAccumulator + dt,
                    FIXED_STEP * MAX_SIMULATION_STEPS_PER_FRAME
                );

                let steps = 0;
                while (state.realTimeAccumulator >= FIXED_STEP && steps < MAX_SIMULATION_STEPS_PER_FRAME) {
                    updateSimulation(FIXED_STEP);
                    state.realTimeAccumulator -= FIXED_STEP;
                    steps += 1;
                }

                if (steps >= MAX_SIMULATION_STEPS_PER_FRAME && state.realTimeAccumulator >= FIXED_STEP) {
                    state.realTimeAccumulator = 0;
                }
            }

            scene.render();
        });
    }

    function handleResize() {
        if (engine) {
            engine.resize();
        }
        updateUi();
    }

    function disposeProjectile(projectile) {
        if (!projectile) return;

        if (projectile.type === "dildo") {
            if (Array.isArray(projectile.clones)) {
                projectile.clones.forEach((mesh) => mesh?.dispose?.());
            }
            projectile.root?.dispose?.();
            return;
        }

        if (projectile.mesh) {
            projectile.mesh.material?.dispose?.();
            projectile.mesh.dispose();
        }
    }

    function worldToImageUv(point) {
        return {
            u: clamp01(0.5 - point.x / state.stageWidth),
            v: clamp01(0.5 + point.y / state.stageHeight)
        };
    }

    function imageUvToWorld(u, v, z) {
        return new BABYLON.Vector3(
            (0.5 - u) * state.stageWidth,
            (v - 0.5) * state.stageHeight,
            z
        );
    }

    async function loadJson(path, fallback) {
        try {
            const response = await fetch(path);
            if (!response.ok) {
                throw new Error(`Fetch failed for ${path}: ${response.status}`);
            }
            return await response.json();
        } catch (error) {
            console.warn(`Using fallback for ${path}:`, error);
            return typeof structuredClone === "function"
                ? structuredClone(fallback)
                : JSON.parse(JSON.stringify(fallback));
        }
    }

    function loadImage(path) {
        return new Promise((resolve, reject) => {
            const image = new Image();
            image.onload = () => resolve(image);
            image.onerror = () => reject(new Error(`Failed to load image: ${path}`));
            image.src = path;
        });
    }

    function clamp01(value) {
        return clamp(value, 0, 1);
    }

    function clamp(value, min, max) {
        return Math.min(max, Math.max(min, value));
    }

    function shouldShowRotatePrompt() {
        if (!DEVICE_PROFILE.mobileLike) return false;
        if ([MODES.PLAYING, MODES.RESULTS, MODES.CAMERA_ERROR].includes(state.mode)) return false;
        return window.innerHeight > window.innerWidth;
    }

    function detectDeviceProfile() {
        const userAgent = navigator.userAgent || "";
        const coarsePointer = window.matchMedia?.("(pointer: coarse)")?.matches || false;
        const touchPoints = navigator.maxTouchPoints || 0;
        const mobileLike = coarsePointer || touchPoints > 1 || /Android|iPhone|iPad|iPod/i.test(userAgent);

        return {
            mobileLike,
            hardwareScalingLevel: mobileLike ? Math.max(1.4, Math.min(2.2, window.devicePixelRatio || 1.6)) : 1,
            cameraWidth: mobileLike ? 480 : 640,
            cameraHeight: mobileLike ? 360 : 480,
            handModelComplexity: mobileLike ? 0 : 1,
            handTrackingFrameIntervalMs: mobileLike ? 50 : 33
        };
    }

    function vectorMagnitude(vector) {
        return Math.sqrt(
            (vector?.x || 0) * (vector?.x || 0) +
            (vector?.y || 0) * (vector?.y || 0) +
            (vector?.z || 0) * (vector?.z || 0)
        );
    }

    function promiseWithTimeout(promise, timeoutMs, message) {
        let timeoutId = null;
        const timeoutPromise = new Promise((_, reject) => {
            timeoutId = setTimeout(() => {
                reject(new Error(message));
            }, timeoutMs);
        });

        return Promise.race([promise, timeoutPromise]).finally(() => {
            if (timeoutId !== null) {
                clearTimeout(timeoutId);
            }
        });
    }

    function projectTargetToScreen(target) {
        if (!camera || !scene || !engine) {
            return { screenX: null, screenY: null, screenVisible: false };
        }

        const hardwareScale = typeof engine.getHardwareScalingLevel === "function"
            ? engine.getHardwareScalingLevel()
            : 1;

        const projected = BABYLON.Vector3.Project(
            imageUvToWorld(target.u, target.v, 0.04),
            BABYLON.Matrix.Identity(),
            scene.getTransformMatrix(),
            camera.viewport.toGlobal(engine.getRenderWidth(), engine.getRenderHeight())
        );

        return {
            screenX: Number((projected.x / hardwareScale).toFixed(1)),
            screenY: Number((projected.y / hardwareScale).toFixed(1)),
            screenVisible: projected.z >= 0 && projected.z <= 1
        };
    }

    window.render_game_to_text = function renderGameToText() {
        const instructionState = currentInstructionState();
        const aimTarget = currentAimTarget();
        const payload = {
            mode: state.mode,
            inputMode: DEVICE_PROFILE.mobileLike ? "tap" : "camera",
            score: state.score,
            throws: state.throws,
            hits: state.hits,
            misses: state.misses,
            bestHit: state.bestHit,
            timeRemaining: Number(state.timeRemaining.toFixed(2)),
            countdownRemaining: Number(state.countdownRemaining.toFixed(2)),
            ui: {
                instructionVisible: !instructionState.hidden,
                instructionCopy: instructionState.hidden ? null : instructionState.copy,
                cameraPreviewVisible: state.hand.trackingState === "ready" && state.mode !== MODES.RESULTS && state.mode !== MODES.CAMERA_ERROR,
                reticleVisible: state.hand.visible && state.hand.trackingState === "ready" && state.mode !== MODES.RESULTS && state.mode !== MODES.CAMERA_ERROR,
                lockedTarget: aimTarget ? aimTarget.label : null
            },
            coordinates: "u,v are normalized over the visible image. u grows left-to-right, v grows top-to-bottom.",
            assets: {
                status: state.assets.status,
                file: state.assets.file
            },
            audio: {
                currentTrackIndex: state.audio.soundtrackTrackIndex,
                currentTrackFile: BACKGROUND_MUSIC_FILES[state.audio.soundtrackTrackIndex] || null,
                soundtrackRequested: state.audio.soundtrackRequested,
                soundtrackPlaying: state.audio.soundtrackPlaying,
                soundtrackUnlocked: state.audio.soundtrackUnlocked,
                soundtrackError: state.audio.soundtrackError || null
            },
            playfun: {
                status: state.playfun.status,
                ready: state.playfun.ready,
                configured: Boolean(state.playfun.config.enabled && state.playfun.config.apiKey && state.playfun.config.gameId),
                historyCount: state.playfun.history.length,
                currentSessionReward: state.playfun.currentSessionSummary?.rewardPoints ?? null,
                currentSessionBonus: state.playfun.currentSessionSummary?.accuracyBonus ?? null,
                currentSaveState: state.playfun.currentSessionSummary?.saveState ?? null
            },
            hand: {
                trackingState: state.hand.trackingState,
                visible: state.hand.visible,
                screenU: Number(state.hand.screenU.toFixed(4)),
                screenV: Number(state.hand.screenV.toFixed(4)),
                velocityMagnitude: Number(vectorMagnitude(state.hand.currentVelocity).toFixed(4))
            },
            targets: state.targets.map((target) => ({
                ...projectTargetToScreen(target),
                id: target.id,
                label: target.label,
                points: target.points,
                u: Number(target.u.toFixed(4)),
                v: Number(target.v.toFixed(4)),
                width: Number(target.width.toFixed(4)),
                height: Number(target.height.toFixed(4)),
                cooldown: Number(target.cooldownRemaining.toFixed(2))
            })),
            projectiles: state.projectiles.map((projectile) => ({
                type: projectile.type,
                file: projectile.file,
                x: Number((projectile.root?.position.x ?? projectile.mesh?.position.x ?? 0).toFixed(2)),
                y: Number((projectile.root?.position.y ?? projectile.mesh?.position.y ?? 0).toFixed(2)),
                z: Number((projectile.root?.position.z ?? projectile.mesh?.position.z ?? 0).toFixed(2)),
                target: projectile.target ? projectile.target.label : null,
                source: projectile.source,
                countsForRound: projectile.countsForRound,
                scale: Number((projectile.root?.scaling.x ?? projectile.mesh?.scaling.x ?? 1).toFixed(3))
            }))
        };
        return JSON.stringify(payload);
    };

    window.advanceTime = function advanceTime(ms) {
        state.useVirtualTime = true;
        const steps = Math.max(1, Math.round(ms / (FIXED_STEP * 1000)));
        for (let index = 0; index < steps; index += 1) {
            updateSimulation(FIXED_STEP);
        }
        if (scene) {
            scene.render();
        }
    };

    window.__forceStartRound = beginCountdown;
    window.__debugAdvanceSoundtrack = advanceBackgroundMusicTrack;
    window.__forceIntroForTest = function forceIntroForTest(options = {}) {
        state.hand.trackingState = "ready";
        state.hand.error = "";
        state.assets.status = "ready";
        state.mode = MODES.INTRO_THROW;
        if (typeof options.handVisible === "boolean") {
            state.hand.visible = options.handVisible;
        }
        if (typeof options.screenU === "number") {
            state.hand.screenU = clamp01(options.screenU);
        }
        if (typeof options.screenV === "number") {
            state.hand.screenV = clamp01(options.screenV);
        }
        updateUi();
    };
})();
