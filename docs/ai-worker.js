// ai-worker.js
// Handles interactions with Google Gemini API for Smart DJ, Personalized Recommendations & Music Chat

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
    } else if (type === 'PERSONALIZED_RECS') {
        try {
            const { history, likedSongs, language } = payload;
            const result = await generatePersonalizedRecs(history, likedSongs, language, apiKey);
            self.postMessage({ type: 'RECS_GENERATED', payload: result });
        } catch (error) {
            self.postMessage({ type: 'ERROR', payload: error.message });
        }
    } else if (type === 'MUSIC_CHAT') {
        try {
            const { message, context } = payload;
            const result = await musicChat(message, context, apiKey);
            self.postMessage({ type: 'CHAT_RESPONSE', payload: result });
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

// ===== PERSONALIZED AI RECOMMENDATIONS =====
async function generatePersonalizedRecs(history, likedSongs, language, apiKey) {
    const historyTracks = (history || []).map(h => h.track || h).filter(Boolean);
    const allTracks = [...(likedSongs || []).slice(0, 15), ...historyTracks.slice(0, 20)];
    const songSummary = allTracks.slice(0, 20)
        .map(t => {
            const name = t.title || t.song || t.name || 'unknown';
            const artist = (typeof t.primaryArtists === 'string') ? t.primaryArtists :
                (t.artists && t.artists.primary) ? t.artists.primary.map(a => a.name).join(', ') :
                    t.artist || 'unknown';
            return `${name} by ${artist}`;
        })
        .join('; ') || 'popular melodious songs';

    const prompt = `
You are a music genius who deeply understands listener souls.
User recently listened to or liked: ${songSummary}
Their preferred language is: ${language || 'hindi'}.

Your tasks:
1. Silently analyze their music taste — what mood, artists, and genres dominate.
2. Invent a creative, fun, and slightly funny playlist name (2-5 words) that captures their vibe.
   Great examples: "Chai Time Bangers", "Midnight Feels Combo", "Desi Gym Thunder", "Heart ka Bluetooth", "Rickshaw Rave Party", "Office Cry Playlist", "3am Philosopher Mix", "Autorickshaw Anthem Pack", "Ghar Ka Khana Beats".
3. Write a short, witty one-sentence tagline that will make the user smile.
4. Recommend exactly 10 songs that:
   - The user will absolutely love based on their taste
   - Are songs they likely haven't heard yet (fresh discoveries)
   - Match the overall vibe/language pattern of their history

Return ONLY a raw JSON object (no markdown, no code blocks, no explanation):
{
  "playlistName": "Fun Name Here",
  "tagline": "Short witty tagline here",
  "songs": [
    { "song": "Song Title", "artist": "Artist Name", "query": "search query to find this song" }
  ]
}`;
    return await callGemini(prompt, apiKey);
}

// ===== MUSIC ASSISTANT CHAT =====
async function musicChat(message, context, apiKey) {
    const prompt = `
You are Raagam AI, a witty and helpful music assistant.
User message: "${message}"
Current language preference: ${context.language || 'hindi'}
${context.nowPlaying ? `Currently listening to: ${context.nowPlaying.title || context.nowPlaying.name} by ${context.nowPlaying.artist}` : ''}

Your goal is to understand what the user wants and respond exactly in this JSON format:
{
  "action": "play" | "search" | "mood" | "general",
  "response": "A friendly, witty, and concise reply to the user (1-2 sentences).",
  "query": "If action is play/search, the search query to use",
  "mood": "If action is mood, the vibe/mood to generate a playlist for (e.g. sad, gym, romantic)",
  "artistName": "Optional artist name mentioned"
}

Examples:
- User: "play some arijit singh" -> {"action": "play", "response": "Playing the king of heartbreak, Arijit Singh! 💔", "query": "Arijit Singh"}
- User: "I feel sad" -> {"action": "mood", "response": "I've got just the playlist for a good cry.", "mood": "sad heartbreak"}
- User: "who are you" -> {"action": "general", "response": "I am Raagam AI, your personal DJ and music buddy! 🎧"}

Return ONLY the raw JSON object (no markdown, no code blocks, no explanation).
`;

    return await callGemini(prompt, apiKey);
}
