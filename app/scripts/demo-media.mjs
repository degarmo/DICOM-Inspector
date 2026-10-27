// Turn the frames and timeline written by e2e/demo.spec.ts into
//   demo/out/demo-silent.mp4  full walkthrough, for voiceover
//   docs/img/demo.gif         ~15 s highlight loop, at most 1000 px wide, under 8 MB
// Usage: node scripts/demo-media.mjs [--check]   (--check only verifies ffmpeg is installed)
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const OUT = join(REPO, 'demo', 'out')
const FRAMES = join(OUT, 'frames')
const MP4 = join(OUT, 'demo-silent.mp4')
const GIF = join(REPO, 'docs', 'img', 'demo.gif')
const GIF_MAX_BYTES = 8 * 1024 * 1024
const GIF_WIDTH = 1000
const GIF_FPS = 12

/** GIF highlight reel: [start beat, seconds of source, playback speed]. */
const GIF_SEGMENTS = [
  ['loaded', 1.2, 1],
  ['compared', 1, 1],
  ['full_table', 1.5, 1],
  ['scroll', 15, 6],
  ['differences_only', 2, 1],
  ['hover', 0.8, 1],
  ['priority_detail', 2.5, 1],
  ['exported', 1.2, 1],
  ['report', 2.3, 1],
]

function ffmpegOrExit() {
  try {
    execFileSync('ffmpeg', ['-hide_banner', '-version'], { stdio: 'ignore' })
  } catch {
    console.error(
      [
        'demo:capture needs ffmpeg, which was not found on PATH.',
        'Install it, then run npm run demo:capture again:',
        '  macOS:   brew install ffmpeg',
        '  Windows: winget install --id Gyan.FFmpeg   (or: choco install ffmpeg)',
        '  Linux:   sudo apt install ffmpeg',
      ].join('\n'),
    )
    process.exit(1)
  }
}

function ffmpeg(args) {
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: 'inherit' })
}

function readJson(name) {
  const path = join(OUT, name)
  if (!existsSync(path)) {
    console.error(`${path} is missing; run the capture first (npm run demo:capture).`)
    process.exit(1)
  }
  return JSON.parse(readFileSync(path, 'utf8'))
}

function buildMp4() {
  const { duration, frames: unordered } = readJson('frames.json')
  // Frames can be acknowledged out of order; play them in capture order.
  const frames = [...unordered].sort((a, b) => a.t - b.t)
  // concat demuxer: each frame shown until the next one; the last until the end.
  const lines = ['ffconcat version 1.0']
  frames.forEach((frame, index) => {
    const next = index + 1 < frames.length ? frames[index + 1].t : duration
    lines.push(`file '${join(FRAMES, frame.file)}'`, `duration ${Math.max(0.001, next - frame.t).toFixed(3)}`)
  })
  lines.push(`file '${join(FRAMES, frames[frames.length - 1].file)}'`)
  const list = join(OUT, 'frames.ffconcat')
  writeFileSync(list, `${lines.join('\n')}\n`)
  ffmpeg([
    '-f', 'concat', '-safe', '0', '-i', list,
    '-vf', 'crop=trunc(iw/2)*2:trunc(ih/2)*2:0:0,fps=30,format=yuv420p',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-movflags', '+faststart',
    MP4,
  ])
}

function buildGif() {
  const { beats } = readJson('timeline.json')
  const at = Object.fromEntries(beats.map((beat) => [beat.name, beat.t]))
  const parts = GIF_SEGMENTS.map(([beat, seconds, speed], index) => {
    if (at[beat] === undefined) throw new Error(`timeline.json has no beat '${beat}'`)
    const start = at[beat]
    return `[0:v]trim=start=${start}:duration=${seconds},setpts=(PTS-STARTPTS)/${speed}[s${index}]`
  })
  const inputs = GIF_SEGMENTS.map((_, index) => `[s${index}]`).join('')
  const filter = [
    ...parts,
    `${inputs}concat=n=${GIF_SEGMENTS.length}:v=1:a=0,fps=${GIF_FPS},scale=${GIF_WIDTH}:-1:flags=lanczos,split[a][b]`,
    '[a]palettegen=max_colors=128:stats_mode=diff[p]',
    '[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle',
  ].join(';')
  ffmpeg(['-i', MP4, '-filter_complex', filter, '-loop', '0', GIF])
}

function describe(path) {
  const seconds = Number(
    execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', path]).toString(),
  )
  const [width, height] = execFileSync('ffprobe', [
    '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', path,
  ])
    .toString()
    .trim()
    .split(',')
  const size = statSync(path).size
  console.log(`${path}: ${width}x${height}, ${seconds.toFixed(1)} s, ${(size / 1024 / 1024).toFixed(2)} MB`)
  return { seconds, width: Number(width), size }
}

ffmpegOrExit()
if (process.argv.includes('--check')) process.exit(0)

buildMp4()
buildGif()
describe(MP4)
const gif = describe(GIF)
if (gif.size >= GIF_MAX_BYTES || gif.width > GIF_WIDTH) {
  console.error(`demo.gif must be under 8 MB and at most ${GIF_WIDTH} px wide.`)
  process.exit(1)
}
