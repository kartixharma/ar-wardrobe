import React, { useState } from "react";
import FaceMeshViewer from "./FaceMeshViewer";
import GeminiAgentController from "./GeminiAgentController";

// Define the available glasses models
const GLASSES_OPTIONS = [
	{ name: "Aviator", path: "/models/glasses1.glb" },
	{ name: "Stylish", path: "/models/glasses2.glb" },
	{ name: "Round", path: "/models/glasses3.glb" },
];

export default function App() {
	const [isModelLoaded, setIsModelLoaded] = useState(false);
	const [isGlassesLoaded, setIsGlassesLoaded] = useState(false);
	const [debugInfo, setDebugInfo] = useState("");
	const [status, setStatus] = useState("Initializing...");
	const [selectedGlasses, setSelectedGlasses] = useState(GLASSES_OPTIONS[2].path);

	return (
		<div style={{
			display: "flex",
			flexDirection: "row",
			alignItems: "center",
			justifyContent: "center",
			height: "100vh",
			width: "100vw",
			background: "#222",
			gap: "20px",
			fontFamily: "sans-serif"
		}}>
			<div style={{ position: "relative" }}>
				<FaceMeshViewer
					setDebugInfo={setDebugInfo}
					setIsGlassesLoaded={setIsGlassesLoaded}
					setIsModelLoaded={setIsModelLoaded}
					setStatus={setStatus}
					glassesModelPath={selectedGlasses}
				/>
			</div>
			<div style={styles.infoOverlay}>
				<div>🕶️ Glasses: {isGlassesLoaded ? "✅ Loaded" : "⏳ Loading..."}</div>
				<div>🎯 Face Tracking: {isModelLoaded ? "✅ Active" : "⏳ Loading..."}</div>
				<div>🚫 Occlusion: ✅ Active</div>
				<div style={{ wordBreak: 'break-word' }}>Status: {status}</div>
				{debugInfo && <div>Debug: {debugInfo}</div>}
			</div>
			<div style={{ flexDirection: "column", display: "flex", alignItems: "center", gap: "10px" }}>
				{GLASSES_OPTIONS.map((option) => (
					<button
						key={option.path}
						onClick={() => setSelectedGlasses(option.path)}
						style={styles.button(selectedGlasses === option.path)}
					>
						{option.name}
					</button>
				))}
			</div>
			<GeminiAgentController />
		</div>
	);
}

// --- Styles ---
const styles = {
	infoOverlay: { position: "absolute", top: 10, left: 10, color: "white", backgroundColor: "rgba(0,0,0,0.6)", padding: "10px", borderRadius: "8px", fontSize: "10px", zIndex: 2, fontFamily: "monospace" },
	button: (isActive) => ({ margin: "0 5px", padding: "12px 20px", fontSize: "16px", cursor: "pointer", backgroundColor: isActive ? "#4CAF50" : "#f1f1f1", color: isActive ? "white" : "black", border: "none", borderRadius: "8px", fontWeight: "bold" }),
	agentContainer: { backgroundColor: "rgba(0,0,0,0.3)", padding: "20px", borderRadius: "12px", textAlign: "center", color: "white", width: "clamp(300px, 80%, 720px)" },
	agentStatus: { margin: 0, marginBottom: "15px", fontSize: "16px" },
	micButton: (isRecording) => ({ width: "60px", height: "60px", borderRadius: "50%", border: "none", backgroundColor: isRecording ? "#E74C3C" : "#3498DB", color: "white", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", margin: "0 auto 15px auto", transition: "background-color 0.3s" }),
	transcriptionContainer: { backgroundColor: "rgba(255,255,255,0.1)", padding: "10px 15px", borderRadius: "8px", textAlign: "left", minHeight: "80px" }
};
