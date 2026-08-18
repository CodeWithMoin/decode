import base64
import pathlib

HERE = pathlib.Path(__file__).parent

frames = {
    "beat-01": [("f81", "15% — the store assembles"), ("f297", "55% — the query arrives, scan begins"), ("f486", "90% — full scan, the cost lands")],
    "beat-02": [("f99", "15% — one key enters"), ("f363", "55% — three hashes set bits"), ("f594", "90% — the row never grows")],
    "beat-03": [("f90", "15% — look up three bits"), ("f330", "55% — one zero, definite no"), ("f540", "90% — all ones, probably yes")],
}
titles = {
    "beat-01": ("The lookup problem", "Why membership checks pay a full-scan price."),
    "beat-02": ("Hashing into bits", "Three hashes per key, each flips one bit."),
    "beat-03": ("The definite no", "A zero proves absence; all ones is only probably."),
}


def img(beat: str, f: str) -> str:
    data = base64.b64encode((HERE / f"{beat}_{f}.png").read_bytes()).decode()
    return f"data:image/png;base64,{data}"


rows = ""
for beat, shots in frames.items():
    name, sub = titles[beat]
    cells = "".join(
        f'<figure><img src="{img(beat, f)}" alt="{name}, {label}" loading="lazy"><figcaption>{label}</figcaption></figure>'
        for f, label in shots
    )
    rows += f"""<section>
      <header><span class="beat">{beat}</span><h2>{name}</h2><p>{sub}</p></header>
      <div class="strip">{cells}</div>
    </section>"""

html = f"""<title>Bloom Filter Contact Sheet</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Spline+Sans+Mono:wght@400;500&family=Sora:wght@400;600&display=swap">
<style>
  :root {{
    --stage: #0B0B0B; --surface: #151A21; --border: #3A4656;
    --ink: #F2F5F8; --support: #8B98A9; --accent: #55E6FF;
  }}
  body {{ background: var(--stage); color: var(--ink); font-family: Sora, system-ui, sans-serif;
         margin: 0; padding: clamp(24px, 5vw, 64px); }}
  .lede {{ max-width: 62ch; }}
  h1 {{ font-size: clamp(24px, 3.4vw, 34px); margin: 0 0 8px; text-wrap: balance; }}
  .lede p {{ color: var(--support); line-height: 1.6; margin: 0 0 12px; }}
  .verdict {{ display: inline-block; font-family: "Spline Sans Mono", monospace; font-size: 13px;
             letter-spacing: .08em; color: var(--accent); border: 1px solid var(--border);
             border-radius: 999px; padding: 6px 14px; margin-bottom: 34px; }}
  section {{ margin: 0 0 44px; }}
  header {{ display: flex; align-items: baseline; gap: 14px; flex-wrap: wrap; margin-bottom: 14px; }}
  .beat {{ font-family: "Spline Sans Mono", monospace; font-size: 12px; letter-spacing: .1em;
          color: var(--accent); }}
  h2 {{ font-size: 19px; margin: 0; }}
  header p {{ color: var(--support); margin: 0; font-size: 14px; }}
  .strip {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 14px; }}
  figure {{ margin: 0; background: var(--surface); border: 1px solid var(--border);
           border-radius: 10px; padding: 8px; }}
  img {{ width: 100%; height: auto; display: block; border-radius: 6px; }}
  figcaption {{ font-family: "Spline Sans Mono", monospace; font-size: 12px; color: var(--support);
               padding: 8px 4px 2px; }}
</style>
<div class="lede">
  <h1>Bloom Filter Contact Sheet</h1>
  <p>Nine frames from three scenes generated under the enforced gate: transparent roots over the
     one host stage, and every color from the same eight-hex project palette — cyan for the active
     thing, green for a set bit, red for a definite no, amber for a probable yes.</p>
  <span class="verdict">PASS · one palette · no furniture · no overlaps (one edge nit in beat-02)</span>
</div>
{rows}"""

(HERE / "contact-sheet.html").write_text(html)
print(len(html) // 1024, "KB")
