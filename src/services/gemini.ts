import { GoogleGenAI, Type, Modality } from "@google/genai";

let manualKey: string | null = null;

export const setManualApiKey = (key: string) => {
  manualKey = key;
};

const getApiKey = () => {
  // Fallback to manual key if provided (this will be set from server config or user input)
  if (manualKey) return manualKey;
  
  // Check for Vite environment variable (built-in at build time)
  const viteKey = (import.meta as any).env?.VITE_GEMINI_API_KEY;
  if (viteKey && viteKey !== "MY_GEMINI_API_KEY") return viteKey;
  
  return null;
};

export const hasApiKey = () => {
  return !!getApiKey();
};

export interface Question {
  id: string;
  text: string;
  options?: string[];
  audioUrl?: string;
  audioBase64?: string;
}

export interface TestData {
  title: string;
  introduction?: string;
  introAudioUrl?: string;
  introAudioBase64?: string;
  questions: Question[];
}

export async function processTestImages(base64Images: string[], language: string = 'hebrew', wordText?: string): Promise<TestData> {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error("מפתח ה-API של Gemini חסר. יש להגדיר אותו בהגדרות (Secrets) או דרך כפתור החיבור.");
  }
  const ai = new GoogleGenAI({ apiKey });
  const model = "gemini-3-flash-preview";
  
  const imageParts = base64Images.map(data => ({
    inlineData: {
      mimeType: "image/jpeg",
      data: data.split(",")[1] || data
    }
  }));

  const prompt = `
    Analyze these test materials (images and/or text) and extract ALL questions without skipping any, even if the document is long.
    ${wordText ? `Additional text from Word document context:\n${wordText}\n` : ''}
    
    Format the output as a JSON object with:
    - 'title': The main title of the test.
    - 'introduction': Any introductory text, instructions, or context provided at the beginning of the test before the questions start.
    - 'questions': An array of objects, each with a unique 'id' and 'text'.
    
    Each question should have a unique 'id' and 'text'. 
    If it's a multiple choice question, include an 'options' array.
    
    IMPORTANT INSTRUCTIONS:
    1. LANGUAGE & TRANSLATION: The target language for the student is ${language}. 
       - If the source materials are in a different language, TRANSLATE the title, introduction, and questions into ${language} while preserving the original meaning and structure.
       - If it's a mixed language test (e.g. English test for Hebrew speakers), translate the instructions/introduction into ${language} but keep the English questions as they are.
       - If the target language is Hebrew, ensure the output is clear and grammatically correct.
    2. EXHAUSTIVE: Do not summarize. Extract every single question from all provided pages. Include the full introduction text.
    3. ACCESSIBILITY: If a question includes a graph, image, or complex formula, describe it clearly in the 'text' field so a student who cannot see the image can understand the question fully.
    4. FORMATTING: Ensure the JSON is valid and follows the schema strictly.
  `;

  try {
    const response = await ai.models.generateContent({
      model,
      contents: {
        parts: [...imageParts, { text: prompt }]
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            introduction: { type: Type.STRING },
            questions: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.STRING },
                  text: { type: Type.STRING },
                  options: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING }
                  }
                },
                required: ["id", "text"]
              }
            }
          },
          required: ["title", "questions"]
        }
      }
    });

    return JSON.parse(response.text || "{}");
  } catch (error: any) {
    console.error("Gemini API Error:", error);
    if (error.message?.includes("API_KEY_INVALID") || error.message?.includes("403") || error.message?.includes("401")) {
      throw new Error("מפתח ה-API אינו תקין או שפג תוקפו.");
    }
    throw new Error(error.message || "אירעה שגיאה בעיבוד המבחן. נסה שוב.");
  }
}

export async function generateSpeech(text: string, language: string = 'hebrew'): Promise<{ url: string; base64: string }> {
  try {
    const apiKey = getApiKey();
    if (!apiKey) {
      throw new Error("מפתח ה-API של Gemini חסר.");
    }
    const ai = new GoogleGenAI({ apiKey });

    // Voice mapping based on language
    const voiceMapping: Record<string, string> = {
      'hebrew': 'Kore',
      'english': 'Zephyr',
      'arabic': 'Zephyr', // Fallback or specific if available
      'russian': 'Zephyr',
      'czech': 'Zephyr'
    };

    const voiceName = voiceMapping[language.toLowerCase()] || 'Zephyr';
    const instruction = language.toLowerCase() === 'hebrew' 
      ? 'קרא בקול ברור ונינוח. שים לב לניקוד בטקסט והקרא את המילים בדיוק לפי הניקוד המופיע.' 
      : 'Read in a clear and relaxed voice. Pay close attention to any diacritics or pronunciation marks in the text.';

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text: `${instruction}: ${text}` }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName },
          },
        },
      },
    });

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!base64Audio) throw new Error("לא התקבל מידע קולי מהשרת");
    
    const wavData = pcmToWavData(base64Audio, 24000);
    const blob = new Blob([wavData.header, wavData.bytes], { type: 'audio/wav' });
    const url = URL.createObjectURL(blob);
    
    // Convert the full WAV back to base64 for export
    const fullWavBase64 = await blobToBase64(blob);

    return { url, base64: fullWavBase64 };
  } catch (error) {
    console.error("TTS Error:", error);
    throw error;
  }
}

async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = (reader.result as string).split(',')[1];
      resolve(base64String);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function pcmToWavData(pcmBase64: string, sampleRate: number): { header: ArrayBuffer; bytes: Uint8Array } {
  const binaryString = atob(pcmBase64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  const wavHeader = new ArrayBuffer(44);
  const view = new DataView(wavHeader);

  view.setUint32(0, 0x52494646, false); // "RIFF"
  view.setUint32(4, 36 + bytes.length, true);
  view.setUint32(8, 0x57415645, false); // "WAVE"
  view.setUint32(12, 0x666d7420, false); // "fmt "
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  view.setUint32(36, 0x64617461, false); // "data"
  view.setUint32(40, bytes.length, true);

  return { header: wavHeader, bytes };
}
