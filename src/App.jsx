import React, { useState } from "react";
import FaceMeshViewer from "./FaceMeshViewer";

export default function App() {
  const [isModelLoaded, setIsModelLoaded] = useState(false);
  const [isGlassesLoaded, setIsGlassesLoaded] = useState(false);
  const [debugInfo, setDebugInfo] = useState("");
  const [status, setStatus] = useState("Initializing...");

  return (
    <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        height: "100vh",
        width: "100vw",
        background: "#222",
      }}>
      <FaceMeshViewer setDebugInfo={setDebugInfo} setIsGlassesLoaded={setIsGlassesLoaded} setIsModelLoaded={setIsModelLoaded} setStatus={setStatus} />
      <div
        style={{
          position: "absolute",
          top: 10,
          left: 10,
          color: isGlassesLoaded
            ? isModelLoaded
              ? "lime"
              : "yellow"
            : "orange",
          backgroundColor: "rgba(0,0,0,0.5)",
          padding: "8px",
          borderRadius: "5px",
          fontSize: "8px",
          zIndex: 2,
          fontFamily: "monospace",
          maxWidth: "300px",
        }}
      >
        <div>🕶️ Glasses: {isGlassesLoaded ? "✅" : "⏳"}</div>
        <div>🎯 Face Tracking: {isModelLoaded ? "✅" : "⏳"}</div>
        <div>🚫 Occlusion: ✅ Active</div>
        <div>Status: {status}</div>
        {debugInfo && <div>Debug: {debugInfo}</div>}
      </div>
    </div>
  );
}
