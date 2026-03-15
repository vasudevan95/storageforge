"""
CreativeDirectorAgent — a 5-call agent that plans then generates each scene individually.

Call 1 (PLAN):     Gemini JSON-mode → structured creative plan
Call 2 (SCENE 1):  Gemini streaming → Scene 1 (plan + premise as context)
Call 3 (SCENE 2):  Gemini streaming → Scene 2 (plan + Scene 1 prose as context)
Call 4 (SCENE 3):  Gemini streaming → Scene 3 (plan + Scenes 1-2 prose as context)
Call 5 (SCENE 4):  Gemini streaming → Scene 4 (plan + Scenes 1-3 prose as context)

Each scene call sees the plan AND all prior scenes, enforcing continuity.
"""

import json
import logging
import os
from pathlib import Path
from typing import AsyncIterator

from dotenv import load_dotenv
from google import genai
from google.genai import types

from gemini_pipeline import parse_stream_blocks

base_dir = Path(__file__).resolve().parent
load_dotenv(dotenv_path=base_dir / ".env")

logger = logging.getLogger(__name__)

client = genai.Client(api_key=os.environ.get("GOOGLE_API_KEY"))

PLAN_MODEL = "gemini-2.5-flash"
STORY_MODEL = "gemini-2.5-flash"

# ── Phase 1: Planning prompt ────────────────────────────────────────────────

PLAN_SYSTEM_PROMPT = """You are StoryForge's Creative Director. Your job is to analyze a story
premise and produce a detailed creative plan that will guide the writing of a single seamless
narrative told across 4 scenes — same timeline, same characters, no scene is a fresh start.

CRITICAL: The story MUST match the user's premise exactly. If they say "train love story in
future", every aspect of your plan must be about a love story set on a futuristic train.
Do NOT invent fantasy worlds, medieval settings, or unrelated genres. Stay true to the premise.

You must invent specific, memorable characters with full names, ages, physical descriptions,
and personality traits that FIT the premise. Plan a continuous narrative arc across exactly
4 scenes with clear cause-and-effect progression. Each scene picks up exactly where the
previous one left off — no time jumps, no chapter restarts. Choose an art direction that
fits the story's mood and era AS DESCRIBED IN THE PREMISE.

Respond with valid JSON matching the required schema exactly. Be specific and creative —
but always faithful to the user's premise."""

PLAN_SCHEMA = {
    "type": "object",
    "properties": {
        "title": {"type": "string", "description": "An evocative story title that reflects the premise"},
        "premise_interpretation": {
            "type": "string",
            "description": "How you interpret the user's premise — genre, setting, era, mood",
        },
        "protagonist": {
            "type": "object",
            "properties": {
                "name": {"type": "string"},
                "age": {"type": "string"},
                "appearance": {"type": "string", "description": "Detailed physical description fitting the story's era/setting"},
                "personality": {"type": "string"},
                "arc": {"type": "string", "description": "How this character changes across the story"},
            },
            "required": ["name", "age", "appearance", "personality", "arc"],
        },
        "deuteragonist": {
            "type": "object",
            "properties": {
                "name": {"type": "string"},
                "age": {"type": "string"},
                "appearance": {"type": "string"},
                "personality": {"type": "string"},
                "arc": {"type": "string"},
            },
            "required": ["name", "age", "appearance", "personality", "arc"],
        },
        "scenes": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "number": {"type": "integer"},
                    "title": {"type": "string"},
                    "setting": {"type": "string", "description": "Specific location/environment for this scene"},
                    "key_events": {"type": "string"},
                    "emotional_arc": {"type": "string"},
                    "continues_from": {"type": "string", "description": "Exact story state entering this scene — what just happened, who is present, where they are"},
                },
                "required": ["number", "title", "setting", "key_events", "emotional_arc", "continues_from"],
            },
        },
        "art_direction": {
            "type": "object",
            "properties": {
                "visual_style": {"type": "string", "description": "e.g. cinematic sci-fi film still, retro-futurism illustration"},
                "color_palette": {"type": "string", "description": "Dominant colors and mood"},
                "era_details": {"type": "string", "description": "Period-specific visual details (technology, fashion, architecture)"},
            },
            "required": ["visual_style", "color_palette", "era_details"],
        },
        "themes": {
            "type": "array",
            "items": {"type": "string"},
        },
    },
    "required": ["title", "premise_interpretation", "protagonist", "deuteragonist", "scenes", "art_direction", "themes"],
}

# ── Per-chapter generation prompt ───────────────────────────────────────────

