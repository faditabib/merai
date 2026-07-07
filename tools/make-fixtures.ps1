# Regenerates test video fixtures (requires ffmpeg on PATH).
# The 5s clip is committed; the 11-minute clip is for manually testing the
# 10-minute rejection path and is NOT committed (too large) — generate on demand.
param([switch]$IncludeOverlong)

$fixtures = Join-Path $PSScriptRoot "fixtures"
New-Item -ItemType Directory -Force $fixtures | Out-Null

ffmpeg -y -f lavfi -i "testsrc=duration=5:size=640x360:rate=30" `
  -f lavfi -i "sine=frequency=440:duration=5" `
  -c:v libx264 -preset veryfast -pix_fmt yuv420p -c:a aac -shortest `
  (Join-Path $fixtures "test-clip-5s.mp4")

if ($IncludeOverlong) {
  ffmpeg -y -f lavfi -i "testsrc=duration=661:size=320x180:rate=10" `
    -f lavfi -i "sine=frequency=440:duration=661" `
    -c:v libx264 -preset veryfast -crf 35 -pix_fmt yuv420p -c:a aac -b:a 32k -shortest `
    (Join-Path $fixtures "test-clip-11min.mp4")
}
