# LOME - Local Observation & Markup for Ethology

A browser-based behavioral coding tool for scoring animal behavior from video. No installation required — just open `index.html` in Chrome.

LOME is designed as a simple, free alternative to [Solomon Coder](https://solomon.andraspeter.com/) and [CowLog](https://cowlog.org/) for undergraduate researchers.

## Quick Start

1. Open `index.html` in **Google Chrome** (double-click the file)
2. Click **New Project** and enter a project name + your coder ID
3. Build your ethogram (define behaviors) or click **Load Sample Ethogram** for a pre-made mouse behavior set
4. Click **Next: Code Video** and load an MP4 video file
5. Press keyboard shortcuts to code behaviors as the video plays
6. Click **Export CSV** when finished

## Features

### Ethogram Builder
- Define behaviors with a name, category, type (point or state), keyboard shortcut, and color
- **Point events** mark a single moment in time (e.g., a jump)
- **State events** have a duration — press the key to start, press again to stop (e.g., grooming)
- Save/load ethograms as JSON files to share with other coders
- Includes a sample mouse home cage ethogram with 8 common behaviors

### Video Coding
- Load any MP4 video file from your computer (the file stays on your machine — nothing is uploaded)
- Keyboard-driven coding for speed, or click the behavior buttons
- Active state events glow to show they're recording
- Undo with Ctrl+Z (Cmd+Z on Mac)
- Auto-saves your work to the browser's local storage

### Timeline
- Color-coded bars show all coded behaviors over time
- Click anywhere on the timeline to seek the video
- Scroll to zoom in/out

### CSV Export
Exports a standard CSV file with these columns:

| Column | Description |
|--------|-------------|
| onset_sec | Start time in seconds |
| offset_sec | End time in seconds (blank for point events) |
| duration_sec | Duration in seconds |
| onset_time | Start time as MM:SS.mmm |
| offset_time | End time as MM:SS.mmm |
| behavior | Behavior name |
| category | Behavior category |
| type | "point" or "state" |
| coder_id | Your coder ID |
| video_file | Video filename |

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| Space | Play / Pause |
| , | Step back one frame |
| . | Step forward one frame |
| Left arrow | Seek back 5 seconds |
| Right arrow | Seek forward 5 seconds |
| Ctrl+Z | Undo last action |
| ? | Show help overlay |
| a-z, 0-9 | Code behavior (as defined in your ethogram) |

## Sample Ethogram (Mouse Home Cage)

| Key | Behavior | Category | Type |
|-----|----------|----------|------|
| L | Locomotion | Locomotion | State |
| R | Rearing | Exploration | State |
| G | Grooming | Maintenance | State |
| F | Feeding | Feeding | State |
| D | Digging | Exploration | State |
| E | Resting | Resting | State |
| Z | Freezing | Anxiety | State |
| J | Jump | Locomotion | Point |

## Browser Support

- **Recommended:** Google Chrome (latest)
- Works in Firefox, Safari, and Edge
- Video format support depends on your browser — MP4 (H.264) works everywhere
- On iPad: works best with a physical keyboard; for full functionality, host the files on a web server (e.g., GitHub Pages) rather than opening from the Files app

## Technical Details

- Pure HTML/CSS/JavaScript — no build tools, no server, no dependencies to install
- Two vendored libraries: [Papa Parse](https://www.papaparse.com/) (CSV) and [VideoFrame.js](https://github.com/allensarkisyan/VideoFrame) (frame stepping)
- All data stored in your browser's localStorage
- Works from the `file://` protocol (just double-click `index.html`)

## File Structure

```
lome/
  index.html              Entry point
  css/style.css           Stylesheet
  js/
    utils.js              Helper functions
    store.js              localStorage persistence
    ethogram.js           Ethogram builder
    coder.js              Video coding engine
    timeline.js           Canvas timeline
    exporter.js           CSV export
    app.js                App orchestrator
  vendor/
    papaparse.min.js      CSV library
    VideoFrame.min.js     Frame-accurate seeking
  sample/
    sample-ethogram.json  Mouse behavior ethogram
```

## Tips for Coders

- **Code one behavior at a time.** Watch the full video coding only locomotion, then watch again for grooming, etc. This is faster and more accurate than coding everything at once.
- **Use keyboard shortcuts** rather than clicking buttons — it lets you keep your eyes on the video.
- **Save your ethogram as JSON** and share it with all coders on your project so everyone uses the same coding scheme.
- **Export frequently.** While auto-save protects against accidental tab closure, exporting a CSV or project JSON gives you a permanent backup.

## License

MIT