CHAPTER_SYSTEM_TEMPLATE = """You are StoryForge — a world-class fiction author. The Creative Director
has planned this story. You are continuing the story — Scene {scene_num}.

## USER'S ORIGINAL PREMISE
{user_premise}

## CREATIVE PLAN
{plan_json}

## YOUR ASSIGNMENT: SCENE {scene_num}
Title: {chapter_title}
Setting: {chapter_setting}
Continues from: {scene_continues_from}
Key events: {chapter_events}
Emotional arc: {chapter_emotional_arc}

## CHARACTER REFERENCE
Protagonist: {prot_name} — {prot_appearance}. {prot_personality}
Deuteragonist: {deut_name} — {deut_appearance}. {deut_personality}

## ART DIRECTION
Style: {art_style}
Palette: {art_palette}
Era details: {art_era}

{previous_chapters_section}

## WRITING STYLE
Write like literary fiction. Every paragraph must be rich with:
- Sensory detail: smells, textures, sounds, the quality of light
- Internal thought: what the characters feel, fear, remember
- Specific nouns that match the story's era and setting
- Each [PROSE] section must be 3-4 FULL paragraphs (each paragraph 4-6 sentences minimum)

## OUTPUT FORMAT
Output EXACTLY ONE scene using this EXACT tag structure, one tag per line:

[SCENE:{scene_num}] {chapter_title}
[PROSE] (3-4 paragraphs of rich narrative prose — DO NOT write a chapter heading style opening.
Begin mid-action, as if the reader has been watching continuously.)
[IMAGE] (A detailed prompt for an AI image generator. Describe the EXACT scene from this
moment using the characters' physical appearances. Include: specific setting details from
the prose, character posture/expression/clothing, lighting, mood. Art style: {art_style}.
Color palette: {art_palette}. This must depict THIS specific moment, not a generic image.)
[ANNOTATION] Time period | Specific location from the plan | Emotional beat

## STRICT RULES
- Stay FAITHFUL to the premise: "{user_premise}"
- Use the EXACT character names and appearances from the plan
- Follow the scene outline (setting, events, emotional arc) precisely
- [IMAGE] must describe characters matching the plan's appearance, in the correct setting/era
- Every tag on its OWN line. No markdown, no asterisks, no extra formatting
- [PROSE] must be long and immersive. Never write just 1-2 sentences
- Continue from the EXACT moment described in "Continues from" — same sentence style, same characters on-screen
- Do NOT reintroduce characters as if the reader is meeting them for the first time"""


def _format_plan_summary(plan: dict) -> str:
    """Create a human-readable summary of the plan for the frontend PLANNING card."""
    lines = []
    lines.append(f"**{plan.get('title', 'Untitled')}**")
    lines.append("")

    interp = plan.get("premise_interpretation", "")
    if interp:
        lines.append(f"Vision: {interp}")
        lines.append("")

    prot = plan.get("protagonist", {})
    deut = plan.get("deuteragonist", {})
    lines.append(f"Protagonist: {prot.get('name', '?')} — {prot.get('personality', '')}")
    lines.append(f"Deuteragonist: {deut.get('name', '?')} — {deut.get('personality', '')}")
    lines.append("")

    for sc in plan.get("scenes", []):
        lines.append(f"· {sc.get('title', '')} — {sc.get('emotional_arc', '')}")

    art = plan.get("art_direction", {})
    lines.append("")
    lines.append(f"Art style: {art.get('visual_style', '')} | {art.get('color_palette', '')}")

    themes = plan.get("themes", [])
    if themes:
        lines.append(f"Themes: {', '.join(themes)}")

    return "\n".join(lines)


def _build_previous_chapters_section(prior_scenes: list[str]) -> str:
    """Build the context section containing all previously generated scenes."""
    if not prior_scenes:
        return "## PREVIOUS SCENES\nThis is Scene 1 — the opening of the story. Begin with immediacy."

    section = "## PREVIOUS SCENES (continue from the exact moment these left off)\n"
    for i, sc_text in enumerate(prior_scenes, 1):
        section += f"\n--- Scene {i} ---\n{sc_text}\n"
    section += "\n--- End of previous scenes ---\n"
    section += "Continue the story directly from where Scene {} ended. Match the tone and sentence rhythm of the previous scene exactly. Same characters, same timeline, no restarts.".format(len(prior_scenes))
    return section


