import React, { useEffect, useRef, useState } from "react";
import * as tf from "@tensorflow/tfjs";
import * as faceLandmarksDetection from "@tensorflow-models/face-landmarks-detection";
import "@tensorflow/tfjs-backend-webgl";
import { TRIANGULATION } from "./triangulation.js";
import * as THREE from "three";

const VIDEO_WIDTH = 720;
const VIDEO_HEIGHT = 620;

// Face mesh regions for realistic occlusion
const FACE_OCCLUDER_LANDMARKS = {
  faceContour: [
    10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288,
    397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136,
    172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109
  ],
  leftEye: [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246],
  rightEye: [362, 382, 381, 380, 374, 373, 390, 249, 263, 466, 388, 387, 386, 385, 384, 398],
  nose: [1, 2, 5, 4, 6, 168, 8, 9, 10, 151, 195, 197, 196, 3, 51, 48, 115, 131, 134, 102, 49],
  forehead: [10, 151, 9, 337, 299, 333, 298, 301, 284, 251]
};

export default function FaceMeshViewer({ glassesModelPath, setDebugInfo, setIsGlassesLoaded, setIsModelLoaded, setStatus }) {
  const videoRef = useRef(null);
  const threeContainerRef = useRef(null);
  const animationRef = useRef(null);
  const detectorRef = useRef(null);
  const sceneRef = useRef(null);
  const rendererRef = useRef(null);
  const cameraRef = useRef(null);
  const glassesRef = useRef(null);
  const faceOccluderRef = useRef(null);
  const [isSceneReady, setIsSceneReady] = useState(false);

  // This effect hook handles loading and changing the glasses model
  useEffect(() => {
    if (!isSceneReady || !glassesModelPath) return;

    async function loadGlassesModel(path) {
      try {
        // Remove the previous glasses model if it exists
        if (glassesRef.current && sceneRef.current) {
          sceneRef.current.remove(glassesRef.current);
          glassesRef.current = null;
        }
        setIsGlassesLoaded(false);
        setStatus(`Loading glasses model: ${path.split('/').pop()}`);

        const { GLTFLoader } = await import("three/examples/jsm/loaders/GLTFLoader.js");
        const loader = new GLTFLoader();

        loader.load(
          path,
          (gltf) => {
            console.log(`Glasses model loaded from ${path}`);
            const glasses = gltf.scene;

            glasses.traverse((child) => {
              if (child.isMesh) {
                child.material.depthTest = true;
                child.material.depthWrite = true;
              }
            });

            glasses.scale.set(0.1, 0.1, 0.1);
            glasses.position.set(0, 0, 0);
            glasses.visible = true;
            glasses.renderOrder = 0; // Render after occluder

            sceneRef.current.add(glasses);
            glassesRef.current = glasses;
            setIsGlassesLoaded(true);
            setStatus("Glasses model loaded successfully!");
          },
          (progress) => {
            const percent = ((progress.loaded / progress.total) * 100).toFixed(0);
            setStatus(`Loading glasses... ${percent}%`);
          },
          (error) => {
            console.error(`Error loading glasses model from ${path}:`, error);
            setStatus("Failed to load glasses model");
            createFallbackCube();
          }
        );
      } catch (err) {
        console.error("Error setting up glasses loader:", err);
        createFallbackCube();
        throw err;
      }
    }

    loadGlassesModel(glassesModelPath);

  }, [glassesModelPath, isSceneReady]);


  useEffect(() => {
    let isRunning = true;

    async function initCamera() {
      try {
        setStatus("Requesting camera access...");
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: VIDEO_WIDTH,
            height: VIDEO_HEIGHT,
            facingMode: "user",
          },
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
        const camera = new THREE.PerspectiveCamera(50,VIDEO_WIDTH / VIDEO_HEIGHT,0.01,100);
        const renderer = new THREE.WebGLRenderer({alpha: true,antialias: true,stencil: true});

        renderer.setSize(VIDEO_WIDTH, VIDEO_HEIGHT);
        renderer.setClearColor(0x000000, 0);
        renderer.domElement.style.position = "absolute";
        renderer.domElement.style.top = "0";
        renderer.domElement.style.left = "0";
        renderer.domElement.style.pointerEvents = "none";
        renderer.sortObjects = true;
        renderer.shadowMap.enabled = false;

        if (threeContainerRef.current) {
          threeContainerRef.current.appendChild(renderer.domElement);
        }

        const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
        scene.add(ambientLight);
        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.6);
        directionalLight.position.set(0, 1, 0.5);
        scene.add(directionalLight);

        camera.position.set(0, 0, 1);
        camera.lookAt(0, 0, 0);

        sceneRef.current = scene;
        rendererRef.current = renderer;
        cameraRef.current = camera;
        setIsSceneReady(true); // Signal that the scene is ready for models to be loaded

        setStatus("3D scene initialized");
        return { scene, camera, renderer };
      } catch (err) {
        console.error("Three.js initialization error:", err);
        setStatus("3D initialization failed");
        throw err;
      }
    }

    function createRealisticFaceOccluder() {
      if (!sceneRef.current) return;
      console.log("Creating realistic face occluder mesh");
      const occluderGeometry = new THREE.BufferGeometry();
      const occluderMaterial = new THREE.MeshBasicMaterial({
        color: 0x000000,
        depthWrite: true,
        depthTest: true,  
        colorWrite: false, 
        side: THREE.DoubleSide,
        opacity: 0  
      });

      const occluder = new THREE.Mesh(occluderGeometry, occluderMaterial);
      occluder.renderOrder = -1;
      occluder.visible = false;

      sceneRef.current.add(occluder);
      faceOccluderRef.current = occluder;
      console.log("Realistic face occluder created");
    }

    function updateRealisticFaceOccluder(landmarks) {
      if (!faceOccluderRef.current || !landmarks || landmarks.length < 468) {
        if (faceOccluderRef.current) faceOccluderRef.current.visible = false;
        return;
      }
      try {
        const occluderIndices = [
          ...FACE_OCCLUDER_LANDMARKS.faceContour,
          ...FACE_OCCLUDER_LANDMARKS.leftEye,
          ...FACE_OCCLUDER_LANDMARKS.rightEye,
          ...FACE_OCCLUDER_LANDMARKS.nose,
          ...FACE_OCCLUDER_LANDMARKS.forehead
        ];
        const uniqueIndices = [...new Set(occluderIndices)];
        const vertices = [];
        const validLandmarks = [];

        uniqueIndices.forEach(idx => {
          if (landmarks[idx]) {
            const landmark = landmarks[idx];
            const worldPos = uvToWorld(
              landmark.x / VIDEO_WIDTH,
              landmark.y / VIDEO_HEIGHT,
              -0.15
            );
            vertices.push(worldPos.x, worldPos.y, worldPos.z);
            validLandmarks.push(landmark);
          }
        });
        if (vertices.length < 9) {
          faceOccluderRef.current.visible = false;
          return;
        }
        const occluder = faceOccluderRef.current;
        const geometry = occluder.geometry;
        geometry.setAttribute("position",new THREE.Float32BufferAttribute(vertices, 3));
        const triangles = [];
        const numPoints = vertices.length / 3;
        const centerIdx = Math.floor(numPoints / 2);
        for (let i = 0; i < numPoints; i++) {
          if (i !== centerIdx) {
            const next = (i + 1) % numPoints;
            if (next !== centerIdx) {
              triangles.push(centerIdx, i, next);
            }
          }
        }
        for (let i = 0; i < Math.min(numPoints - 2, 20); i++) {
          triangles.push(i, i + 1, i + 2);
        }
        geometry.setIndex(triangles);
        geometry.computeVertexNormals();
        occluder.visible = true;
        // console.log(`Face occluder updated with ${numPoints} points, ${triangles.length/3} triangles`);
      } catch (error) {
        console.warn("Failed to update realistic face occluder:", error);
        if (faceOccluderRef.current) faceOccluderRef.current.visible = false;
      }
    }

    function createFallbackCube() {
      if (!sceneRef.current) return;
      console.log("Creating fallback debugging cube");
      const geometry = new THREE.BoxGeometry(0.1, 0.1, 0.1);
      geometry.computeBoundingSphere();
      geometry.computeBoundingBox();
      const material = new THREE.MeshBasicMaterial({color: 0x00ff00,wireframe: false,transparent: true,opacity: 0.8});
      const cube = new THREE.Mesh(geometry, material);
      cube.position.set(0, 0, -0.3);
      cube.visible = true;
      cube.renderOrder = 1;
      sceneRef.current.add(cube);
      glassesRef.current = cube;
      setIsGlassesLoaded(true);
      setStatus("Using DEBUG CUBE with realistic face occlusion");
      console.log("Debug cube created at position:", cube.position);
    }

    async function loadFaceMeshModel() {
      try {
        setStatus("Loading TensorFlow...");
        await tf.ready();
        console.log("TensorFlow ready");
        setStatus("Loading MediaPipe FaceMesh model...");
        const model = faceLandmarksDetection.SupportedModels.MediaPipeFaceMesh;
        const detectorConfig = {runtime: "tfjs",maxFaces: 1,refineLandmarks: true};
        const detector = await faceLandmarksDetection.createDetector(model,detectorConfig);
        detectorRef.current = detector;
        setIsModelLoaded(true);
        setStatus("MediaPipe FaceMesh loaded successfully!");
        console.log("MediaPipe FaceMesh model loaded successfully");
        return detector;
      } catch (err) {
        console.error("Error loading MediaPipe model:", err);
        setStatus("Model loading failed, using simulation");
        setIsModelLoaded(false);
        return null;
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

    function getFaceAlignment(landmarks) {
      try {
        const leftEyeCenter = landmarks[159];
        const rightEyeCenter = landmarks[386];
        const noseTip = landmarks[1];
        const glassesCenter = {x: (leftEyeCenter.x + rightEyeCenter.x) / 2,y: (leftEyeCenter.y + rightEyeCenter.y) / 2 + 0.01,z: (leftEyeCenter.z + rightEyeCenter.z) / 2 - 0.05,};
        const normalizedGlassesCenter = {x: glassesCenter.x / VIDEO_WIDTH,y: glassesCenter.y / VIDEO_HEIGHT - 0.02,z: glassesCenter.z / VIDEO_WIDTH};
        const u = normalizedGlassesCenter.x;
        const v = normalizedGlassesCenter.y;
        const targetZ = -0.1;
        const world = uvToWorld(u, v, targetZ);
        const position = { x: world.x, y: world.y, z: world.z };
        const eyeDistancePixels = Math.sqrt(Math.pow(rightEyeCenter.x - leftEyeCenter.x, 2) + Math.pow(rightEyeCenter.y - leftEyeCenter.y, 2) + Math.pow(rightEyeCenter.z - leftEyeCenter.z, 2));
        const eyeDistanceNormalized = eyeDistancePixels / VIDEO_WIDTH;
        const scale = Math.max(0.5, Math.min(4.0, eyeDistanceNormalized * 20));
        const eyeVectorPixels = {x: rightEyeCenter.x - leftEyeCenter.x,y: rightEyeCenter.y - leftEyeCenter.y,};
        const roll = -Math.atan2(eyeVectorPixels.y, eyeVectorPixels.x);
        const eyeMidpointPixels = {x: (leftEyeCenter.x + rightEyeCenter.x) / 2,y: (leftEyeCenter.y + rightEyeCenter.y) / 2};
        const noseOffsetPixels = noseTip.x - eyeMidpointPixels.x;
        const yaw = Math.atan2(noseOffsetPixels, eyeDistancePixels) * 0.8;
        const noseOffsetY = noseTip.y - eyeMidpointPixels.y;
        const pitch = Math.atan2(noseOffsetY, eyeDistancePixels * 0.8) - 0.8;
        return {position,rotation: { pitch, yaw, roll },scale};
      } catch (err) {
        console.error("Error calculating face alignment:", err);
        return {position: { x: 0, y: 0, z: -0.3 },rotation: { pitch: 0, yaw: 0, roll: 0 },scale: 1};
      }
    }

    function updateGlassesAlignment(alignment) {
      if (!glassesRef.current) return;
      const { position, rotation, scale } = alignment;
      glassesRef.current.visible = true;
      glassesRef.current.position.set(position.x, position.y, position.z);
      glassesRef.current.rotation.x = rotation.pitch;
      glassesRef.current.rotation.y = rotation.yaw;
      glassesRef.current.rotation.z = rotation.roll;
      const clampedScale = Math.max(0.1, Math.min(4.0, scale));
      glassesRef.current.scale.setScalar(clampedScale);
      glassesRef.current.updateMatrix();
      glassesRef.current.updateMatrixWorld(true);
      setDebugInfo(`Pos: (${position.x.toFixed(2)}, ${position.y.toFixed(2)}, ${position.z.toFixed(2)}) Scale: ${clampedScale.toFixed(2)}`);
      if (rendererRef.current && sceneRef.current && cameraRef.current) {
        rendererRef.current.clear(false, true, false);
        rendererRef.current.render(sceneRef.current, cameraRef.current);
      }
    }

    function getSimulatedAlignment() {
      const time = Date.now() * 0.001;
      return {
        position: { x: 0, y: 0, z: -0.3 },
        rotation: {pitch: Math.sin(time * 0.7) * 0.1,yaw: Math.sin(time * 0.5) * 0.2,roll: Math.sin(time * 0.3) * 0.1},
        scale: 1.0,
      };
    }

    async function detectLoop() {
      if (!isRunning) return;
      let alignment = {position: { x: 0, y: 0, z: -0.3 },rotation: { pitch: 0, yaw: 0, roll: 0 },scale: 1.0};
      try {
        if (detectorRef.current && videoRef.current && videoRef.current.readyState === 4) {
          const predictions = await detectorRef.current.estimateFaces(videoRef.current,{flipHorizontal: false});
          if (predictions.length > 0) {
            const face = predictions[0];
            if (face.keypoints && face.keypoints.length > 400) {
              alignment = getFaceAlignment(face.keypoints);
              updateRealisticFaceOccluder(face.keypoints);
              // setStatus(`🎧 Headphones aligned! Tracking ${predictions.length} face(s)`);
            }
          } else {
            setStatus("👋 No face detected - show your face to the camera");
            if (faceOccluderRef.current) faceOccluderRef.current.visible = false;
            alignment = {position: { x: 0, y: 0, z: -0.3 },rotation: { pitch: 0, yaw: 0, roll: 0 },scale: 2.5};
          }
        } else {
          alignment = getSimulatedAlignment();
          if (!detectorRef.current) setStatus("🤖 Simulation mode (model not loaded)");
        }
      } catch (err) {
        console.error("Detection error:", err);
        alignment = getSimulatedAlignment();
        setStatus("⚠️ Detection error - using simulation");
      }
      updateGlassesAlignment(alignment);
      animationRef.current = requestAnimationFrame(detectLoop);
    }

    async function init() {
      try {
        await initCamera();
        await initThreeJS();
        createRealisticFaceOccluder();
        // The glasses model loading is now handled by the useEffect hook watching `glassesModelPath`
        detectLoop();
        await loadFaceMeshModel();
        if (videoRef.current && videoRef.current.readyState < 4) {
          await videoRef.current.play();
        }
        console.log("Initialization complete");
      } catch (err) {
        console.error("Initialization error:", err);
        setStatus("Initialization failed");
      }
    }

    init();

    return () => {
      isRunning = false;
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      if (videoRef.current?.srcObject) videoRef.current.srcObject.getTracks().forEach((track) => track.stop());
      if (rendererRef.current) rendererRef.current.dispose();
      if (faceOccluderRef.current?.geometry) faceOccluderRef.current.geometry.dispose();
      if (faceOccluderRef.current?.material) faceOccluderRef.current.material.dispose();
    };
  }, []);

  return (
    <div style={{position: "relative",width: VIDEO_WIDTH,height: VIDEO_HEIGHT,backgroundColor: "#000",borderRadius: "16px",overflow: "hidden"}}>
      <video ref={videoRef} width={VIDEO_WIDTH} height={VIDEO_HEIGHT} style={{position: "absolute",top: 0,left: 0,zIndex: 0,transform: "scaleX(1)",objectFit: "cover"}} autoPlay muted playsInline/>
      <div ref={threeContainerRef} style={{position: "absolute",top: 0,left: 0,zIndex: 1,pointerEvents: "none"}}/>
    </div>
  );
}