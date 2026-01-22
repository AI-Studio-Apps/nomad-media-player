import { GoogleGenAI } from "@google/genai";
import { VideoItem } from "../types";

// In-memory key storage
let MEMORY_API_KEY: string | null = null;

export const geminiService = {
  setApiKey(key: string) {
    MEMORY_API_KEY = key;
  },

  getApiKey(): string | null {
    // Priority 1: Environment Variable (Google AI Studio / Hosted)
    // We safely check process.env to avoid reference errors in strict browser environments
    try {
      if (typeof process !== 'undefined' && process.env && process.env.API_KEY) {
        return process.env.API_KEY;
      }
    } catch (e) {
      // Ignore process access errors
    }
    
    // Priority 2: User Settings (Self-Hosted fallback)
    return MEMORY_API_KEY;
  },

  /**
   * Generates a structured learning plan from video metadata.
   */
  async generateLesson(video: VideoItem): Promise<string> {
    const apiKey = this.getApiKey();
    if (!apiKey) throw new Error("Gemini API Key is missing. Please configure it in Settings.");

    // Using gemini-3-flash-preview as recommended for text tasks
    const ai = new GoogleGenAI({ apiKey });

    // Construct a rich prompt based on available metadata
    const prompt = `
      I am watching an educational video and I need a study aid.
      
      Video Details:
      Title: "${video.title}"
      Channel: "${video.author}"
      Platform: "${video.platform}"
      Published: "${video.pubDate}"
      Description: "${video.description}"
      Link: "${video.link}"

      Please generate a "Learning Guide" for this video in Markdown format.
      Structure the response exactly as follows:

      # Key Concepts
      (Bullet points of the most likely core topics based on the description and title)

      # Summary
      (A brief 2-3 sentence overview of what this video likely covers)

      # Reflection Questions
      (3 open-ended questions to think about while watching)

      # Quiz
      (3 Multiple Choice Questions with the answer hidden in a spoiler or at the bottom)
    `;

    try {
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview', 
        contents: prompt,
      });
      return response.text || "No content generated.";
    } catch (error: any) {
      console.error("Gemini Gen Error", error);
      throw new Error("Failed to generate lesson: " + error.message);
    }
  },

  /**
   * Chat with the video context.
   */
  async chatWithVideo(video: VideoItem, message: string, history: any[] = []): Promise<string> {
    const apiKey = this.getApiKey();
    if (!apiKey) throw new Error("Gemini API Key is missing. Please configure it in Settings.");

    const ai = new GoogleGenAI({ apiKey });
    
    // System instruction to ground the model in the video context
    const systemInstruction = `
      You are an expert tutor helper. The user is watching a video titled "${video.title}" by "${video.author}".
      Description: ${video.description.slice(0, 1000)}.
      Your goal is to answer questions based on this context. 
      If the user asks something unrelated, politely bring them back to the topic of the video.
      Keep answers concise and encouraging.
    `;

    const chat = ai.chats.create({
      model: 'gemini-3-flash-preview',
      config: {
        systemInstruction: systemInstruction,
      },
      history: history
    });

    const response = await chat.sendMessage({ message });
    return response.text || "";
  }
};
