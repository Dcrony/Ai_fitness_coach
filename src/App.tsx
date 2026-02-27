import { useEffect, useRef, useState } from "react";
import "./App.css";
import { FilesetResolver, PoseLandmarker } from "@mediapipe/tasks-vision";
import { getCoachingAdvice } from "./geminiCoach";

const speak = (text: string) => {
  if ("speechSynthesis" in window) {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.1;
    utterance.pitch = 1;
    window.speechSynthesis.speak(utterance);
  }
};

function App() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isActive, setIsActive] = useState(false);
  const [feedback, setFeedback] = useState(
    "Click Start to begin your workout!",
  );
  const [repCount, setRepCount] = useState(0);
  const [poseLandmarker, setPoseLandmarker] = useState<any>(null);
  const lastVideoTime = useRef(-1);
  const animationFrame = useRef<number>();
  const [squatState, setSquatState] = useState<"up" | "down" | "middle">("up");
  const squatCount = useRef(0);
  const [aiCoachEnabled, setAiCoachEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [debugInfo, setDebugInfo] = useState("Waiting for pose...");

  useEffect(() => {
    loadPoseModel();
    return () => {
      if (animationFrame.current) cancelAnimationFrame(animationFrame.current);
    };
  }, []);

  useEffect(() => {
    if (isActive) startCamera();
    else stopCamera();
    return () => {
      if (animationFrame.current) cancelAnimationFrame(animationFrame.current);
    };
  }, [isActive]);

  const loadPoseModel = async () => {
    setLoading(true);
    try {
      const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm",
      );
      const landmarker = await PoseLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: `https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task`,
          delegate: "GPU",
        },
        runningMode: "VIDEO",
        numPoses: 1,
      });
      setPoseLandmarker(landmarker);
      console.log("Pose model loaded!");
    } catch (err) {
      setFeedback("Error loading AI model.");
    } finally {
      setLoading(false);
    }
  };

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: "user" },
        audio: false,
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadeddata = () => detectPose();
      }
      setFeedback("Stand back, make sure your full body is visible!");
      speak("Get ready");
    } catch (err) {
      setFeedback("Error accessing camera.");
    }
  };

  const stopCamera = () => {
    if (videoRef.current?.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach((track) => track.stop());
      videoRef.current.srcObject = null;
    }
    if (animationFrame.current) cancelAnimationFrame(animationFrame.current);
    setFeedback("Workout paused.");
    setDebugInfo("Camera off");
  };

  const detectPose = () => {
    if (!videoRef.current || !canvasRef.current || !poseLandmarker) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d")!;

    if (canvas.width !== video.videoWidth) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
    }

    if (video.currentTime !== lastVideoTime.current) {
      lastVideoTime.current = video.currentTime;
      const results = poseLandmarker.detectForVideo(video, performance.now());
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      if (results.landmarks?.length > 0) {
        const landmarks = results.landmarks[0];
        drawSkeleton(ctx, landmarks);
        analyzeSquat(landmarks);
      } else {
        setDebugInfo("No pose detected - step back!");
      }
    }
    animationFrame.current = requestAnimationFrame(detectPose);
  };

  const drawSkeleton = (ctx: CanvasRenderingContext2D, landmarks: any[]) => {
    landmarks.forEach((landmark: any, index: number) => {
      const x = landmark.x * ctx.canvas.width;
      const y = landmark.y * ctx.canvas.height;

      ctx.beginPath();
      ctx.arc(x, y, 8, 0, 2 * Math.PI);

      if ([23, 24, 25, 26].includes(index)) {
        ctx.fillStyle = "#ff0066";
      } else {
        ctx.fillStyle = "#00d9ff";
      }

      ctx.fill();
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.fillStyle = "#fff";
      ctx.font = "12px Arial";
      ctx.fillText(index.toString(), x + 10, y);
    });

    const connections = [
      [11, 13], [13, 15], [12, 14], [14, 16],
      [11, 12], [11, 23], [12, 24],
      [23, 25], [25, 27], [24, 26], [26, 28],
      [23, 24],
    ];

    ctx.strokeStyle = "#00d9ff";
    ctx.lineWidth = 3;

    connections.forEach(([i, j]: number[]) => {
      const start = landmarks[i];
      const end = landmarks[j];
      ctx.beginPath();
      ctx.moveTo(start.x * ctx.canvas.width, start.y * ctx.canvas.height);
      ctx.lineTo(end.x * ctx.canvas.width, end.y * ctx.canvas.height);
      ctx.stroke();
    });
  };

  const calculateKneeAngle = (hip: any, knee: any, ankle: any) => {
    const radians =
      Math.atan2(ankle.y - knee.y, ankle.x - knee.x) -
      Math.atan2(hip.y - knee.y, hip.x - knee.x);
    let angle = Math.abs((radians * 180.0) / Math.PI);
    if (angle > 180) angle = 360 - angle;
    return angle;
  };

  const analyzeSquat = (landmarks: any[]) => {
    const leftHip = landmarks[23];
    const leftKnee = landmarks[25];
    const leftAnkle = landmarks[27];
    const rightHip = landmarks[24];
    const rightKnee = landmarks[26];
    const rightAnkle = landmarks[28];

    if (
      !leftHip ||
      !leftKnee ||
      !leftAnkle ||
      !rightHip ||
      !rightKnee ||
      !rightAnkle
    ) {
      setDebugInfo("Step back! Full body not visible");
      return;
    }

    const leftKneeAngle = calculateKneeAngle(leftHip, leftKnee, leftAnkle);
    const rightKneeAngle = calculateKneeAngle(rightHip, rightKnee, rightAnkle);
    const avgKneeAngle = (leftKneeAngle + rightKneeAngle) / 2;

    setDebugInfo(
      `Knee angle: ${Math.round(avgKneeAngle)}° | State: ${squatState}`,
    );

    if (avgKneeAngle < 110 && squatState !== "down") {
      setSquatState("down");
      setFeedback("Good depth! Push up through heels!");
      speak("Good depth");
    } else if (avgKneeAngle > 150 && squatState === "down") {
      setSquatState("up");
      squatCount.current += 1;
      setRepCount(squatCount.current);

      let message = "";

      if (squatCount.current % 5 === 0) {
        message = `Amazing! ${squatCount.current} reps! 🔥`;
      } else if (squatCount.current % 3 === 0 && aiCoachEnabled) {
        getCoachingAdvice(squatCount.current).then((advice) => {
          setFeedback(advice);
          speak(advice);
        });
        return;
      } else {
        const encouragements = [
          "Nice rep!", "Strong!", "Keep it up!", "Powerful!",
          "Great form!", "Crushing it!", "One more!", "Perfect!",
        ];
        message =
          encouragements[Math.floor(Math.random() * encouragements.length)];
      }

      setFeedback(`${message} Total: ${squatCount.current}`);
      speak(message);
    } else if (avgKneeAngle > 110 && avgKneeAngle < 150) {
      if (squatState === "up") {
        setDebugInfo(`Bending... ${Math.round(avgKneeAngle)}°`);
      } else {
        setDebugInfo(`Extending... ${Math.round(avgKneeAngle)}°`);
      }
    }
  };

  if (loading) {
    return <div className="loading">Loading AI Models...</div>;
  }

  return (
    <div className="app">
      <h1>🏋️ AI Fitness Coach</h1>

      <div className="main-layout">
        {/* LEFT SIDE - Camera */}
        <div className="left-panel">
          <div className="video-container">
            <video ref={videoRef} autoPlay playsInline muted />
            <canvas ref={canvasRef} className="overlay" />
          </div>
          
          <div className="debug-panel">
            <small>{debugInfo}</small>
          </div>
        </div>

        {/* RIGHT SIDE - Stats & Controls */}
        <div className="right-panel">
          <div className="stats-container">
            <div className="stat-card reps-card">
              <span className="stat-label">Reps</span>
              <span className="stat-value">{repCount}</span>
            </div>
            
            <div className="stat-card feedback-card">
              <span className="stat-label">Coach Says</span>
              <span className="stat-value">{feedback}</span>
            </div>
          </div>

          <button
            className={`start-btn ${isActive ? "active" : ""}`}
            onClick={() => setIsActive(!isActive)}
          >
            {isActive ? "⏹ Stop Workout" : "▶️ Start Workout"}
          </button>

          <div className="checkbox-container">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={aiCoachEnabled}
                onChange={(e) => setAiCoachEnabled(e.target.checked)}
              />
              <span>🤖 Enable AI Coach (Gemini)</span>
            </label>
          </div>

          
        </div>
      </div>
      <div className="instructions">
            <p>💡 <strong>How to use:</strong></p>
            <ul>
              <li>Stand 6-8 feet back from camera</li>
              <li>Make sure your full body is visible</li>
              <li>Squat down until thighs are parallel to ground</li>
              <li>Stand up fully between reps</li>
            </ul>
          </div>
    </div>
  );
}

export default App;