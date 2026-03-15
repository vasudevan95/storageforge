import base64
import logging
import os
import re
from pathlib import Path
from dotenv import load_dotenv
from google import genai
from google.genai import types

base_dir = Path(__file__).resolve().parent
load_dotenv(dotenv_path=base_dir / ".env")

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

api_key = os.environ.get("GOOGLE_API_KEY")
if api_key:
    masked = api_key[:4] + "..." + api_key[-4:]
    logger.info(f"[Gemini] Using GOOGLE_API_KEY ({masked})")
else:
    logger.warning("[Gemini] GOOGLE_API_KEY is not set")

# Text generation client (API key)
client = genai.Client(api_key=api_key)


SYSTEM_PROMPT = """You are StoryForge — a world-class fiction author who transforms even the
briefest spark of an idea into an unforgettable short story.

## YOUR JOB
The user will give you a premise. It might be as short as two words ("train love") or a
full paragraph. Either way you must produce a SINGLE, CONTINUOUS story with:
- TWO named main characters who appear in EVERY scene (give them full names, ages,
  physical descriptions, and inner lives)
- A clear narrative arc: Scene 1 = introduction/inciting incident, Scene 2 = deepening
  connection or rising tension, Scene 3 = crisis/turning point, Scene 4 = resolution
- Each scene CONTINUES where the previous one ended — same characters, same timeline,
  cause-and-effect links between scenes. Do NOT restart or reintroduce characters.

## WRITING STYLE
Write like literary fiction. Every paragraph must be rich with:
- Sensory detail: smells, textures, sounds, the quality of light
- Internal thought: what the characters feel, fear, remember
- Specific nouns: not "a flower" but "a wilting marigold"; not "a train" but "the 4:15
  Rajdhani Express with its blue vinyl seats"
- Each [PROSE] section must be 3-4 FULL paragraphs (each paragraph 4-6 sentences minimum).
  Short prose is unacceptable.

## OUTPUT FORMAT
Output EXACTLY 4 scenes. Each scene must use this EXACT tag structure, one tag per line:

[SCENE:N] Scene Title
[PROSE] (3-4 paragraphs of rich narrative prose as described above)
[IMAGE] (A detailed, story-specific prompt for an AI image generator. Describe the EXACT
scene: name the characters and their appearance, describe their posture, expression,
clothing, the specific setting from the prose, lighting, color palette, mood.
Specify an art style like "cinematic film still" or "oil painting" or "warm golden-hour
photography". This must NOT be a generic image — it must depict THIS specific moment.)
[ANNOTATION] Time period | Specific location | Emotional beat

## STRICT RULES
- This is ONE story, not four separate vignettes. Characters and plot MUST carry across scenes.
- Every tag on its OWN line. Never combine tags on one line.
- No markdown, no asterisks, no extra formatting outside the tags.
- [PROSE] must be long and immersive. Never write just 1-2 sentences.
- [IMAGE] must reference the specific characters by name/appearance and the exact scene."""


def parse_stream_blocks(text: str) -> list[dict]:
    """Parse Gemini output text into typed content blocks."""
    blocks = []
    current_type = None
    current_content = []

    for line in text.split("\n"):
        stripped = line.strip()

        if stripped.startswith("[SCENE:") or stripped.startswith("[CHAPTER:"):
            if current_type:
                blocks.append({"type": current_type, "content": "\n".join(current_content).strip()})
            current_type = "CHAPTER"
            bracket_end = stripped.find("]")
            if bracket_end != -1:
                title = stripped[bracket_end + 1:].strip()
                # Strip any tags that Gemini placed on the same line (e.g. "[PROSE]")
                title = re.sub(r'\s*\[.*', '', title).strip()
                current_content = [title]
            else:
                current_content = []

        elif stripped.startswith("[PROSE]"):
            if current_type:
                blocks.append({"type": current_type, "content": "\n".join(current_content).strip()})
            current_type = "PROSE"
            current_content = [stripped[7:].strip()]

        elif stripped.startswith("[IMAGE]"):
            if current_type:
                blocks.append({"type": current_type, "content": "\n".join(current_content).strip()})
            current_type = "IMAGE"
            current_content = [stripped[7:].strip()]

        elif stripped.startswith("[ANNOTATION]"):
            if current_type:
                blocks.append({"type": current_type, "content": "\n".join(current_content).strip()})
            current_type = "ANNOTATION"
            current_content = [stripped[12:].strip()]

        elif stripped.startswith("[AUDIO_CUE]"):
            if current_type:
                blocks.append({"type": current_type, "content": "\n".join(current_content).strip()})
            blocks.append({"type": "AUDIO_CUE", "content": ""})
            current_type = None
            current_content = []

        else:
            if current_type:
                current_content.append(line)

    if current_type and current_content:
        blocks.append({"type": current_type, "content": "\n".join(current_content).strip()})

    return blocks


