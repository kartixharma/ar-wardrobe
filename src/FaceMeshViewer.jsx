import React, { useEffect, useRef } from "react";
import * as faceLandmarksDetection from "@tensorflow-models/face-landmarks-detection";
import "@tensorflow/tfjs-backend-webgl";

export default function FaceMeshViewer() {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);

  useEffect(() => {
    let detector;

    async function initCamera() {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480 },
        audio: false
      });
      videoRef.current.srcObject = stream;
      return new Promise((resolve) => {
        videoRef.current.onloadedmetadata = () => resolve();
      });
    }

    async function initDetector() {
      await initCamera();
      await videoRef.current.play();

      const model = faceLandmarksDetection.SupportedModels.MediaPipeFaceMesh;
      const detectorConfig = {
        runtime: "mediapipe",
        solutionPath: "https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh"
      };

      detector = await faceLandmarksDetection.createDetector(model, detectorConfig);
      detectLoop();
    }

    async function detectLoop() {
      if (!detector) return;
      const faces = await detector.estimateFaces(videoRef.current);

      const ctx = canvasRef.current.getContext("2d");
      ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
      ctx.drawImage(videoRef.current, 0, 0, canvasRef.current.width, canvasRef.current.height);

      ctx.strokeStyle = "lime";
      ctx.lineWidth = 1;

      faces.forEach(face => {
        face.keypoints.forEach(point => {
          ctx.beginPath();
          ctx.arc(point.x, point.y, 1, 0, 2 * Math.PI);
          ctx.stroke();
        });
      });

      requestAnimationFrame(detectLoop);
    }

    initDetector();

    return () => {
      if (videoRef.current?.srcObject) {
        videoRef.current.srcObject.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  return (
    <div style={{ position: "relative" }}>
      <video
        ref={videoRef}
        style={{ display: "none" }}
      />
      <canvas
        ref={canvasRef}
        width={640}
        height={480}
        style={{ position: "absolute", top: 0, left: 0 }}
      />
    </div>
  );
}
