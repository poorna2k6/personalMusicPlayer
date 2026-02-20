
// ai-worker.js
// Handles interactions with Google Gemini API for Smart DJ

self.postMessage({ type: 'LOG', payload: '[AI Worker] Started' });

self.onmessage = async (e) => {
    const { type, payload, apiKey } = e.data;
    self.postMessage({ type: 'LOG', payload: `[AI Worker] Received ${type}` });

    if (type === 'GENERATE_PLAYLIST') {
        try {
            const { vibe, language } = payload;
            const playlist = await generatePlaylist(vibe, language, apiKey);
            self.postMessage({ type: 'PLAYLIST_GENERATED', payload: playlist });
        } catch (error) {
            self.postMessage({ type: 'ERROR', payload: error.message });
        }
    } else if (type === 'GENERATE_DAILY_MIX') {
        try {
            const { language } = payload;
            const mixes = await generateDailyMixes(language, apiKey);
            self.postMessage({ type: 'DAILY_MIX_GENERATED', payload: mixes });
        } catch (error) {
            self.postMessage({ type: 'ERROR', payload: error.message });
        }
    } else if (type === 'INTELLIGENT_SEARCH') {
        try {
            const { query } = payload;
            const result = await intelligentSearch(query, apiKey);
            self.postMessage({ type: 'SEARCH_ANALYZED', payload: result });
        } catch (error) {
            self.postMessage({ type: 'ERROR', payload: error.message });
        }
    }
};

async function intelligentSearch(query, apiKey) {
    const prompt = `
    Analyze the user search query: "${query}"
    Return a raw JSON object with these fields (if applicable):
    - "isNaturalLanguage": boolean (true if it looks like a sentence/request like "play sad songs", false if just a keyword like "Believer")
    - "artist": string (extracted artist name)
    - "song": string (extracted song name)
    - "year": string (extracted year or decade)
    - "language": string (implied language)
    - "mood": string (implied mood)
    - "searchQuery": string (optimized keyword search query for a music API)
    
    Example: "Play sad songs from Arijit" -> {"isNaturalLanguage": true, "artist": "Arijit Singh", "mood": "Sad", "searchQuery": "Arijit Singh sad songs"}
    Example: "Believer" -> {"isNaturalLanguage": false, "searchQuery": "Believer"}
    `;
    return await callGemini(prompt, apiKey);
}

async function generateDailyMixes(language, apiKey) {
    const prompt = `
    Create 3 distinct "Daily Mix" playlist concepts for a ${language} music listener.
    Return ONLY a raw JSON array of 3 objects.
    Each object must have:
    - "title": A catchy title (e.g., "Morning Coffee", "Gym Grind", "Nostalgia").
    - "description": Short subtitle.
    - "vibe": A keyword to generate songs later.
    - "color": A hex color code (gradient start).
    Example: [{"title":"X", "description":"Y", "vibe":"Z", "color":"#ff0000"}]
  `;

    // Reuse the request logic
    return await callGemini(prompt, apiKey);
}

// Refactored Gemini call
async function callGemini(prompt, apiKey) {
    self.postMessage({ type: 'LOG', payload: '[AI Worker] Calling Gemini API...' });
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;


    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s timeout

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
            signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`Gemini API Error ${response.status}: ${errText}`);
        }

        const data = await response.json();
        console.log('[AI Worker] Gemini Response:', data);

        if (!data.candidates || !data.candidates[0].content) {
            throw new Error('Gemini returned no candidates');
        }

        const text = data.candidates[0].content.parts[0].text;
        const jsonStr = text.replace(/```json/g, '').replace(/```/g, '').trim();
        return JSON.parse(jsonStr);
    } catch (e) {
        console.error('[AI Worker] Fetch Error:', e);
        throw e;
    }
}

async function generatePlaylist(vibe, language, apiKey) {
    const prompt = `
    You are a professional DJ. Create a playlist of 10 ${language} songs that perfectly match a "${vibe}" vibe.
    Return ONLY a raw JSON array of objects (no markdown, no code blocks).
    Each object must have: "song" (title), "artist" (name), "query" (search query to find it).
    Example: [{"song": "Song Name", "artist": "Artist", "query": "Song Name Artist"}]
  `;
    return await callGemini(prompt, apiKey);
}
