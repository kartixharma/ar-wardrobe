import React, { useState } from "react";
import FaceMeshViewer from "./FaceMeshViewer";
import GeminiAgentController from "./GeminiAgentController";


// Accessory type definitions with their specific configurations
const ACCESSORY_TYPES = {
  GLASSES: 'glasses',
  EARRINGS: 'earrings',
  NECKLACE: 'necklace',
  T_SHIRT: 't-shirt',
};

// Define available accessories with metadata
const ACCESSORIES = [
  // Glasses
  { id: 'aviator', name: "Aviator", path: "/models/glasses1.glb", type: ACCESSORY_TYPES.GLASSES, category: "Glasses" },
  { id: 'stylish', name: "Stylish", path: "/models/glasses2.glb", type: ACCESSORY_TYPES.GLASSES, category: "Glasses" },
  { id: 'round', name: "Round", path: "/models/glasses3.glb", type: ACCESSORY_TYPES.GLASSES, category: "Glasses" },
  
  // Earrings
  { id: 'sapphire', name: "Sapphire", path: "/models/sapphire_earring.glb", type: ACCESSORY_TYPES.EARRINGS, category: "Earrings" },
  { id: 'golden', name: "Golden", path: "/models/golden_earring.glb", type: ACCESSORY_TYPES.EARRINGS, category: "Earrings" },
  { id: 'louboutin', name: "Louboutin ", path: "/models/earrings2.glb", type: ACCESSORY_TYPES.EARRINGS, category: "Earrings" },
  { id: 'amesthys', name: "Amesthys  ", path: "/models/earrings3.glb", type: ACCESSORY_TYPES.EARRINGS, category: "Earrings" },
  { id: 'jhumka', name: "Jhumka  ", path: "/models/earrings4.glb", type: ACCESSORY_TYPES.EARRINGS, category: "Earrings" },

  // Necklaces
  { id: 'pearl-necklace', name: "Pearls", path: "/models/gemstone_necklace.glb", type: ACCESSORY_TYPES.NECKLACE, category: "Necklaces" },
  { id: 'elegant-jewel', name: "Elegant Jewel", path: "/models/necklace2.glb", type: ACCESSORY_TYPES.NECKLACE, category: "Necklaces" },
  { id: 'orbit-pendant', name: "Orbit Pendant", path: "/models/necklace3.glb", type: ACCESSORY_TYPES.NECKLACE, category: "Necklaces" },

  // T-Shirts
  { id: 'classic-tshirt', name: "Classic Tee", path: "/models/tshirt_with_etecet.glb", type: ACCESSORY_TYPES.T_SHIRT, category: "T-Shirts" },
//   { id: 'diamond-pendant', name: "Pendant", path: "/models/diamond_pendant.glb", type: ACCESSORY_TYPES.NECKLACE, category: "Necklaces" },
];

