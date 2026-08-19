"""Manim spike: gpt-5.6-luna authors Manim CE scenes for the same DNS beats
the Remotion renderer produced, so the two substrates can be judged side by
side on identical narration."""

import os
import re
import sys

sys.path.insert(0, "/Users/moinuddinshaik/Downloads/decode/apps/backend")
from dotenv import dotenv_values  # backend venv has it (pydantic-settings dep)

env = dotenv_values("/Users/moinuddinshaik/Downloads/decode/apps/backend/.env")
from openai import OpenAI

client = OpenAI(api_key=env["DECODE_OPENAI_API_KEY"])

BEATS = [
    {
        "name": "beat02",
        "title": "Connections need a destination",
        "objective": "Explain why a website request cannot begin with only a memorable domain name.",
        "seconds": 26,
        "narration": "That distinction explains why a request cannot begin with only a memorable name. You can ask for example.com because names are convenient for people. But the network cannot direct a connection from that label alone. It needs the destination associated with the name. Resolving the name supplies that missing step. It turns a request that expresses what you want into one the network can act on.",
    },
    {
        "name": "beat03",
        "title": "DNS acts as the resolver",
        "objective": "Explain that DNS connects a domain name with the destination used to reach its website.",
        "seconds": 24,
        "narration": "DNS is the naming system that performs this lookup. It connects a domain name, such as example.com, with the network destination associated with its website. In that sense, DNS works like a translator between a human-friendly label and information the network can use. The important result is simple: people can remember names, while DNS resolves those names into destinations. You do not need to memorize the destination yourself.",
    },
]

PROMPT = """Write one Manim Community Edition scene class named {cls} for an educational video beat.

Beat: {title}
It must teach: {objective}
The narration spoken over it ({seconds} seconds — the scene's animations must fill exactly this duration, spread across it):
\"{narration}\"

Rules:
- Manim CE current API. from manim import *  — one class {cls}(Scene), config-independent.
- self.camera.background_color = "#0B0B0B". Palette: surfaces #232323, borders/strokes #484848, primary text #F0F6F1, support text #8A8A86, the single accent #F2A47B. No other hues.
- Use Text() only — NEVER Tex/MathTex (no LaTeX available).
- Build the scene cumulatively: once something appears it stays (dim with .set_opacity, never FadeOut) so the final frame holds the whole diagram.
- Time the reveals to the narration's ideas in order, using self.play(run_time=...) and self.wait(...) so total duration is {seconds}s.
- Show the mechanism visually (boxes, arrows, transforms), keep on-screen words to short labels. Fill the frame; generous but not empty.
Return ONLY the Python code."""

for beat in BEATS:
    cls = beat["name"].capitalize()
    response = client.responses.create(
        model="gpt-5.6-luna",
        input=PROMPT.format(cls=cls, **beat),
    )
    code = response.output_text
    code = re.sub(r"^```(python)?|```$", "", code.strip(), flags=re.MULTILINE).strip()
    path = f"/Users/moinuddinshaik/.claude/jobs/541cf0fa/tmp/manim_{beat['name']}.py"
    open(path, "w").write(code + "\n")
    print("wrote", path, len(code), "chars")
