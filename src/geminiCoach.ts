const API_KEY = import.meta.env.VITE_GEMINI_API_KEY

export async function getCoachingAdvice(repCount: number): Promise<string> {
  if (!API_KEY) {
    const tips = [
      "Keep your chest up!",
      "Drive through your heels!",
      "Great depth, maintain form!",
      "Power up! You've got this!",
      "Core tight, back straight!",
      "Excellent control!",
      "Breathe and push!"
    ]
    return tips[Math.floor(Math.random() * tips.length)]
  }
  
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [{ 
              text: `You are an energetic fitness coach. The user just completed rep ${repCount} of squats. Give ONE short, motivational feedback (max 6 words). Be specific and encouraging!` 
            }]
          }],
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 20
          }
        })
      }
    )
    
    if (!response.ok) throw new Error('API error')
    
    const data = await response.json()
    const advice = data.candidates?.[0]?.content?.parts?.[0]?.text
    
    if (advice) {
      return advice.replace(/["']/g, '').trim()
    }
    
    throw new Error('No response text')
  } catch (error) {
    console.error('Gemini API error:', error)
    return "Keep pushing! 💪"
  }
}