"""Create the site's silent background reel from synthetic demo recordings."""
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "backend"))
from app import ffmpeg

sources = [ROOT / f"outputs/linkedin/cena-{index:02}.mp4" for index in (3, 4, 5)]
if not all(source.is_file() for source in sources):
    raise SystemExit("Generate the local application demonstration before rebuilding this asset.")
inputs = []
for source in sources:
    inputs.extend(["-ss", "2", "-t", "4", "-i", str(source)])
graph = ";".join(
    f"[{index}:v]crop=1600:900:160:88,scale=1280:720,fps=24,setsar=1,settb=AVTB,setpts=PTS-STARTPTS[v{index}]"
    for index in range(3)
)
graph += ";[v0][v1][v2]concat=n=3:v=1:a=0,fade=t=in:d=0.3,fade=t=out:st=11.7:d=0.3,format=yuv420p[v]"
subprocess.run([
    ffmpeg(), "-y", "-v", "error", *inputs, "-filter_complex_threads", "1",
    "-filter_complex", graph, "-map", "[v]", "-an", "-t", "12",
    "-c:v", "libx264", "-preset", "fast", "-crf", "27", "-threads", "2",
    "-movflags", "+faststart", str(ROOT / "docs/assets/editor-reel.mp4"),
], check=True)
print("Silent website reel ready.")
