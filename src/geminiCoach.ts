const API_KEY = import.meta.env.VITE_GEMINI_API_KEY

export async function getCoachingAdvice(poseData: any, repCount: number): Promise<string> {
  if (!API_KEY) {
    // Fallback if no API key
    const tips = ["Keep pushing!", "Great form!", "Stay strong!"]
    return tips[Math.floor(Math.random() * tips.length)]
  }
  
  const prompt = `Give a short 5-word fitness encouragement for rep ${repCount}.`
  
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }]
        })
      }
    )
    const data = await response.json()
    return data.candidates?.[0]?.content?.parts?.[0]?.text || "Keep going!"
  } catch (e) {
    return "Keep pushing!"
  }
}