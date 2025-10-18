import React, { useState, useEffect, useCallback, useRef } from "react";
import SpeechRecognition, {
  useSpeechRecognition,
} from "react-speech-recognition";
import { Mic, Square } from "lucide-react";

// --- Configuration ---
// IMPORTANT: PASTE YOUR GEMINI API KEY HERE
const GEMINI_API_KEY = "AIzaSyDhqixS_ZbFEIosKGIhJH-r5ufL06L3tWw";
const SCREENSHOT_INTERVAL = 1500; // ms between screenshots
const SCREENSHOT_COUNT = 3; // Number of screenshots to take
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${GEMINI_API_KEY}`;

export default function GeminiAgentController() {
  const [isRecording, setIsRecording] = useState(false);
  const [agentStatus, setAgentStatus] = useState("Idle");
  const [aiResponse, setAiResponse] = useState("");
  const screenshotsRef = useRef([]);

  const { transcript, resetTranscript, browserSupportsSpeechRecognition } =
    useSpeechRecognition();

  const captureScreen = useCallback(async () => {
    try {
      const { default: html2canvas } = await import("html2canvas");
      const canvas = await html2canvas(document.body, {
        useCORS: true,
        scale: 0.5,
        logging: false,
      });
      return canvas.toDataURL("image/jpeg", 0.6).split(",")[1];
    } catch (error) {
      console.error("Error capturing screen:", error);
      return null;
    }
  }, []);

  const processRequest = useCallback(async (text, images) => {
    if (!text && images.length === 0) {
      setAgentStatus("Nothing to process.");
      return;
    }
    if (GEMINI_API_KEY === "YOUR_API_KEY_HERE") {
      setAgentStatus("Error");
      setAiResponse("Please add your Gemini API key to the App.js file.");
      speak("Please add your Gemini API key to the App.js file.");
      return;
    }
    setAgentStatus("Thinking...");
    setAiResponse("");

    const requestBody = {
      contents: [
        {
          parts: [
            {
              text: `You are a friendly and helpful fashion assistant for a virtual try-on application called 'AR-Wardrobe'. The user can try on different accessories like glasses, earrings, necklaces, and t-shirts. Based on the user's request and the provided screenshots of the app, provide a concise and helpful response. The user said: "${text}"`,
            },
            ...images.map((img) => ({
              inline_data: { mime_type: "image/jpeg", data: img },
            })),
          ],
        },
      ],
    };

    try {
      const response = await fetch(GEMINI_API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });
      if (!response.ok) throw new Error(`API Error: ${response.statusText}`);
      const data = await response.json();
      const responseText = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (responseText) {
        setAiResponse(responseText);
        speak(responseText);
      } else {
        throw new Error("Invalid response from API.");
      }
    } catch (error) {
      console.error("Gemini API request failed:", error);
      setAgentStatus("Error");
      setAiResponse(`Sorry, an error occurred: ${error.message}`);
    }
  }, []);

  const speak = (text) => {
    if ("speechSynthesis" in window) {
      speechSynthesis.cancel(); // Clear the queue
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.onstart = () => setAgentStatus("Speaking...");
      utterance.onend = () => setAgentStatus("Idle");
      speechSynthesis.speak(utterance);
    }
  };

  useEffect(() => {
    let intervalId;
    if (isRecording) {
      screenshotsRef.current = [];
      intervalId = setInterval(async () => {
        if (screenshotsRef.current.length < SCREENSHOT_COUNT) {
          const screenshot = await captureScreen();
          if (screenshot) {
            screenshotsRef.current.push(screenshot);
            setAgentStatus(
              `Captured ${screenshotsRef.current.length}/${SCREENSHOT_COUNT} images...`
            );
          }
        } else {
          clearInterval(intervalId);
        }
      }, SCREENSHOT_INTERVAL);
    }
    return () => clearInterval(intervalId);
  }, [isRecording, captureScreen]);

  const handleStart = () => {
    if (!browserSupportsSpeechRecognition) {
      setAgentStatus("Speech recognition not supported.");
      return;
    }
    setIsRecording(true);
    resetTranscript();
    setAiResponse("");
    SpeechRecognition.startListening({ continuous: true });
    setAgentStatus("Listening...");
  };

  const handleStop = () => {
    setIsRecording(false);
    SpeechRecognition.stopListening();
    setAgentStatus("Processing...");
    setTimeout(() => processRequest(transcript, screenshotsRef.current), 500);
  };

  return (
    <div style={styles.agentContainer} className="gemini-agent">
      <div style={styles.agentHeader}>
        <h3 style={styles.sectionTitle}>AI Assistant</h3>
        <p style={styles.agentStatus(isRecording)}>
          {agentStatus}
        </p>
      </div>
      <button
        onClick={isRecording ? handleStop : handleStart}
        style={styles.micButton(isRecording)}
      >
        {isRecording ? <Square size={24} /> : <Mic size={24} />}
      </button>
      <div style={styles.transcriptionContainer}>
        <p style={styles.transcriptionText}>
          <strong>You said:</strong> {transcript || "..."}
        </p>
        <p style={styles.transcriptionText}>
          <strong>Gemini says:</strong> {aiResponse || "..."}
        </p>
      </div>
    </div>
  );
}

// --- Styles ---
const styles = {
  agentContainer: {
    marginTop: "25px",
    paddingTop: "20px",
    borderTop: "1px solid #eee",
  },
  agentHeader: {
    textAlign: "center",
    marginBottom: "15px",
  },
  sectionTitle: {
    margin: "0 0 8px 0",
    fontSize: "16px",
    fontWeight: "600",
    color: "#555",
  },
  agentStatus: (isRecording) => ({
    margin: 0,
    fontSize: "13px",
    color: isRecording ? "#E74C3C" : "#666",
    fontWeight: "500",
    minHeight: "18px",
    animation: isRecording ? "pulse 1.5s infinite" : "none",
  }),
  micButton: (isRecording) => ({
    width: "60px",
    height: "60px",
    borderRadius: "50%",
    border: "none",
    backgroundColor: isRecording ? "#E74C3C" : "#3498DB",
    color: "white",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    margin: "0 auto 15px auto",
    transition: "background-color 0.3s",
  }),
  transcriptionContainer: {
    backgroundColor: "rgba(255,255,255,0.1)",
    padding: "10px 15px",
    borderRadius: "10px",
    textAlign: "left",
    minHeight: "80px",
    backgroundColor: "#f8f9fa",
  },
  transcriptionText: {
    margin: "8px 0",
    fontSize: "13px",
    color: "#444",
  },
};
