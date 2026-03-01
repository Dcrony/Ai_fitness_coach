import { useEffect, useRef, useState } from "react"
import "./App.css"
import { FilesetResolver, PoseLandmarker } from "@mediapipe/tasks-vision"
import Vapi from "@vapi-ai/web"

// Initialize Vapi only if key exists
const vapiKey = import.meta.env.VITE_VAPI_PUBLIC_KEY
const vapi = vapiKey ? new Vapi(vapiKey) : null

const speak = (text: string) => {
  if ("speechSynthesis" in window) {
    window.speechSynthesis.cancel()
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.rate = 1.1
    utterance.pitch = 1
    window.speechSynthesis.speak(utterance)
  }
}

function App() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [isActive, setIsActive] = useState(false)
  const [feedback, setFeedback] = useState("Click Start to begin your workout!")
  const [repCount, setRepCount] = useState(0)
  const [poseLandmarker, setPoseLandmarker] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [debugInfo, setDebugInfo] = useState("Loading AI...")
  const [isCallActive, setIsCallActive] = useState(false)
  const [coachSpeaking, setCoachSpeaking] = useState(false)
  const [vapiError, setVapiError] = useState(false)
  const [squatState, setSquatState] = useState<"up" | "down" | "middle">("up")
  
  const squatCount = useRef(0)
  const lastVideoTime = useRef(-1)
  const animationFrame = useRef<number | null>(null)
  const lastRepTime = useRef(0)
  const updateInterval = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    loadPoseModel()
    if (vapi) setupVapiListeners()
    return () => {
      if (animationFrame.current) cancelAnimationFrame(animationFrame.current)
      if (updateInterval.current) clearInterval(updateInterval.current)
    }
  }, [])

  useEffect(() => {
    if (isActive) startWorkout()
    else stopWorkout()
    return () => {
      if (animationFrame.current) cancelAnimationFrame(animationFrame.current)
    }
  }, [isActive])

  const setupVapiListeners = () => {
    if (!vapi) return

    vapi.on("call-start", () => {
      setIsCallActive(true)
      setCoachSpeaking(false)
      setVapiError(false)
    })

    vapi.on("call-end", () => {
      setIsCallActive(false)
      setCoachSpeaking(false)
    })

    vapi.on("speech-start", () => setCoachSpeaking(true))
    vapi.on("speech-end", () => setCoachSpeaking(false))

    vapi.on("message", (message) => {
      if (message.type === "transcript" && message.role === "assistant" && message.transcriptType === "final") {
        setFeedback(message.transcript)
      }
    })

    vapi.on("error", (error) => {
      console.error("Vapi error:", error)
      setVapiError(true)
      setFeedback("Voice AI failed. Using backup voice...")
      speak("Workout started with backup voice coach")
    })
  }

  const loadPoseModel = async () => {
    setLoading(true)
    try {
      const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm"
      )
      const landmarker = await PoseLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: `https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task`,
          delegate: "GPU"
        },
        runningMode: "VIDEO",
        numPoses: 1
      })
      setPoseLandmarker(landmarker)
      setDebugInfo("AI Ready! Click Start.")
    } catch (err) {
      setDebugInfo("Error loading AI")
      setFeedback("Failed to load AI. Refresh page.")
    } finally {
      setLoading(false)
    }
  }

  const startWorkout = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: "user" },
        audio: true
      })
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream
      }

      if (vapi && vapiKey) {
        try {
          await vapi.start({
            model: {
              provider: "openai",
              model: "gpt-4",
              messages: [
                {
                  role: "system",
                  content: `You are an energetic fitness coach named "Flex". You are watching the user exercise via video.
Current workout: Squats.
Give short, energetic encouragement (max 8 words).
Be motivational and high-energy!
If they ask questions about form, answer briefly.
Count reps with them and celebrate milestones.
Never say you're an AI - you're their coach!`
                }
              ]
            },
            voice: {
              provider: "11labs",
              voiceId: "burt"
            }
          })

          updateInterval.current = setInterval(() => {
            if (squatCount.current > 0 && isCallActive) {
              vapi.send({
                type: "add-message",
                message: `Update: User has completed ${squatCount.current} reps. Current state: ${squatState}. Give brief encouragement if appropriate.`
              })
            }
          }, 3000)

        } catch (vapiErr) {
          console.error("Vapi start failed:", vapiErr)
          setVapiError(true)
          speak("Voice coach unavailable. Using backup voice.")
        }
      } else {
        setVapiError(true)
        speak("Workout started")
      }

      videoRef.current!.onloadeddata = () => detectPose()

    } catch (err) {
      setFeedback("Error starting. Check camera/mic permissions.")
      speak("Error starting workout")
    }
  }

  const stopWorkout = () => {
    if (vapi && isCallActive) vapi.stop()
    if (videoRef.current?.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream
      stream.getTracks().forEach(track => track.stop())
      videoRef.current.srcObject = null
    }
    if (animationFrame.current) cancelAnimationFrame(animationFrame.current)
    if (updateInterval.current) clearInterval(updateInterval.current)
    setFeedback("Workout paused.")
    setDebugInfo("Camera off")
    setIsCallActive(false)
  }

  const detectPose = () => {
    if (!videoRef.current || !canvasRef.current || !poseLandmarker) return

    const video = videoRef.current
    const canvas = canvasRef.current
    const ctx = canvas.getContext("2d")!

    if (canvas.width !== video.videoWidth) {
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
    }

    if (video.currentTime !== lastVideoTime.current) {
      lastVideoTime.current = video.currentTime
      const results = poseLandmarker.detectForVideo(video, performance.now())
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      if (results.landmarks?.length > 0) {
        const landmarks = results.landmarks[0]
        drawSkeleton(ctx, landmarks)
        analyzeSquat(landmarks)
      } else {
        setDebugInfo("No pose! Step back!")
      }
    }
    animationFrame.current = requestAnimationFrame(detectPose)
  }

  const drawSkeleton = (ctx: CanvasRenderingContext2D, landmarks: any[]) => {
    landmarks.forEach((landmark: any, i: number) => {
      const x = landmark.x * ctx.canvas.width
      const y = landmark.y * ctx.canvas.height
      
      ctx.beginPath()
      ctx.arc(x, y, 8, 0, 2 * Math.PI)
      ctx.fillStyle = [23, 24, 25, 26].includes(i) ? "#ff0066" : "#00d9ff"
      ctx.fill()
      ctx.strokeStyle = "#fff"
      ctx.lineWidth = 2
      ctx.stroke()

      ctx.fillStyle = "#fff"
      ctx.font = "10px Arial"
      ctx.fillText(i.toString(), x + 10, y)
    })

    const connections = [
      [11, 13], [13, 15], [12, 14], [14, 16],
      [11, 12], [11, 23], [12, 24],
      [23, 25], [25, 27], [24, 26], [26, 28],
      [23, 24]
    ]
    
    ctx.strokeStyle = "#00d9ff"
    ctx.lineWidth = 3
    
    connections.forEach(([i, j]: number[]) => {
      const start = landmarks[i]
      const end = landmarks[j]
      ctx.beginPath()
      ctx.moveTo(start.x * ctx.canvas.width, start.y * ctx.canvas.height)
      ctx.lineTo(end.x * ctx.canvas.width, end.y * ctx.canvas.height)
      ctx.stroke()
    })
  }

  const calculateKneeAngle = (hip: any, knee: any, ankle: any) => {
    const radians = Math.atan2(ankle.y - knee.y, ankle.x - knee.x) - 
                    Math.atan2(hip.y - knee.y, hip.x - knee.x)
    let angle = Math.abs(radians * 180.0 / Math.PI)
    if (angle > 180) angle = 360 - angle
    return angle
  }

  const analyzeSquat = (landmarks: any[]) => {
    const leftHip = landmarks[23]
    const leftKnee = landmarks[25]
    const leftAnkle = landmarks[27]
    const rightHip = landmarks[24]
    const rightKnee = landmarks[26]
    const rightAnkle = landmarks[28]

    if (!leftHip || !leftKnee || !leftAnkle || !rightHip || !rightKnee || !rightAnkle) {
      setDebugInfo("Step back! Full body not visible")
      return
    }

    const leftAngle = calculateKneeAngle(leftHip, leftKnee, leftAnkle)
    const rightAngle = calculateKneeAngle(rightHip, rightKnee, rightAnkle)
    const avgAngle = (leftAngle + rightAngle) / 2

    const now = Date.now()
    setDebugInfo(`Angle: ${Math.round(avgAngle)}° | State: ${squatState}`)

    if (avgAngle < 110 && squatState === "up" && now - lastRepTime.current > 1000) {
      setSquatState("down")
      setFeedback("Good depth! Push up!")
      
      if (vapi && isCallActive && !vapiError) {
        vapi.send({ type: "add-message", message: "User reached good squat depth" })
      } else {
        speak("Good depth")
      }
      
    } else if (avgAngle > 150 && squatState === "down" && now - lastRepTime.current > 1000) {
      setSquatState("up")
      squatCount.current += 1
      lastRepTime.current = now
      setRepCount(squatCount.current)

      if (vapi && isCallActive && !vapiError) {
        vapi.send({ type: "add-message", message: `User completed rep ${squatCount.current}! Give encouragement.` })
      } else {
        const messages = ["Nice!", "Strong!", "Keep it up!", "Power!", "Great!"]
        const msg = messages[Math.floor(Math.random() * messages.length)]
        setFeedback(`${msg} Total: ${squatCount.current}`)
        speak(msg)
      }
    }
  }

  if (loading) {
    return <div className="loading">Loading AI Models...</div>
  }

  return (
    <div className="app">
      <h1>🏋️ AI Fitness Coach</h1>
      
      <div className="main-layout">
        <div className="left-panel">
          <div className="video-container">
            <video ref={videoRef} autoPlay playsInline muted={false} />
            <canvas ref={canvasRef} className="overlay" />
            {isActive && (
              <div className={`live-badge ${coachSpeaking ? 'speaking' : ''}`}>
                {coachSpeaking ? '🔊 COACH SPEAKING' : '🔴 LIVE'}
              </div>
            )}
          </div>
          <div className="debug-panel">
            <small>{debugInfo}</small>
          </div>
        </div>

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

          {vapiError && (
            <div className="voice-indicator warning">
              <p>⚠️ Voice AI unavailable</p>
              <small>Using browser voice. Add VAPI key for full AI coach.</small>
            </div>
          )}

          {isCallActive && !vapiError && (
            <div className="voice-indicator">
              <p>🎙️ Voice chat active!</p>
              <small>Try saying: "How's my form?" or "Count my reps!"</small>
            </div>
          )}

          <div className="instructions">
            <p>💡 <strong>How to use:</strong></p>
            <ul>
              <li>Allow camera AND microphone access</li>
              <li>Stand 6-8 feet back from camera</li>
              <li>Make sure your full body is visible</li>
              <li>Talk to your AI coach anytime!</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}

export default App