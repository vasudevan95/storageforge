import google.generativeai as genai
import base64
import json
import os

genai.configure(api_key=os.environ["GOOGLE_API_KEY"])

ANALYSIS_PROMPT = """Analyze this photo and respond with ONLY a JSON object (no markdown, no code blocks):
{
  "era": "approximate decade (e.g., 1960s, 1990s)",
  "emotion": "dominant emotion visible (e.g., joyful, melancholic, proud)",
  "setting": "location type (e.g., outdoor garden, urban street, home interior)",
  "people_count": 0,
  "key_details": "2-3 notable visual details that suggest story context"
}"""


def analyze_photo(image_path: str) -> dict:
    model = genai.GenerativeModel("gemini-2.5-flash")

    with open(image_path, "rb") as f:
        image_data = base64.b64encode(f.read()).decode()

    # Determine mime type from extension
    ext = os.path.splitext(image_path)[1].lower()
    mime_map = {".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".heic": "image/heic", ".webp": "image/webp"}
    mime_type = mime_map.get(ext, "image/jpeg")

    try:
        response = model.generate_content([
            ANALYSIS_PROMPT,
            {"inline_data": {"mime_type": mime_type, "data": image_data}}
        ])

        text = response.text.strip()
        # Strip markdown code blocks if present
        if text.startswith("```"):
            lines = text.split("\n")
            text = "\n".join(lines[1:-1]) if lines[-1] == "```" else "\n".join(lines[1:])
        return json.loads(text)
    except Exception as e:
        print(f"Vision analysis error for {image_path}: {e}")
        return {
            "era": "unknown",
            "emotion": "neutral",
            "setting": "unknown",
            "people_count": 0,
            "key_details": ""
        }