class CreativeDirectorAgent:
    """Five-call story generation agent: 1 plan + 4 individual scene calls."""

    def __init__(self, user_prompt: str):
        self.user_prompt = user_prompt
        self.plan: dict = {}
        self.generated_scenes: list[str] = []  # Raw prose text of each completed scene

    async def _plan(self) -> AsyncIterator[dict]:
        """Call 1: Generate a structured creative plan via JSON-mode Gemini call."""
        logger.info("[Agent] Call 1/5: Planning with %s", PLAN_MODEL)

        response = client.models.generate_content(
            model=PLAN_MODEL,
            contents=(
                f"Story premise: {self.user_prompt}\n\n"
                f"Create a detailed creative plan for this story. Remember: the plan must be "
                f"faithful to the premise above — match its genre, setting, and era exactly."
            ),
            config=types.GenerateContentConfig(
                system_instruction=PLAN_SYSTEM_PROMPT,
                response_mime_type="application/json",
                response_schema=PLAN_SCHEMA,
                temperature=0.9,
            ),
        )

        plan_text = response.text
        self.plan = json.loads(plan_text)
        logger.info("[Agent] Plan created: %s (%d scenes)", self.plan.get("title"), len(self.plan.get("scenes", [])))

        # Yield a PLANNING block for the frontend
        summary = _format_plan_summary(self.plan)
        yield {"type": "PLANNING", "content": summary}

    async def _generate_scene(self, scene_num: int) -> AsyncIterator[dict]:
        """Generate a single scene with plan + prior scenes as context."""
        scenes_list = self.plan.get("scenes", [])
        sc_plan = next((s for s in scenes_list if s.get("number") == scene_num), None)
        if not sc_plan:
            logger.error("[Agent] No scene %d in plan", scene_num)
            return

        logger.info("[Agent] Call %d/5: Generating Scene %d with %s", scene_num + 1, scene_num, STORY_MODEL)

        prot = self.plan.get("protagonist", {})
        deut = self.plan.get("deuteragonist", {})
        art = self.plan.get("art_direction", {})

        system_prompt = CHAPTER_SYSTEM_TEMPLATE.format(
            scene_num=scene_num,
            user_premise=self.user_prompt,
            plan_json=json.dumps(self.plan, indent=2),
            chapter_title=sc_plan.get("title", ""),
            chapter_setting=sc_plan.get("setting", ""),
            chapter_events=sc_plan.get("key_events", ""),
            chapter_emotional_arc=sc_plan.get("emotional_arc", ""),
            scene_continues_from=sc_plan.get("continues_from", "Beginning of the story."),
            prot_name=prot.get("name", ""),
            prot_appearance=prot.get("appearance", ""),
            prot_personality=prot.get("personality", ""),
            deut_name=deut.get("name", ""),
            deut_appearance=deut.get("appearance", ""),
            deut_personality=deut.get("personality", ""),
            art_style=art.get("visual_style", "cinematic film still"),
            art_palette=art.get("color_palette", ""),
            art_era=art.get("era_details", ""),
            previous_chapters_section=_build_previous_chapters_section(self.generated_scenes),
        )

        user_message = (
            f"Write Scene {scene_num} of the story now. "
            f"Premise: \"{self.user_prompt}\". "
            f"Follow the Creative Director's plan exactly."
        )

        buffer = ""
        emitted_count = 0
        scene_prose = ""

        for chunk in client.models.generate_content_stream(
            model=STORY_MODEL,
            contents=[user_message],
            config=types.GenerateContentConfig(
                system_instruction=system_prompt,
                temperature=0.9,
            ),
        ):
            if not chunk.candidates:
                continue
            for part in chunk.candidates[0].content.parts:
                if part.text:
                    buffer += part.text
                    blocks = parse_stream_blocks(buffer)
                    for block in blocks[emitted_count:]:
                        emitted_count += 1
                        if block["type"] == "PROSE":
                            scene_prose = block["content"]
                        yield block

        # Flush remaining buffer
        blocks = parse_stream_blocks(buffer)
        for block in blocks[emitted_count:]:
            if block["type"] == "PROSE":
                scene_prose = block["content"]
            yield block

        # Store this scene's prose for subsequent calls
        self.generated_scenes.append(scene_prose)
        logger.info("[Agent] Scene %d complete (%d chars of prose)", scene_num, len(scene_prose))

    async def run(self) -> AsyncIterator[dict]:
        """Orchestrate all 5 calls: plan → scene1 → scene2 → scene3 → scene4."""
        # Call 1: Plan
        async for block in self._plan():
            yield block

        # Calls 2-5: Generate each scene individually
        for scene_num in range(1, 5):
            async for block in self._generate_scene(scene_num):
                yield block
