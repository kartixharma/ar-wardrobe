import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { FACEMESH_TRIANGULATION } from "./triangulation";

// MediaPipe Holistic + Camera utils
import { Holistic } from "@mediapipe/holistic";
import { Camera } from "@mediapipe/camera_utils";

const VIDEO_WIDTH = 720;
const VIDEO_HEIGHT = 620;

// Accessory type constants
const ACCESSORY_TYPES = {
  GLASSES: "glasses",
  EARRINGS: "earrings",
  NECKLACE: "necklace",
  T_SHIRT: "t-shirt",
};

// Smoothing factors for different properties
const SMOOTHING = {
  position: 0.3,
  scale: 0.3,
  rotation: 0.4,
};

let lastTShirtAlignment = null;

/**
 * Performs a shortest-path linear interpolation between two angles.
 * @param {number} a The start angle in radians.
 * @param {number} b The end angle in radians.
 * @param {number} t The interpolation factor (0.0 to 1.0).
 * @returns {number} The interpolated angle in radians.
 */
function lerpShortestAngle(a, b, t) {
  const diff = (b - a) % (Math.PI * 2);
  const shortestDiff = 2 * diff % (Math.PI * 2) - diff;
  return a + shortestDiff * t;
}
// Key landmark indices for different accessory types (MediaPipe face mesh indices)
const LANDMARK_INDICES = {
  leftEyeCenter: 159,
  rightEyeCenter: 386,
  noseTip: 1,
  leftEarLobe: 234, // Left ear lobe
  rightEarLobe: 454, // Right ear lobe
  leftEarTop: 127, // Top of left ear
  rightEarTop: 356, // Top of right ear
  chinBottom: 152, // Bottom center of the chin
  leftJaw: 213, // Left jawline point
  rightJaw: 433, // Right jawline point
};

// Helper: convert MediaPipe normalized landmarks to pixel-like points used by your alignment functions
function convertFaceLandmarksToPixelPoints(faceLandmarks) {
  if (!faceLandmarks || !faceLandmarks.length) return null;
  // MediaPipe faceLandmarks provides normalized x,y (0..1) and z (approx - to + where scale is relative).
  // Convert to same coordinate expectation used previously: x,y in pixels, z scaled similar to width.
  return faceLandmarks.map((lm) => ({
    x: lm.x * VIDEO_WIDTH,
    y: lm.y * VIDEO_HEIGHT,
    z: lm.z * VIDEO_WIDTH, // keep z scaled similar to width units
  }));
}

// Helper: convert pose landmarks to pixel points
function convertPoseLandmarksToPixelPoints(poseLandmarks) {
  if (!poseLandmarks || !poseLandmarks.length) return null;
  return poseLandmarks.map((lm) => ({
    x: lm.x * VIDEO_WIDTH,
    y: lm.y * VIDEO_HEIGHT,
    z: lm.z * VIDEO_WIDTH,
  }));
}

/**
 * Accessory Alignment Strategies
 * Each accessory type has its own calculation method
 * NOTE: These expect `landmarks` in pixel-space like convertFaceLandmarksToPixelPoints outputs.
 */
