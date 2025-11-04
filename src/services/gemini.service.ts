import { Injectable, signal } from '@angular/core';
import { GoogleGenAI, GenerateContentResponse, Type } from '@google/genai';

// IMPORTANT: Do not expose this key publicly.
// This is using a placeholder for the applet environment.
declare var process: any;

interface MenuAnalysisResponse {
    analysis: string;
    commentary: string;
}

@Injectable({
  providedIn: 'root',
})
export class GeminiService {
  private ai: GoogleGenAI;
  private readonly systemInstruction = `Ti si "GastroAnalitičar", napredni AI asistent specijaliziran za ugostiteljstvo i optimizaciju menija. Tvoj cilj je pomoći vlasnicima restorana analizirati vlastitu ponudu i usporediti je s konkurencijom, pružajući uvijek stručne, profesionalne komentare iz perspektive iskusnog F&B Menadžera i Glavnog Kuhara. Tvoja persona je iskusni kuhar (Chef) i F&B menadžer. Tvoj ton je stručan, samopouzdan, konstruktivan i poticajan. Svaka tvoja analiza MORA biti popraćena konkretnim, akcijskim savjetom za poboljšanje. Koristi markdown za formatiranje (npr. **bold** za naslove, *italics* za naglašavanje, i liste s crticama -). Odgovori uvijek na hrvatskom jeziku.`;

  constructor() {
    // This is a placeholder for the Applet environment variable.
    const apiKey = typeof process !== 'undefined' && process.env && process.env.API_KEY 
        ? process.env.API_KEY 
        : 'YOUR_API_KEY_PLACEHOLDER';
    if (apiKey === 'YOUR_API_KEY_PLACEHOLDER') {
        console.warn('API Key not found. Please set the API_KEY environment variable.');
    }
    this.ai = new GoogleGenAI({ apiKey });
  }

  private async fileToGenerativePart(file: File) {
    const base64EncodedDataPromise = new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
      reader.readAsDataURL(file);
    });
    return {
      inlineData: { data: await base64EncodedDataPromise, mimeType: file.type },
    };
  }

  async structureMenuFromText(text: string): Promise<string> {
    const prompt = `Pročitaj ovaj tekst menija i strukturiraj ga u JSON format. JSON bi trebao biti array objekata, gdje svaki objekt predstavlja jelo i ima ključeve 'jelo' (string), 'opis' (string), i 'cijena' (string or number). Tekst menija je: \n\n${text}`;
    
    const response = await this.ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: {
            responseMimeType: 'application/json',
            responseSchema: {
                type: Type.ARRAY,
                items: {
                    type: Type.OBJECT,
                    properties: {
                        jelo: { type: Type.STRING },
                        opis: { type: Type.STRING },
                        cijena: { type: Type.STRING } 
                    },
                    required: ['jelo', 'cijena']
                }
            }
        }
    });

    return response.text;
  }

  async structureMenuFromImage(imageFile: File): Promise<string> {
    const imagePart = await this.fileToGenerativePart(imageFile);
    const prompt = "Pažljivo pročitaj sav tekst sa slike ovog menija. Identificiraj svako jelo, njegov opis (ako postoji) i cijenu. Strukturiraj te podatke u JSON formatu prema priloženoj shemi. Budi što precizniji.";

    const response = await this.ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: { parts: [imagePart, { text: prompt }] },
        config: {
            responseMimeType: 'application/json',
            responseSchema: {
                type: Type.ARRAY,
                items: {
                    type: Type.OBJECT,
                    properties: {
                        jelo: { type: Type.STRING },
                        opis: { type: Type.STRING },
                        cijena: { type: Type.STRING } 
                    },
                    required: ['jelo', 'cijena']
                }
            }
        }
    });
    return response.text;
  }
  
  async analyzeMenu(structuredMenu: string, criteria: string): Promise<string> {
    const prompt = `Analiziraj sljedeći menu na temelju ovih kriterija: "${criteria}". \n\nMenu (JSON format):\n${structuredMenu}`;

    const response = await this.ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: {
            systemInstruction: this.systemInstruction
        }
    });

    return response.text;
  }

  async compareMenus(userMenu: string, competitorMenu: string, keywords: string | null): Promise<string> {
      let prompt: string;
      if (keywords) {
          prompt = `Usporedi ova dva menija s posebnim fokusom na sljedeće ključne riječi: "${keywords}".\n\nMoj menu:\n${userMenu}\n\nKonkurentski menu:\n${competitorMenu}`;
      } else {
          prompt = `Napravi opću usporedbu ova dva menija. Pokrij sličnost ponude, cjenovne rangove i jedinstvenost ponude.\n\nMoj menu:\n${userMenu}\n\nKonkurentski menu:\n${competitorMenu}`;
      }

      const response = await this.ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: {
            systemInstruction: this.systemInstruction
        }
      });
      return response.text;
  }
}