export default function App() {
  const [isModelLoaded, setIsModelLoaded] = useState(false);
  const [isAccessoryLoaded, setIsAccessoryLoaded] = useState(false);
  const [debugInfo, setDebugInfo] = useState("");
  const [status, setStatus] = useState("Initializing...");
  const [selectedAccessory, setSelectedAccessory] = useState(ACCESSORIES[2]); // Default to Round glasses
  const [activeCategory, setActiveCategory] = useState("Glasses");

  // Group accessories by category
  const accessoriesByCategory = ACCESSORIES.reduce((acc, accessory) => {
    if (!acc[accessory.category]) {
      acc[accessory.category] = [];
    }
    acc[accessory.category].push(accessory);
    return acc;
  }, {});

  const categories = Object.keys(accessoriesByCategory);

  return (
    <div style={styles.container}>
      {/* Main viewer */}
      <div style={{ position: "relative" }}>
        <FaceMeshViewer
          setDebugInfo={setDebugInfo}
          setIsAccessoryLoaded={setIsAccessoryLoaded}
          setIsModelLoaded={setIsModelLoaded}
          setStatus={setStatus}
          accessory={selectedAccessory}
        />
        {/* <BodyMeshViewer /> */}
        
        {/* Info overlay */}
        <div style={styles.infoOverlay}>
          <div>👁️ Face Tracking: {isModelLoaded ? "✅ Active" : "⏳ Loading..."}</div>
          <div>🎨 {selectedAccessory.category}: {isAccessoryLoaded ? "✅ Loaded" : "⏳ Loading..."}</div>
          <div>🎯 Type: {selectedAccessory.type}</div>
          <div style={{ wordBreak: 'break-word', marginTop: '8px' }}>Status: {status}</div>
          {debugInfo && <div style={{ marginTop: '8px', fontSize: '9px' }}>Debug: {debugInfo}</div>}
        </div>
      </div>

      {/* Control panel */}
      <div style={styles.controlPanel}>
        <h2 style={styles.title}>Virtual Try-On</h2>
        
        {/* Category selector */}
        <div style={styles.categorySection}>
          <h3 style={styles.sectionTitle}>Select Category</h3>
          <div style={styles.categoryButtons}>
            {categories.map((category) => (
              <button
                key={category}
                onClick={() => {
                  setActiveCategory(category);
                  // Auto-select first item in new category
                  const firstInCategory = accessoriesByCategory[category][0];
                  setSelectedAccessory(firstInCategory);
                }}
                style={styles.categoryButton(activeCategory === category)}
              >
                {category}
              </button>
            ))}
          </div>
        </div>

        {/* Accessory selector */}
        <div style={styles.accessorySection}>
          <h3 style={styles.sectionTitle}>{activeCategory}</h3>
          <div style={styles.accessoryGrid}>
            {accessoriesByCategory[activeCategory]?.map((accessory) => (
              <button
                key={accessory.id}
                onClick={() => setSelectedAccessory(accessory)}
                style={styles.accessoryButton(selectedAccessory.id === accessory.id)}
              >
                {accessory.name}
              </button>
            ))}
          </div>
        </div>

        {/* Instructions */}
        <div style={styles.instructions}>
          <p style={styles.instructionText}>
            📸 Position your face in the camera frame
          </p>
          <p style={styles.instructionText}>
            💡 Try different {activeCategory.toLowerCase()} to see what suits you!
          </p>
          <GeminiAgentController />
        </div>
      </div>
    </div>
  );
}

// --- Styles ---
const styles = {
  container: {
    display: "flex",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    height: "100vh",
    width: "100vw",
    background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
    gap: "30px",
    fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
    padding: "20px",
  },
  infoOverlay: {
    position: "absolute",
    top: 10,
    left: 10,
    color: "white",
    backgroundColor: "rgba(0,0,0,0.6)",
    padding: "12px",
    borderRadius: "10px",
    fontSize: "8px",
    zIndex: 2,
    fontFamily: "monospace",
    backdropFilter: "blur(5px)",
  },
  controlPanel: {
    backgroundColor: "rgba(255,255,255,0.95)",
    padding: "30px",
    borderRadius: "20px",
    maxWidth: "400px",
    minWidth: "320px",
    boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
  },
  title: {
    margin: "0 0 25px 0",
    fontSize: "28px",
    fontWeight: "700",
    color: "#333",
    textAlign: "center",
  },
  categorySection: {
    marginBottom: "25px",
  },
  sectionTitle: {
    margin: "0 0 12px 0",
    fontSize: "16px",
    fontWeight: "600",
    color: "#555",
  },
  categoryButtons: {
    display: "flex",
    gap: "10px",
    flexWrap: "wrap",
  },
  categoryButton: (isActive) => ({
    flex: "1",
    padding: "12px 20px",
    fontSize: "15px",
    cursor: "pointer",
    backgroundColor: isActive ? "#667eea" : "#f5f5f5",
    color: isActive ? "white" : "#333",
    border: "none",
    borderRadius: "10px",
    fontWeight: isActive ? "600" : "500",
    transition: "all 0.3s ease",
    boxShadow: isActive ? "0 4px 12px rgba(102,126,234,0.4)" : "none",
  }),
  accessorySection: {
    marginBottom: "25px",
  },
  accessoryGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "10px",
  },
  accessoryButton: (isActive) => ({
    padding: "16px 12px",
    fontSize: "14px",
    cursor: "pointer",
    backgroundColor: isActive ? "#4CAF50" : "#fff",
    color: isActive ? "white" : "#333",
    border: isActive ? "2px solid #4CAF50" : "2px solid #ddd",
    borderRadius: "12px",
    fontWeight: isActive ? "600" : "500",
    transition: "all 0.3s ease",
    boxShadow: isActive ? "0 4px 12px rgba(76,175,80,0.3)" : "0 2px 4px rgba(0,0,0,0.1)",
  }),
  instructions: {
    backgroundColor: "#f8f9fa",
    padding: "15px",
    borderRadius: "10px",
    marginTop: "20px",
  },
  instructionText: {
    margin: "5px 0",
    fontSize: "13px",
    color: "#666",
  },
};