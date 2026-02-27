import Vapi from "@vapi-ai/web"

const vapi = new Vapi(import.meta.env.VITE_VAPI_PUBLIC_KEY)

export const startCoachCall = async (systemPrompt: string) => {
  return vapi.start({
    model: {
      provider: "openai",
      model: "gpt-4",
      systemPrompt: systemPrompt
    },
    voice: {
      provider: "11labs",
      voiceId: "burt" // Energetic coach voice
    }
  })
}

export const stopCoachCall = () => {
  vapi.stop()
}

export const sendMessageToCoach = (message: string) => {
  vapi.send({
    type: "add-message",
    message: message
  })
}

export const onCoachMessage = (callback: (message: any) => void) => {
  vapi.on("message", callback)
}

export const onCallStart = (callback: () => void) => {
  vapi.on("call-start", callback)
}

export const onCallEnd = (callback: () => void) => {
  vapi.on("call-end", callback)
}

export default vapi