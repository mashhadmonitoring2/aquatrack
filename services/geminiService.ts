
import { GoogleGenAI, Type } from "@google/genai";
import { TimePoint } from "../types";

export const analyzeWaterData = async (data: TimePoint[]) => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const prompt = `
    داده‌های کیفیت آب شامل هدایت الکتریکی (EC) و سطوح نیترات را در دوره‌های زمانی مختلف تحلیل کنید.
    لطفاً جابجایی‌های مهم در نقاط خاص، نوسانات شدید و روندهای کلی سلامت آب را شناسایی کنید.
    تمام پاسخ‌ها باید به زبان فارسی باشد.
    
    Data: ${JSON.stringify(data.map(tp => ({ 
      date: tp.date, 
      count: tp.samples.length,
      averages: {
        ec: tp.samples.reduce((a, b) => a + b.conductivity, 0) / tp.samples.length,
        nitrate: tp.samples.reduce((a, b) => a + b.nitrate, 0) / tp.samples.length
      }
    })))}
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-pro-preview",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            summary: { type: Type.STRING, description: "خلاصه مدیریتی از روندها به فارسی" },
            anomalies: { 
              type: Type.ARRAY, 
              items: { type: Type.STRING },
              description: "لیست کد نقاط یا مناطقی که جابجایی نگران‌کننده داشته‌اند به فارسی" 
            },
            recommendations: { 
              type: Type.ARRAY, 
              items: { type: Type.STRING },
              description: "توصیه‌های عملی برای مدیریت منابع آب به فارسی" 
            }
          },
          required: ["summary", "anomalies", "recommendations"]
        }
      }
    });

    return JSON.parse(response.text || '{}');
  } catch (error) {
    console.error("Gemini Analysis Error:", error);
    return {
      summary: "خطا در تحلیل داده‌ها. لطفاً اتصال خود را بررسی کرده و دوباره تلاش کنید.",
      anomalies: [],
      recommendations: ["بررسی سنسورها و دقت داده‌های ورودی."]
    };
  }
};
