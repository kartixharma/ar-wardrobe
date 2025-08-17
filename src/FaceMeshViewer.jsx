import React, { useEffect, useRef, useState } from "react";
import * as tf from "@tensorflow/tfjs";
import * as faceLandmarksDetection from "@tensorflow-models/face-landmarks-detection";
import "@tensorflow/tfjs-backend-webgl";
import * as THREE from "three";

const VIDEO_WIDTH = 640;
const VIDEO_HEIGHT = 480;

export default function FaceMeshViewer() {
  const videoRef = useRef(null);
  const threeContainerRef = useRef(null);
  const animationRef = useRef(null);
  const detectorRef = useRef(null);
  const sceneRef = useRef(null);
  const rendererRef = useRef(null);
  const cameraRef = useRef(null);
  const glassesRef = useRef(null);
  const [status, setStatus] = useState("Initializing...");
  const [isModelLoaded, setIsModelLoaded] = useState(false);
  const [isGlassesLoaded, setIsGlassesLoaded] = useState(false);
  const [debugInfo, setDebugInfo] = useState("");

  useEffect(() => {
    let isRunning = true;
    
    async function initCamera() {
      try {
        setStatus("Requesting camera access...");
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { 
            width: VIDEO_WIDTH, 
            height: VIDEO_HEIGHT,
            facingMode: 'user'
          },
          audio: false
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
        
        // Scene setup
        const scene = new THREE.Scene();
        
        // FIXED: Better camera setup with appropriate clipping planes
        const camera = new THREE.PerspectiveCamera(
          50,  // Reduced FOV for less distortion
          VIDEO_WIDTH / VIDEO_HEIGHT, 
          0.01,  // Much closer near plane
          100    // Reasonable far plane
        );
        
        const renderer = new THREE.WebGLRenderer({ 
          alpha: true,
          antialias: true 
        });
        
        renderer.setSize(VIDEO_WIDTH, VIDEO_HEIGHT);
        renderer.setClearColor(0x000000, 0); // Transparent background
        renderer.domElement.style.position = "absolute";
        renderer.domElement.style.top = "0";
        renderer.domElement.style.left = "0";
        renderer.domElement.style.pointerEvents = "none";
        
        if (threeContainerRef.current) {
          threeContainerRef.current.appendChild(renderer.domElement);
        }

        // Enhanced lighting
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
        scene.add(ambientLight);
        
        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.6);
        directionalLight.position.set(0, 1, 0.5);
        scene.add(directionalLight);

        // FIXED: Camera positioned for AR overlay
        camera.position.set(0, 0, 1);
        camera.lookAt(0, 0, 0);

        // Store references
        sceneRef.current = scene;
        rendererRef.current = renderer;
        cameraRef.current = camera;
        
        setStatus("3D scene initialized");
        return { scene, camera, renderer };
      } catch (err) {
        console.error("Three.js initialization error:", err);
        setStatus("3D initialization failed");
        throw err;
      }
    }

    async function loadGlassesModel() {
      try {
        setStatus("Loading glasses model...");
        
        // Import GLTFLoader dynamically
        const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
        
        const loader = new GLTFLoader();
        
        return new Promise((resolve, reject) => {
          loader.load(
            '/models/aviator_sunglasses.glb',
            (gltf) => {
              console.log("Glasses model loaded successfully");
              const glasses = gltf.scene;
              glasses.traverse((child) => {
                if (child.isMesh) {
                  // Ensure material is valid
                  if (!(child.material && child.material.isMaterial)) {
                    child.material = new THREE.MeshStandardMaterial({ color: 0xffffff });
                  }
                  child.castShadow = true;
                  child.receiveShadow = true;
                  
                  // Ensure geometry has bounding sphere computed
                  if (child.geometry && !child.geometry.boundingSphere) {
                    child.geometry.computeBoundingSphere();
                  }
                  if (child.geometry && !child.geometry.boundingBox) {
                    child.geometry.computeBoundingBox();
                  }
                }
              });
              
              // Scale and position the glasses appropriately
              glasses.scale.set(0.1, 0.1, 0.1);
              glasses.position.set(0, 0, -0.3);
              glasses.visible = true;
              
              // Add to scene
              if (sceneRef.current) {
                sceneRef.current.add(glasses);
                glassesRef.current = glasses;
                setIsGlassesLoaded(true);
                setStatus("Glasses model loaded successfully!");
                resolve(glasses);
              }
            },
            (progress) => {
              const percent = (progress.loaded / progress.total * 100).toFixed(0);
              setStatus(`Loading glasses... ${percent}%`);
            },
            (error) => {
              console.error("Error loading glasses model:", error);
              setStatus("Failed to load glasses model");
              
              // Create fallback cube if glasses fail to load
              createFallbackCube();
              reject(error);
            }
          );
        });
      } catch (err) {
        console.error("Error setting up glasses loader:", err);
        createFallbackCube();
        throw err;
      }
    }

    function createFallbackCube() {
      if (!sceneRef.current) return;
      
      console.log("Creating fallback debugging cube");
      
      // Create a more visible debugging cube
      const geometry = new THREE.BoxGeometry(0.1, 0.1, 0.1);
      geometry.computeBoundingSphere();
      geometry.computeBoundingBox();
      
      const material = new THREE.MeshBasicMaterial({ 
        color: 0x00ff00,  // Bright green for visibility
        wireframe: false,
        transparent: true,
        opacity: 0.8
      });
      const cube = new THREE.Mesh(geometry, material);
      
      // Position at origin for initial visibility
      cube.position.set(0, 0, -0.3);
      cube.visible = true;
      
      sceneRef.current.add(cube);
      glassesRef.current = cube;
      setIsGlassesLoaded(true);
      setStatus("Using DEBUG CUBE (bright green)");
      
      console.log("Debug cube created at position:", cube.position);
    }

    async function loadFaceMeshModel() {
      try {
        setStatus("Loading TensorFlow...");
        await tf.ready();
        console.log("TensorFlow ready");
        
        setStatus("Loading MediaPipe FaceMesh model...");
        
        const model = faceLandmarksDetection.SupportedModels.MediaPipeFaceMesh;
        const detectorConfig = {
          runtime: 'tfjs',
          maxFaces: 1,
          refineLandmarks: true
        };
        
        const detector = await faceLandmarksDetection.createDetector(model, detectorConfig);
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
      // NDC: [-1,1]; flip Y because screen Y goes down
      const ndc = new THREE.Vector3(u * 2 - 1, 1 - v * 2, 0.5);
      ndc.unproject(cam);
      const dir = ndc.sub(cam.position).normalize();
      const t = (planeZ - cam.position.z) / dir.z; // intersect ray with Z=planeZ
      return cam.position.clone().add(dir.multiplyScalar(t));
    }

    function getFaceAlignment(landmarks) {
      try {
        // Use more stable landmarks for glasses
        const leftEyeCenter = landmarks[159];  // Left eye center
        const rightEyeCenter = landmarks[386]; // Right eye center
        const noseBridge = landmarks[6];       // Nose bridge
        const noseTip = landmarks[1];          // Nose tip

        // Calculate glasses position (between eyes, slightly above)
        const glassesCenter = {
          x: (leftEyeCenter.x + rightEyeCenter.x) / 2,
          y: (leftEyeCenter.y + rightEyeCenter.y) / 2 + 0.01, // Slightly above eyes
          z: (leftEyeCenter.z + rightEyeCenter.z) / 2 - 0.05
        };

        // CRITICAL FIX: MediaPipe gives PIXEL coordinates, not normalized!
        // Convert from pixel space to normalized space first
        console.log('MediaPipe coordinates (pixels):', glassesCenter); // Debug log
        
        // Convert from pixels to normalized coordinates (0-1)
        const normalizedGlassesCenter = {
          x: glassesCenter.x / VIDEO_WIDTH,   // Convert pixels to 0-1
          y: glassesCenter.y / VIDEO_HEIGHT - 0.02,  // Convert pixels to 0-1
          z: glassesCenter.z / VIDEO_WIDTH    // Z uses same scale as X
        };
        
        console.log('Normalized coordinates:', normalizedGlassesCenter); // Debug log
        
        const u = normalizedGlassesCenter.x;              // if video is mirrored, use (1 - normalizedGlassesCenter.x)
        const v = normalizedGlassesCenter.y;

        const targetZ = 0.0; // or -0.3 to sit a bit “into” the scene; adjust to taste
        const world = uvToWorld(u, v, targetZ);

        const position = { x: world.x, y: world.y, z: world.z };
        
        console.log('Final Three.js position:', position); // Debug log

        // Calculate scale based on eye distance in pixels, then normalize
        const eyeDistancePixels = Math.sqrt(
          Math.pow(rightEyeCenter.x - leftEyeCenter.x, 2) +
          Math.pow(rightEyeCenter.y - leftEyeCenter.y, 2) +
          Math.pow(rightEyeCenter.z - leftEyeCenter.z, 2)
        );
        
        // Convert eye distance to normalized coordinates for consistent scaling
        const eyeDistanceNormalized = eyeDistancePixels / VIDEO_WIDTH;
        
        console.log('Eye distance (pixels):', eyeDistancePixels, 'normalized:', eyeDistanceNormalized); // Debug log
        
        // Much more reasonable scale calculation based on normalized distance
        // Average eye distance is about 0.1-0.15 in normalized coordinates
        const scale = Math.max(0.5, Math.min(3.0, eyeDistanceNormalized * 20));

        // Calculate rotations using normalized coordinates
        const eyeVectorPixels = {
          x: rightEyeCenter.x - leftEyeCenter.x,
          y: rightEyeCenter.y - leftEyeCenter.y
        };

        // Roll (head tilt) - convert to normalized space for calculation
        const roll = -Math.atan2(eyeVectorPixels.y, eyeVectorPixels.x);
        
        // Yaw (head turn) - using nose tip relative to eye center line
        const eyeMidpointPixels = {
          x: (leftEyeCenter.x + rightEyeCenter.x) / 2,
          y: (leftEyeCenter.y + rightEyeCenter.y) / 2
        };
        const noseOffsetPixels = noseTip.x - eyeMidpointPixels.x;
        const yaw = Math.atan2(noseOffsetPixels, eyeDistancePixels) * 1.2;

        // Pitch (head nod) - using nose tip relative to eye level
        const noseOffsetY = noseTip.y - eyeMidpointPixels.y;
        const pitch = Math.atan2(noseOffsetY, eyeDistancePixels * 0.8) - 0.8;

        return {
          position,
          rotation: { pitch, yaw, roll },
          scale
        };

      } catch (err) {
        console.error("Error calculating face alignment:", err);
        return {
          position: { x: 0, y: 0, z: -0.3 },
          rotation: { pitch: 0, yaw: 0, roll: 0 },
          scale: 1
        };
      }
    }

    function updateGlassesAlignment(alignment) {
  if (!glassesRef.current) {
    console.log("No glasses reference found");
    return;
  }

  const { position, rotation, scale } = alignment;

  // Ensure glasses are visible
  glassesRef.current.visible = true;

  // Apply position directly
  glassesRef.current.position.set(position.x, position.y, position.z);

  // Apply rotations directly
  glassesRef.current.rotation.x = rotation.pitch;
  glassesRef.current.rotation.y = rotation.yaw;
  glassesRef.current.rotation.z = rotation.roll;

  // Apply scale with bounds checking
  const clampedScale = Math.max(0.1, Math.min(3.0, scale));
  glassesRef.current.scale.setScalar(clampedScale);

  // Force update matrix
  glassesRef.current.updateMatrix();
  glassesRef.current.updateMatrixWorld(true);

  // Update debug info
  setDebugInfo(
    `Pos: (${position.x.toFixed(2)}, ${position.y.toFixed(2)}, ${position.z.toFixed(
      2
    )}) Scale: ${clampedScale.toFixed(2)}`
  );

  // Check if glasses are within camera frustum (for debugging)
  if (cameraRef.current && glassesRef.current.geometry) {
    try {
      const frustum = new THREE.Frustum();
      const matrix = new THREE.Matrix4().multiplyMatrices(
        cameraRef.current.projectionMatrix,
        cameraRef.current.matrixWorldInverse
      );
      frustum.setFromProjectionMatrix(matrix);

      if (!glassesRef.current.geometry.boundingSphere) {
        glassesRef.current.geometry.computeBoundingSphere();
      }

      const inFrustum = frustum.intersectsObject(glassesRef.current);
      if (!inFrustum) {
        console.warn("Glasses outside camera frustum!");
      }
    } catch (err) {
      console.warn("Frustum check error:", err.message);
    }
  }

  // Render the scene
  if (rendererRef.current && sceneRef.current && cameraRef.current) {
    rendererRef.current.render(sceneRef.current, cameraRef.current);
  }
}

    function getSimulatedAlignment() {
      const time = Date.now() * 0.001;
      return {
        position: { x: 0, y: 0, z: -0.3 },
        rotation: {
          pitch: Math.sin(time * 0.7) * 0.1,
          yaw: Math.sin(time * 0.5) * 0.2,
          roll: Math.sin(time * 0.3) * 0.1
        },
        scale: 1.0
      };
    }

    async function detectLoop() {
      if (!isRunning) return;
      
      let alignment = {
        position: { x: 0, y: 0, z: -0.3 },
        rotation: { pitch: 0, yaw: 0, roll: 0 },
        scale: 1.0
      };
      
      try {
        if (detectorRef.current && videoRef.current && videoRef.current.readyState === 4) {
          const predictions = await detectorRef.current.estimateFaces(videoRef.current, {
            flipHorizontal: false
          });
          
          if (predictions.length > 0) {
            const face = predictions[0];
            if (face.keypoints && face.keypoints.length > 400) {
              alignment = getFaceAlignment(face.keypoints);
              setStatus(`👓 Glasses aligned! Tracking ${predictions.length} face(s)`);
            }
          } else {
            setStatus("👋 No face detected - show your face to the camera");
            alignment = {
              position: { x: 0, y: 0, z: -0.3 },
              rotation: { pitch: 0, yaw: 0, roll: 0 },
              scale: 2.5
            };
          }
        } else {
          alignment = getSimulatedAlignment();
          if (!detectorRef.current) {
            setStatus("🤖 Simulation mode (model not loaded)");
          }
        }
      } catch (err) {
        console.error("Detection error:", err);
        alignment = getSimulatedAlignment();
        setStatus("⚠️ Detection error - using simulation");
      }
      
      updateGlassesAlignment(alignment);
      animationRef.current = requestAnimationFrame(detectLoop);
    }

    function testGlassesVisibility() {
      if (glassesRef.current) {
        // Force glasses to a known visible position
        glassesRef.current.position.set(0, 0, -0.3);
        glassesRef.current.rotation.set(0, 0, 0);
        glassesRef.current.scale.setScalar(1);
        glassesRef.current.visible = true;
        
        console.log("Forced glasses to visible position for testing");
        
        if (rendererRef.current && sceneRef.current && cameraRef.current) {
          rendererRef.current.render(sceneRef.current, cameraRef.current);
        }
      }
    }

    async function init() {
      try {
        await initCamera();
        await initThreeJS();
        
        // Start animation loop immediately with simulation
        detectLoop();
        
        // Load glasses model
        try {
          await loadGlassesModel();
          // Test visibility after loading
          setTimeout(testGlassesVisibility, 1000);
        } catch (err) {
          console.log("Glasses model failed, using fallback");
        }
        
        // Load face detection model in background
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
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      if (videoRef.current?.srcObject) {
        videoRef.current.srcObject.getTracks().forEach(track => track.stop());
      }
      if (rendererRef.current) {
        rendererRef.current.dispose();
      }
    };
  }, []);

  return (
    <div style={{ position: "relative", width: VIDEO_WIDTH, height: VIDEO_HEIGHT, backgroundColor: "#000" }}>
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
          objectFit: "cover"
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
          pointerEvents: "none"
        }} 
      />
      <div style={{
        position: "absolute",
        top: 10,
        left: 10,
        color: isGlassesLoaded ? (isModelLoaded ? "lime" : "yellow") : "orange",
        backgroundColor: "rgba(0,0,0,0.8)",
        padding: "8px",
        borderRadius: "5px",
        fontSize: "11px",
        zIndex: 2,
        fontFamily: "monospace",
        maxWidth: "300px"
      }}>
        <div>🕶️ Glasses: {isGlassesLoaded ? "✅" : "⏳"}</div>
        <div>🎯 Face Tracking: {isModelLoaded ? "✅" : "⏳"}</div>
        <div>Status: {status}</div>
        {debugInfo && <div>Debug: {debugInfo}</div>}
      </div>
      
      {/* Debug controls */}
      <div style={{
        position: "absolute",
        bottom: 10,
        right: 10,
        zIndex: 3
      }}>
        <button 
          onClick={() => {
            if (glassesRef.current) {
              glassesRef.current.position.set(0, 0, -0.3);
              glassesRef.current.rotation.set(0, 0, 0);
              glassesRef.current.scale.setScalar(1);
              glassesRef.current.visible = true;
              console.log("Reset glasses position");
            }
          }}
          style={{
            padding: "5px 10px",
            fontSize: "12px",
            backgroundColor: "rgba(0,0,0,0.8)",
            color: "white",
            border: "1px solid #444",
            borderRadius: "3px",
            cursor: "pointer"
          }}
        >
          Reset Glasses
        </button>
      </div>
    </div>
  );
}