const key = process.env.GOOGLE_API_KEY;
const r = await fetch(
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=" + key,
  {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contents: [{ parts: [{ text: "Say hi in one word." }] }] }),
  }
);
console.log(await r.json());