def generate_image(prompt: str) -> tuple[str, str] | tuple[None, None]:
    """
    Generate an image using gemini-3.1-flash-image-preview via the standard API key.
    Returns (base64_string, mime_type) or (None, None) on failure.
    """
    try:
        response = client.models.generate_content(
            model="gemini-3.1-flash-image-preview",
            contents=(
                f"Generate a stunning cinematic literary illustration. "
                f"High detail, dramatic lighting, emotionally resonant. "
                f"Scene: {prompt}"
            ),
            config=types.GenerateContentConfig(
                response_modalities=["TEXT", "IMAGE"],
            ),
        )
        # SDK exposes parts directly on response or via candidates
        parts = getattr(response, "parts", None) or response.candidates[0].content.parts
        for part in parts:
            if part.inline_data:
                data = base64.b64encode(part.inline_data.data).decode()
                logger.info("[ImageGen] gemini-3.1-flash-image-preview succeeded (%s)", part.inline_data.mime_type)
                return data, part.inline_data.mime_type
        logger.warning("[ImageGen] No inline_data in response")
    except Exception as e:
        logger.warning("[ImageGen] Image generation failed: %s", e)
    return None, None


OUTLINE_PROMPT = """You are a story architect. Given a premise, produce a compact story blueprint.

Output EXACTLY this structure (plain text, no markdown):

CHARACTERS
Name, age, appearance, key personality trait — for each of the two main characters.

SETTING
Time period and specific place.

SCENE 1 OUTLINE
2-3 sentences: what happens, how it ends.

SCENE 2 OUTLINE
2-3 sentences: direct continuation from Scene 1. What changes or escalates.

SCENE 3 OUTLINE
2-3 sentences: the crisis or turning point that grows from Scene 2.

SCENE 4 OUTLINE
2-3 sentences: resolution that pays off Scene 3. How the characters end up.

Be specific with names, places, and cause-and-effect. This outline will be used verbatim to write the prose."""


def generate_story_text(prompt: str) -> str:
    """Two-step generation: outline first, then full prose. Returns complete tagged story text."""

    # Step 1: Generate a tight story outline to lock in characters and continuity
    logger.info("[Gemini] Step 1 — generating story outline")
    outline_resp = client.models.generate_content(
        model="gemini-2.5-flash",
        contents=[f"Story premise: {prompt}"],
        config=types.GenerateContentConfig(
            system_instruction=OUTLINE_PROMPT,
            temperature=0.8,
            max_output_tokens=1024,
        ),
    )
    outline = outline_resp.text
    logger.info("[Gemini] Outline:\n%s", outline)

    # Step 2: Write the full story, treating the outline as a hard contract
    logger.info("[Gemini] Step 2 — generating full story prose")
    user_message = (
        f"Story premise: {prompt}\n\n"
        f"STORY OUTLINE — follow this exactly. Every scene must use the same characters "
        f"and events described here:\n\n{outline}\n\n"
        f"Now write the complete 4-scene story. Each scene must:\n"
        f"- Use the exact characters from the outline (same names, same appearance)\n"
        f"- Begin where the previous scene left off\n"
        f"- Reference at least one specific event or detail from the previous scene\n"
        f"- Never re-introduce characters as if the reader hasn't met them\n\n"
        f"Begin:"
    )
    response = client.models.generate_content(
        model="gemini-2.5-flash",
        contents=[user_message],
        config=types.GenerateContentConfig(
            system_instruction=SYSTEM_PROMPT,
            temperature=0.7,
            top_p=0.85,
            max_output_tokens=8192,
        ),
    )
    return response.text
