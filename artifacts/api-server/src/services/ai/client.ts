import OpenAI from "openai";
import { GoogleGenAI } from "@google/genai";

let _openai: OpenAI | null = null;
let _gemini: GoogleGenAI | null = null;

export function getOpenAI(): OpenAI {
  if (!_openai) {
    _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return _openai;
}

export function getGemini(): GoogleGenAI {
  if (!_gemini) {
    const key = process.env.GEMINI_API_KEY ?? process.env.NANO_BANANA_API_KEY ?? "";
    _gemini = new GoogleGenAI({ apiKey: key });
  }
  return _gemini;
}

export function isGeminiAvailable(): boolean {
  return !!(process.env.GEMINI_API_KEY || process.env.NANO_BANANA_API_KEY);
}