const AccessoryAlignmentStrategies = {
  [ACCESSORY_TYPES.GLASSES]: (landmarks, uvToWorld) => {
    const leftEye = landmarks[LANDMARK_INDICES.leftEyeCenter];
    const rightEye = landmarks[LANDMARK_INDICES.rightEyeCenter];
    const noseTip = landmarks[LANDMARK_INDICES.noseTip];

    if (!leftEye || !rightEye || !noseTip) return { visible: false };

    // Calculate glasses center (between eyes, slightly above)
    const glassesCenter = {
      x: (leftEye.x + rightEye.x) / 2,
      y: (leftEye.y + rightEye.y) / 2 + 0.01 * VIDEO_HEIGHT,
      z: (leftEye.z + rightEye.z) / 2 - 0.05 * VIDEO_WIDTH,
    };

    // Normalize to UV coordinates (0..1)
    const normalizedCenter = {
      x: glassesCenter.x / VIDEO_WIDTH,
      y: glassesCenter.y / VIDEO_HEIGHT - 0.02,
      z: glassesCenter.z / VIDEO_WIDTH,
    };

    // Convert to world position
    const targetZ = -0.1;
    const world = uvToWorld(normalizedCenter.x, normalizedCenter.y, targetZ);
    const position = { x: world.x, y: world.y, z: world.z };

    // Calculate scale based on eye distance
    const eyeDistancePixels = Math.sqrt(
      Math.pow(rightEye.x - leftEye.x, 2) + Math.pow(rightEye.y - leftEye.y, 2) + Math.pow(rightEye.z - leftEye.z, 2)
    );
    const eyeDistanceNormalized = eyeDistancePixels / VIDEO_WIDTH;
    const scale = Math.max(0.5, Math.min(4.0, eyeDistanceNormalized * 20));

    // Calculate rotation (roll, yaw, pitch)
    const eyeVector = {
      x: rightEye.x - leftEye.x,
      y: rightEye.y - leftEye.y,
    };
    const roll = -Math.atan2(eyeVector.y, eyeVector.x);

    const eyeMidpoint = {
      x: (leftEye.x + rightEye.x) / 2,
      y: (leftEye.y + rightEye.y) / 2,
    };
    const noseOffsetX = noseTip.x - eyeMidpoint.x;
    const yaw = Math.atan2(noseOffsetX, eyeDistancePixels) * 0.8;

    const noseOffsetY = noseTip.y - eyeMidpoint.y;
    const pitch = Math.atan2(noseOffsetY, eyeDistancePixels * 0.8) - 0.8;

    return {
      position,
      rotation: { pitch, yaw, roll },
      scale,
      visible: true,
    };
  },

  [ACCESSORY_TYPES.EARRINGS]: (landmarks, uvToWorld) => {
    function averagePoints(landmarks, indices) {
      const pts = indices.map((i) => landmarks[i]).filter(Boolean);
      if (pts.length === 0) return null;
      const avg = pts.reduce(
        (acc, p) => ({
          x: acc.x + p.x,
          y: acc.y + p.y,
          z: acc.z + p.z,
        }),
        { x: 0, y: 0, z: 0 }
      );
      const n = pts.length;
      return { x: avg.x / n, y: avg.y / n, z: avg.z / n };
    }

    const leftEarLobe = averagePoints(landmarks, [234, 93, 132, 127]);
    const rightEarLobe = averagePoints(landmarks, [454, 323, 361, 356]);
    const leftEyeCenter = landmarks[LANDMARK_INDICES.leftEyeCenter];
    const rightEyeCenter = landmarks[LANDMARK_INDICES.rightEyeCenter];

    if (!leftEarLobe || !rightEarLobe || !leftEyeCenter || !rightEyeCenter) {
      return { visible: false };
    }

    // Pixel -> normalized UV
    const leftEarringPos = {
      x: leftEarLobe.x / VIDEO_WIDTH - 0.009,
      y: leftEarLobe.y / VIDEO_HEIGHT + 0.04,
      z: leftEarLobe.z / VIDEO_WIDTH,
    };

    const rightEarringPos = {
      x: rightEarLobe.x / VIDEO_WIDTH + 0.009,
      y: rightEarLobe.y / VIDEO_HEIGHT + 0.04,
      z: rightEarLobe.z / VIDEO_WIDTH,
    };

    // Convert to world coordinates
    const leftWorld = uvToWorld(leftEarringPos.x, leftEarringPos.y, -0.25);
    const rightWorld = uvToWorld(rightEarringPos.x, rightEarringPos.y, -0.25);

    // Calculate scale using eye distance
    const eyeDistance = Math.sqrt(
      Math.pow(rightEyeCenter.x - leftEyeCenter.x, 2) + Math.pow(rightEyeCenter.y - leftEyeCenter.y, 2)
    );
    const scale = Math.max(0.3, Math.min(3.0, (eyeDistance / VIDEO_WIDTH) * 12));

    const eyeVector = {
      x: rightEyeCenter.x - leftEyeCenter.x,
      y: rightEyeCenter.y - leftEyeCenter.y,
    };
    const roll = -Math.atan2(eyeVector.y, eyeVector.x);

    return {
      positions: [
        { x: leftWorld.x, y: leftWorld.y, z: leftWorld.z },
        { x: rightWorld.x, y: rightWorld.y, z: rightWorld.z },
      ],
      rotation: { pitch: 0, yaw: 0, roll },
      scale,
      visible: true,
      isMultiple: true,
    };
  },
[ACCESSORY_TYPES.NECKLACE]: (landmarks, uvToWorld) => {
  // This strategy now expects RAW, NORMALIZED pose landmarks (0-1 range)
  const leftShoulder = landmarks[11];
  const rightShoulder = landmarks[12];

  if (!leftShoulder || !rightShoulder) return { visible: false };

  // Calculate center and apply a slight vertical offset
  const centerX = (leftShoulder.x + rightShoulder.x) / 2;
  const centerY = (leftShoulder.y + rightShoulder.y) / 2 - 0.06; // Offset up
  const centerZ = (leftShoulder.z + rightShoulder.z) / 2;

  // Convert normalized UV coordinates to world coordinates
  const world = uvToWorld(centerX, centerY, centerZ);

  // Scale based on shoulder distance in normalized coordinates
  const shoulderDist = Math.sqrt(
    Math.pow(rightShoulder.x - leftShoulder.x, 2) +
    Math.pow(rightShoulder.y - leftShoulder.y, 2) 
  );
  const scale = Math.max(0.1, Math.min(4.0, shoulderDist * 6));

  console.log("🟢 Necklace Debug:", {
    normalized: { x: centerX.toFixed(3), y: centerY.toFixed(3), z: centerZ.toFixed(3) },
    world: { x: world.x.toFixed(3), y: world.y.toFixed(3), z: world.z.toFixed(3) },
    scale: scale.toFixed(2),
  });

  return {
    position: { x: world.x, y: world.y, z: world.z },
    rotation: { pitch: 0, yaw: 0, roll: 0 },
    scale,
    visible: true,
  };
},

[ACCESSORY_TYPES.T_SHIRT]: (landmarks, uvToWorld) => {
    // This strategy uses NORMALIZED pose landmarks
    const leftShoulder = landmarks[11];
    const rightShoulder = landmarks[12];
    const leftHip = landmarks[23];
    const rightHip = landmarks[24];

    if (!leftShoulder || !rightShoulder || !leftHip || !rightHip) {
      return { visible: false };
    }

    const shoulderVec = {
  x: rightShoulder.x - leftShoulder.x,
  y: rightShoulder.y - leftShoulder.y,
  z: rightShoulder.z - leftShoulder.z,
};

    // --- Position Calculation ---
    // Position: Center of the torso
    const shoulderCenter = {
      x: (leftShoulder.x + rightShoulder.x) / 2,
      y: (leftShoulder.y + rightShoulder.y) / 2,
      z: (leftShoulder.z + rightShoulder.z) / 2,
    };
    const hipCenter = {
      x: (leftHip.x + rightHip.x) / 2,
      y: (leftHip.y + rightHip.y) / 2,
      z: (leftHip.z + rightHip.z) / 2,
    };

    const torsoCenter = {
      x: (shoulderCenter.x + hipCenter.x) / 2,
      y: shoulderCenter.y + (hipCenter.y - shoulderCenter.y) * 0.2, // Position closer to shoulders
      z: (shoulderCenter.z + hipCenter.z) / 2 - 0.1, // Approx depth, slightly forward
    };

    const world = uvToWorld(torsoCenter.x, torsoCenter.y, torsoCenter.z);

    // --- Scale Calculation ---
    // Scale: Based on shoulder width and torso height
    const shoulderDist = Math.sqrt(Math.pow(rightShoulder.x - leftShoulder.x, 2) + Math.pow(rightShoulder.y - leftShoulder.y, 2));
    const torsoHeight = Math.abs(shoulderCenter.y - hipCenter.y);
    const scale = Math.max(shoulderDist * 4, torsoHeight * 1.8);

    // --- Rotation Calculation ---
    // Rotation: Align with shoulders
    const shoulderAngle = Math.atan2(shoulderVec.z, shoulderVec.x);
    // Add Math.PI to correct the initial 180-degree rotation of the model.
    const targetYaw = shoulderAngle + Math.PI;

    // --- Smoothing ---
    let alignment = {
      position: { x: world.x, y: world.y, z: world.z },
      rotation: { pitch: 0, yaw: targetYaw, roll: 0 }, // Using yaw to align horizontally
      scale,
      visible: true,
    };

    if (lastTShirtAlignment) {
      alignment.position.x = THREE.MathUtils.lerp(lastTShirtAlignment.position.x, alignment.position.x, SMOOTHING.position);
      alignment.position.y = THREE.MathUtils.lerp(lastTShirtAlignment.position.y, alignment.position.y, SMOOTHING.position);
      alignment.position.z = THREE.MathUtils.lerp(lastTShirtAlignment.position.z, alignment.position.z, SMOOTHING.position);
      alignment.scale = THREE.MathUtils.lerp(lastTShirtAlignment.scale, alignment.scale, SMOOTHING.scale);
      // Use our custom lerpShortestAngle for smooth rotation that handles wrapping around PI/-PI
      alignment.rotation.yaw = lerpShortestAngle(lastTShirtAlignment.rotation.yaw, targetYaw, SMOOTHING.rotation);
    }

    lastTShirtAlignment = { ...alignment };
    return alignment;
  },
};

export default function FaceMeshViewer({ accessory, setDebugInfo, setIsAccessoryLoaded, setIsModelLoaded, setStatus }) {
  const videoRef = useRef(null);
  const threeContainerRef = useRef(null);
  const animationRef = useRef(null);
  const sceneRef = useRef(null);
  const rendererRef = useRef(null);
  const cameraRef = useRef(null);
  const accessoryRef = useRef(null);
  const accessoryInstancesRef = useRef([]);
  const faceOccluderRef = useRef(null);
  const currentAccessoryRef = useRef(null);
  const holisticRef = useRef(null);
  const cameraUtilRef = useRef(null);
  const [isSceneReady, setIsSceneReady] = useState(false);

  // Update accessory ref when prop changes
  useEffect(() => {
    currentAccessoryRef.current = accessory;
    console.log("🎯 Accessory changed to:", accessory?.type, accessory?.name);
  }, [accessory]);

  // Accessory loading effect (same structure as your original)
  useEffect(() => {
    if (!isSceneReady || !accessory?.path) return;

    async function loadAccessoryModel(accessoryConfig) {
      try {
        cleanupAccessories();

        setIsAccessoryLoaded(false);
        setStatus(`Loading ${accessoryConfig.name}...`);

        const { GLTFLoader } = await import("three/examples/jsm/loaders/GLTFLoader.js");
        const loader = new GLTFLoader();

        loader.load(
          accessoryConfig.path,
          (gltf) => {
            console.log(`Accessory loaded: ${accessoryConfig.name} (${accessoryConfig.type})`);

            const needsMultipleInstances = accessoryConfig.type === ACCESSORY_TYPES.EARRINGS;

            if (needsMultipleInstances) {
              for (let i = 0; i < 2; i++) {
                const instance = gltf.scene.clone();
                setupAccessoryMesh(instance);
                sceneRef.current.add(instance);
                accessoryInstancesRef.current.push(instance);
              }
            } else {
              const model = gltf.scene;
              setupAccessoryMesh(model);
              sceneRef.current.add(model);
              accessoryRef.current = model;
            }

            setIsAccessoryLoaded(true);
            setStatus(`${accessoryConfig.name} loaded successfully!`);
          },
          (progress) => {
            const percent = progress.total ? ((progress.loaded / progress.total) * 100).toFixed(0) : "-";
            setStatus(`Loading ${accessoryConfig.name}... ${percent}%`);
          },
          (error) => {
            console.error(`Error loading ${accessoryConfig.name}:`, error);
            setStatus(`Failed to load ${accessoryConfig.name}`);
            createFallbackModel(accessoryConfig.type);
          }
        );
      } catch (err) {
        console.error("Error setting up accessory loader:", err);
        createFallbackModel(accessoryConfig.type);
      }
    }

    loadAccessoryModel(accessory);
  }, [accessory, isSceneReady]);

  function setupAccessoryMesh(mesh) {
    mesh.traverse((child) => {
      if (child.isMesh) {
        child.material.depthTest = true;
        child.material.depthWrite = true;
      }
    });
    mesh.scale.set(0.1, 0.1, 0.1);
    mesh.position.set(0, 0, 0);
    mesh.visible = false;
    mesh.renderOrder = 0;
  }

  function cleanupAccessories() {
    if (accessoryRef.current && sceneRef.current) {
      sceneRef.current.remove(accessoryRef.current);
      accessoryRef.current = null;
    }

    if (accessoryInstancesRef.current.length > 0) {
      accessoryInstancesRef.current.forEach((instance) => {
        if (sceneRef.current) sceneRef.current.remove(instance);
      });
      accessoryInstancesRef.current = [];
    }
  }

  function createFallbackModel(type) {
    if (!sceneRef.current) return;

    console.log(`Creating fallback model for ${type}`);
    const geometry = new THREE.BoxGeometry(0.08, 0.08, 0.08);
    const material = new THREE.MeshBasicMaterial({
      color: type === ACCESSORY_TYPES.EARRINGS ? 0xffd700 : 0x00ff00,
      wireframe: false,
      transparent: true,
      opacity: 0.8,
    });

    if (type === ACCESSORY_TYPES.EARRINGS) {
      for (let i = 0; i < 2; i++) {
        const cube = new THREE.Mesh(geometry, material);
        cube.position.set(i === 0 ? -0.2 : 0.2, 0, -0.3);
        cube.visible = true;
        cube.renderOrder = 1;
        sceneRef.current.add(cube);
        accessoryInstancesRef.current.push(cube);
      }
    } else {
      const cube = new THREE.Mesh(geometry, material);
      cube.position.set(0, 0, -0.3);
      cube.visible = true;
      cube.renderOrder = 1;
      sceneRef.current.add(cube);
      accessoryRef.current = cube;
    }

    setIsAccessoryLoaded(true);
    setStatus(`Using DEBUG MODE for ${type}`);
  }

  // Main initialization effect
  useEffect(() => {
    let running = true;

    async function initCameraElement() {
      try {
        setStatus("Requesting camera access...");
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: VIDEO_WIDTH, height: VIDEO_HEIGHT, facingMode: "user" },
          audio: false,
        });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          return new Promise((resolve) => {
            videoRef.current.onloadedmetadata = () => {
              setStatus("Camera ready");
              resolve();
            };
          });
        }
      } catch (err) {
        console.error("Camera access denied:", err);
        setStatus("Camera access denied");
        throw err;
      }
    }

    async function initThreeJS() {
      try {
        setStatus("Initializing 3D scene...");

        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(50, VIDEO_WIDTH / VIDEO_HEIGHT, 0.01, 100);
        const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, stencil: true });

        renderer.setSize(VIDEO_WIDTH, VIDEO_HEIGHT);
        renderer.setClearColor(0x000000, 0);
        renderer.domElement.style.position = "absolute";
        renderer.domElement.style.top = "0";
        renderer.domElement.style.left = "0";
        renderer.domElement.style.pointerEvents = "none";
        renderer.sortObjects = true;

        if (threeContainerRef.current) {
          threeContainerRef.current.appendChild(renderer.domElement);
        }

        const ambientLight = new THREE.AmbientLight(0xffffff, 0.3);
        scene.add(ambientLight);

        const keyLight = new THREE.DirectionalLight(0xffffff, 2.0);
        keyLight.position.set(0, 0, 1);
        keyLight.target.position.set(0, 0, 0);
        scene.add(keyLight);
        scene.add(keyLight.target);

        const keyLight1 = new THREE.DirectionalLight(0xffffff, 5.0);
        keyLight1.position.set(0, 0, 0);
        keyLight1.target.position.set(0, 0, 0);
        scene.add(keyLight1);
        scene.add(keyLight1.target);

        const fillLight = new THREE.DirectionalLight(0xffffff, 0.5);
        fillLight.position.set(-0.5, 0.5, 1);
        fillLight.target.position.set(0, 0, 0);
        scene.add(fillLight);
        scene.add(fillLight.target);

        camera.position.set(0, 0, 1);
        camera.lookAt(0, 0, 0);

        sceneRef.current = scene;
        rendererRef.current = renderer;
        cameraRef.current = camera;
        setIsSceneReady(true);

        setStatus("3D scene initialized");
        return { scene, camera, renderer };
      } catch (err) {
        console.error("Three.js initialization error:", err);
        setStatus("3D initialization failed");
        throw err;
      }
    }

    function createFaceOccluder() {
      if (!sceneRef.current) return;

      const occluderGeometry = new THREE.BufferGeometry();
      const occluderMaterial = new THREE.MeshBasicMaterial({
        color: 0x000000,
        depthWrite: true,
        depthTest: true,
        colorWrite: false,
        side: THREE.DoubleSide,
        opacity: 0,
      });

      const occluder = new THREE.Mesh(occluderGeometry, occluderMaterial);
      occluder.renderOrder = -1;
      occluder.visible = false;

      sceneRef.current.add(occluder);
      faceOccluderRef.current = occluder;
    }

    function updateFaceOccluderFromFaceLandmarks(facePoints) {
      if (!faceOccluderRef.current || !facePoints || facePoints.length < 468) {
        if (faceOccluderRef.current) faceOccluderRef.current.visible = false;
        return;
      }

      try {
        const vertices = [];
        for (let i = 0; i < facePoints.length; i++) {
          const lm = facePoints[i];
          const worldPos = uvToWorld(lm.x / VIDEO_WIDTH, lm.y / VIDEO_HEIGHT, -0.15);
          vertices.push(worldPos.x, worldPos.y, worldPos.z);
        }

        const geometry = faceOccluderRef.current.geometry;
        geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));

        // FACEMESH_TRIANGULATION is an array of indices; ensure it's flat indices
        const indices = FACEMESH_TRIANGULATION.flat ? FACEMESH_TRIANGULATION.flat() : FACEMESH_TRIANGULATION;
        geometry.setIndex(indices);
        geometry.computeVertexNormals();

        faceOccluderRef.current.visible = true;
      } catch (error) {
        console.warn("Failed to update face occluder:", error);
        if (faceOccluderRef.current) faceOccluderRef.current.visible = false;
      }
    }

    function uvToWorld(u, v, planeZ = 0) {
      const cam = cameraRef.current;
      const ndc = new THREE.Vector3(u * 2 - 1, 1 - v * 2, 0.5);
      ndc.unproject(cam);
      const dir = ndc.sub(cam.position).normalize();
      const t = (planeZ - cam.position.z) / dir.z;
      return cam.position.clone().add(dir.multiplyScalar(t));
    }

    function updateAccessoryAlignment(alignment) {
      if (!alignment || !alignment.visible) {
        hideAllAccessories();
        return;
      }

      if (alignment.isMultiple && accessoryInstancesRef.current.length > 0) {
        alignment.positions.forEach((pos, index) => {
          if (accessoryInstancesRef.current[index]) {
            const instance = accessoryInstancesRef.current[index];
            instance.visible = true;
            instance.position.set(pos.x, pos.y, pos.z);
            instance.rotation.x = alignment.rotation.pitch;
            instance.rotation.y = alignment.rotation.yaw;
            instance.rotation.z = alignment.rotation.roll;

            const clampedScale = Math.max(0.1, Math.min(4.0, alignment.scale));
            instance.scale.setScalar(clampedScale);
            instance.updateMatrix();
            instance.updateMatrixWorld(true);
          }
        });

        setDebugInfo(
          `Earrings - L:(${alignment.positions[0].x.toFixed(2)},${alignment.positions[0].y.toFixed(2)}) Scale:${alignment.scale.toFixed(2)}`
        );
      } else if (accessoryRef.current) {
        const { position, rotation, scale } = alignment;
        accessoryRef.current.visible = true;
        accessoryRef.current.position.set(position.x, position.y, position.z);
        accessoryRef.current.rotation.x = rotation.pitch;
        accessoryRef.current.rotation.y = rotation.yaw;
        accessoryRef.current.rotation.z = rotation.roll;

        const clampedScale = Math.max(0.1, Math.min(4.0, scale));
        accessoryRef.current.scale.setScalar(clampedScale);
        accessoryRef.current.updateMatrix();
        accessoryRef.current.updateMatrixWorld(true);

        setDebugInfo(
          `Pos:(${position.x.toFixed(2)},${position.y.toFixed(2)},${position.z.toFixed(2)}) Scale:${clampedScale.toFixed(
            2
          )}`
        );
      }

      if (rendererRef.current && sceneRef.current && cameraRef.current) {
        rendererRef.current.clear(false, true, false);
        rendererRef.current.render(sceneRef.current, cameraRef.current);
      }
    }

    function hideAllAccessories() {
      if (accessoryRef.current) accessoryRef.current.visible = false;
      accessoryInstancesRef.current.forEach((instance) => (instance.visible = false));
    }

    // Holistic onResults callback
    function onHolisticResults(results) {
      if (!running) return;

      // Convert landmarks into pixel-space points similar to your previous detector output
      const facePoints = results.faceLandmarks ? convertFaceLandmarksToPixelPoints(results.faceLandmarks) : null;
      const posePoints = results.poseLandmarks ? convertPoseLandmarksToPixelPoints(results.poseLandmarks) : null;

      // update occluder
      if (facePoints) updateFaceOccluderFromFaceLandmarks(facePoints);

      // determine alignment strategy based on current accessory
      const currentAccessory = currentAccessoryRef.current;
      const strategy = AccessoryAlignmentStrategies[currentAccessory?.type];

      let alignment = null;
      try {
        if (strategy) {
          // Necklace strategy needs raw normalized pose landmarks
          if (currentAccessory?.type === ACCESSORY_TYPES.NECKLACE || currentAccessory?.type === ACCESSORY_TYPES.T_SHIRT) {
            alignment = strategy(results.poseLandmarks, uvToWorld);
          } else {
            alignment = strategy(facePoints, uvToWorld); // Other strategies use pixel-space points
          }
        } else {
          // no strategy for current accessory — hide accessories
          console.warn("No alignment strategy for", currentAccessory?.type);
        }
      } catch (err) {
        console.error("Alignment strategy error:", err);
      }

      if (alignment && alignment.visible) {
        setStatus(`✅ Tracking face - ${currentAccessory?.name || "accessory"} aligned`);
      } else {
        setStatus("👋 No face/pose detected or accessory not visible");
      }

      updateAccessoryAlignment(alignment);
    }

    async function initHolistic() {
      try {
        setStatus("Loading MediaPipe Holistic...");
        const holistic = new Holistic({
          locateFile: (file) => {
            // default CDN path (you can adjust if you host assets locally)
            return `https://cdn.jsdelivr.net/npm/@mediapipe/holistic/${file}`;
          },
        });

        holistic.setOptions({
          modelComplexity: 1,
          smoothLandmarks: true,
          refineFaceLandmarks: true,
          minDetectionConfidence: 0.5,
          minTrackingConfidence: 0.5,
        });

        holistic.onResults(onHolisticResults);
        holisticRef.current = holistic;
        setIsModelLoaded(true);
        setStatus("Holistic ready");
      } catch (err) {
        console.error("Holistic init error:", err);
        setStatus("Holistic initialization failed");
        setIsModelLoaded(false);
      }
    }

    // Start camera feed using MediaPipe Camera util which will call holistic.send({image: video})
    async function startCameraSendingToHolistic() {
      if (!videoRef.current) return;

      try {
        cameraUtilRef.current = new Camera(videoRef.current, {
          onFrame: async () => {
            if (holisticRef.current) {
              await holisticRef.current.send({ image: videoRef.current });
            }
          },
          width: VIDEO_WIDTH,
          height: VIDEO_HEIGHT,
        });
        cameraUtilRef.current.start();
      } catch (err) {
        console.warn("Camera util failed; falling back to manual capture:", err);
        // fallback: use a requestAnimationFrame loop to send frames
        const fallbackLoop = async () => {
          if (!running) return;
          if (holisticRef.current && videoRef.current && videoRef.current.readyState >= 2) {
            try {
              await holisticRef.current.send({ image: videoRef.current });
            } catch (e) {
              // ignore
            }
          }
          requestAnimationFrame(fallbackLoop);
        };
        fallbackLoop();
      }
    }

    // Simple render loop to continuously render Three scene for smoother visuals
    function renderLoop() {
      if (!running) return;
      if (rendererRef.current && sceneRef.current && cameraRef.current) {
        rendererRef.current.render(sceneRef.current, cameraRef.current);
      }
      animationRef.current = requestAnimationFrame(renderLoop);
    }

    async function initAll() {
      try {
        await initCameraElement();
        await initThreeJS();
        createFaceOccluder();
        await initHolistic();
        await startCameraSendingToHolistic();

        // Ensure video plays
        if (videoRef.current && videoRef.current.readyState < 4) {
          await videoRef.current.play().catch(() => {});
        }

        renderLoop();

        console.log("Initialization complete");
      } catch (err) {
        console.error("Initialization error:", err);
        setStatus("Initialization failed");
      }
    }

    initAll();

    return () => {
      running = false;
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      if (cameraUtilRef.current && cameraUtilRef.current.stop) {
        try {
          cameraUtilRef.current.stop();
        } catch (e) {}
      }
      if (videoRef.current?.srcObject) {
        try {
          videoRef.current.srcObject.getTracks().forEach((t) => t.stop());
        } catch (e) {}
      }
      if (holisticRef.current) {
        try {
          holisticRef.current.close();
        } catch (e) {}
      }
      if (rendererRef.current) rendererRef.current.dispose();
      if (faceOccluderRef.current?.geometry) faceOccluderRef.current.geometry.dispose();
      if (faceOccluderRef.current?.material) faceOccluderRef.current.material.dispose();
      cleanupAccessories();
    };
  }, []);

  return (
    <div
      style={{
        position: "relative",
        width: VIDEO_WIDTH,
        height: VIDEO_HEIGHT,
        backgroundColor: "#000",
        borderRadius: "16px",
        overflow: "hidden",
        boxShadow: "0 10px 40px rgba(0,0,0,0.5)",
      }}
    >
      <video
        ref={videoRef}
        width={VIDEO_WIDTH}
        height={VIDEO_HEIGHT}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          zIndex: 0,
          transform: "scaleX(1)",
          objectFit: "cover",
        }}
        autoPlay
        muted
        playsInline
      />
      <div
        ref={threeContainerRef}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          zIndex: 1,
          pointerEvents: "none",
        }}
      />
    </div>
  );
}
