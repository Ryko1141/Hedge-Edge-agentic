---
name: video-production
description: |
  Manages the full video production pipeline for Hedge Edge: scripting structure,
  screen recording workflows for MT5/cTrader/Electron app, FFmpeg-based editing
  and processing, thumbnail design via Canva, audio optimization, caption
  generation, and batch production workflows. Use when producing, editing, or
  post-processing any video content.
---

# Video Production

## Objective

Produce professional-quality video content that demonstrates Hedge Edge's product, teaches hedging concepts, and builds trust with prop firm traders  all at a sustainable production pace. Maintain a batch-production workflow that generates 4-8 polished videos per cycle with minimal per-video effort through templates, automation, and reusable assets.

## When to Use This Skill

- When setting up a screen recording session for MT5, cTrader, or the Hedge Edge Electron app
- When editing raw footage into a polished video using FFmpeg
- When creating thumbnails for YouTube or social media via Canva
- When extracting clips from long-form videos for Shorts or Reels
- When adding captions, text overlays, or visual effects to video content
- When optimizing audio (noise reduction, level normalization, music mixing)
- When batch-producing multiple videos in a single production cycle
- When converting video formats for different platforms (horizontal  vertical, bitrate adjustments)
- When creating animated diagrams, equity curve visualizations, or other explanatory visuals

## Input Specification

| Input | Type | Required | Description |
|-------|------|----------|-------------|
| action | string | Yes | `record-setup`, `edit`, `thumbnail`, `extract-clip`, `add-captions`, `optimize-audio`, `batch-produce`, `convert-format`, `create-visual` |
| source_video_path | string | No | Path to source video file (required for editing actions) |
| output_path | string | No | Desired output file path. Default: auto-generated in project output directory |
| video_type | string | No | `tutorial`, `walkthrough`, `explainer`, `shorts`, `reel`, `testimonial`, `announcement` |
| thumbnail_text | string | No | Text to overlay on thumbnail (for `thumbnail` action) |
| thumbnail_style | string | No | `dramatic`, `clean`, `data-focused`, `before-after`. Default: `dramatic` |
| clip_start | string | No | Start timestamp for clip extraction, format: `HH:MM:SS` or seconds |
| clip_end | string | No | End timestamp for clip extraction |
| caption_file | string | No | Path to SRT/VTT caption file (for `add-captions`) |
| target_platform | string | No | `youtube`, `youtube-shorts`, `instagram-reel`, `instagram-post`, `linkedin` |
| batch_items | list[object] | No | List of video items for batch production, each with script reference and assets |

## Step-by-Step Process

### Phase 1: Recording Setup

**Screen recording configuration for trading software demos:**

1. **MT5/MetaTrader 5 recording setup**:
   - Resolution: 1920x1080 (full HD), 60fps for smooth chart animation
   - Clean the MT5 workspace: remove unnecessary toolbars, set chart to clean template
   - Load Hedge Edge EA onto a demo account with visible trade history
   - Prepare demo scenario: pre-planned trades to execute during recording
   - Display key elements: trade journal, equity curve, account balance, open positions
   - Use a consistent MT5 color scheme that matches Hedge Edge branding (dark theme preferred)

2. **Hedge Edge Electron app recording**:
   - Resolution: 1920x1080, 60fps
   - Show full app window with all panels visible
   - Prepare test accounts: at least one prop account + one hedge account connected
   - Stage a live demonstration: open a position on prop account, show instant hedge execution
   - Highlight key UI elements: account overview, trade log, hedge status indicators

3. **Webcam/presenter recording** (optional overlay):
   - 720p webcam feed, positioned bottom-right corner
   - Clean background or green screen
   - Good lighting (ring light or key/fill setup)
   - Consistent framing (chest up, centered)

4. **Audio setup**:
   - External microphone preferred (USB condenser or lapel mic)
   - Record at 48kHz sample rate, 16-bit
   - Record in quiet environment; use noise gate if needed
   - Keep audio and video in sync (clap sync or software sync)

**Recording software recommendations**:
- OBS Studio (free, screen + webcam composite)
- Windows Game Bar (quick screen capture)
- Separate audio recording via Audacity for higher quality

### Phase 2: Video Editing with FFmpeg

**Standard editing pipeline:**

1. **Import and organize**:
   `
   raw/
     screen-recording.mp4
     webcam.mp4
     audio.wav
     assets/
       intro-animation.mp4
       outro-animation.mp4
       lower-third.png
       logo-watermark.png
   `

2. **Basic assembly** (FFmpeg commands):

   **Trim footage**:
   `ffmpeg -i input.mp4 -ss 00:00:30 -to 00:15:00 -c copy trimmed.mp4`

   **Combine screen recording + webcam overlay**:
   `ffmpeg -i screen.mp4 -i webcam.mp4 -filter_complex "[1:v]scale=320:240[pip];[0:v][pip]overlay=W-w-20:H-h-20" -c:a copy output.mp4`

   **Add intro/outro**:
   `ffmpeg -f concat -i filelist.txt -c copy assembled.mp4`
   (filelist.txt contains: file 'intro.mp4' / file 'main.mp4' / file 'outro.mp4')

   **Add logo watermark**:
   `ffmpeg -i input.mp4 -i logo.png -filter_complex "overlay=W-w-20:20:enable='between(t,5,999)'" -c:a copy watermarked.mp4`

   **Normalize audio levels**:
   `ffmpeg -i input.mp4 -af loudnorm=I=-16:TP=-1.5:LRA=11 -c:v copy normalized.mp4`

3. **Advanced editing**:

   **Speed ramp** (speed up boring sections):
   `ffmpeg -i input.mp4 -filter:v "setpts=0.5*PTS" -filter:a "atempo=2.0" fast.mp4`

   **Picture-in-picture with rounded corners**:
   `ffmpeg -i bg.mp4 -i pip.mp4 -filter_complex "[1:v]scale=400:225,format=yuva420p,geq=lum='p(X,Y)':a='if(gt(abs(X-W/2),W/2-20)*gt(abs(Y-H/2),H/2-20),0,255)'[pip];[0:v][pip]overlay=50:50" output.mp4`

   **Add background music** (low volume under voice):
   `ffmpeg -i voice.mp4 -i music.mp3 -filter_complex "[1:a]volume=0.15[bg];[0:a][bg]amix=inputs=2:duration=first" -c:v copy mixed.mp4`

### Phase 3: Clip Extraction for Shorts/Reels

1. **Identify clip-worthy moments** from the full video:
   - The single most compelling 30-60 second segment
   - A surprising stat or revelation
   - A visual "aha moment" (e.g., watching the hedge execute in real-time)
   - A controversial or contrarian take that stands alone

2. **Extract and reformat**:

   **Extract clip**:
   `ffmpeg -i full-video.mp4 -ss 00:05:30 -to 00:06:15 -c copy clip.mp4`

   **Convert to vertical (9:16) for Shorts/Reels**:
   `ffmpeg -i clip.mp4 -vf "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:black" vertical.mp4`

   **Add top/bottom text bars for context**:
   `ffmpeg -i vertical.mp4 -vf "drawtext=text='How to Hedge a $100K FTMO Challenge':fontsize=40:fontcolor=white:x=(w-text_w)/2:y=100:fontfile=arial.ttf" captioned.mp4`

3. **Shorts/Reels specifications**:
   - Duration: 15-60 seconds (sweet spot: 30-45 seconds)
   - Aspect ratio: 9:16 (1080x1920)
   - Hook within first 2 seconds
   - Auto-captions always enabled (80%+ viewers watch muted)
   - End with a clear next step: "Follow for more" or "Full video linked above"

### Phase 4: Thumbnail Design via Canva

1. **Thumbnail principles for trading content**:
   - **High contrast**: Dark background with bright text and elements
   - **Readable at mobile size**: Test at 168x94px (YouTube mobile thumbnail)
   - **3-element rule**: Face/reaction (optional), text headline, visual proof (chart/screenshot)
   - **Emotional trigger**: Curiosity, fear of missing out, or problem recognition
   - **Brand consistency**: Hedge Edge logo in corner, consistent color palette

2. **Thumbnail templates** (via Canva API):

   **Template A  "Dramatic Result"**:
   - Dark gradient background (Hedge Edge brand colors)
   - Large bold text: "I HEDGED MY $100K FTMO CHALLENGE"
   - Equity curve screenshot showing before/after
   - Hedge Edge logo bottom-right

   **Template B  "Step-by-Step"**:
   - Clean dark background
   - Numbered steps visible: "3 Steps to..."
   - MT5 screenshot with highlighted UI elements
   - Arrow or circle annotations pointing to key areas

   **Template C  "Versus/Comparison"**:
   - Split layout: left (red/loss) vs right (green/profit)
   - "WITHOUT Hedge Edge" vs "WITH Hedge Edge"
   - Contrasting equity curves or P&L numbers
   - Bottom text: prop firm names (FTMO, The5%ers)

   **Template D  "Data/Stats"**:
   - Central large number or stat ("85% FAIL")
   - Supporting text below
   - Chart or data visualization in background
   - Clean, professional, data-journalism aesthetic

3. **Canva API workflow**:
   - Authenticate with `CANVA_API_KEY`
   - Select base template by thumbnail style
   - Inject dynamic text (video title, stats)
   - Inject screenshot/image assets
   - Export at 1280x720px, JPG, <2MB
   - A/B test 2 thumbnails per video when possible

### Phase 5: Audio Optimization

1. **Noise reduction**:
   `ffmpeg -i input.mp4 -af "afftdn=nf=-25" denoised.mp4`

2. **Loudness normalization** (YouTube standard: -14 LUFS):
   `ffmpeg -i input.mp4 -af loudnorm=I=-14:TP=-1.5:LRA=11 normalized.mp4`

3. **De-essing** (reduce sibilance):
   `ffmpeg -i input.mp4 -af "equalizer=f=6000:t=q:w=1:g=-6" deessed.mp4`

4. **Background music mixing**:
   - Music volume: -18dB below voice
   - Fade in over 3 seconds at intro
   - Fade out over 3 seconds at outro
   - Duck under voice sections, slightly louder during transitions

### Phase 6: Caption Generation

1. **Generate captions**:
   - Use OpenAI Whisper API or local Whisper model for speech-to-text
   - Output format: SRT (YouTube) or VTT (web)
   - Review and correct trading-specific terms: "FTMO", "MetaTrader", "Hedge Edge", "drawdown", "pip"

2. **Burn captions into video** (for Shorts/Reels where platform captions aren't available):
   `ffmpeg -i input.mp4 -vf "subtitles=captions.srt:force_style='FontName=Arial,FontSize=24,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,Outline=2,Alignment=2'" captioned.mp4`

3. **Caption styling for Shorts/Reels**:
   - Centered, bottom third of frame
   - White text with black outline (maximum readability)
   - 2-3 words per line maximum
   - Highlight key terms in brand accent color

### Phase 7: Batch Production Workflow

1. **Batch cycle** (recommended biweekly):
   - **Day 1**: Script 4-6 videos (use content-creation skill)
   - **Day 2**: Record all screen captures and voiceovers in one session
   - **Day 3-4**: Edit all videos (assembly, overlays, audio)
   - **Day 5**: Create all thumbnails, extract all shorts clips
   - **Day 6**: Review, caption, and finalize all videos
   - **Day 7**: Upload all to YouTube (scheduled), schedule all derivatives

2. **Batch FFmpeg processing** (process all videos with consistent settings):
   `
   for f in raw/*.mp4; do
     ffmpeg -i "$" -af loudnorm=I=-14:TP=-1.5:LRA=11 \
       -vf "movie=logo.png[wm];[in][wm]overlay=W-w-20:20" \
       "processed/$(basename $)"
   done
   `

3. **Asset reuse**:
   - Intro/outro animations: same across all videos (update quarterly)
   - Lower-third template: consistent name/title card
   - Music library: 5-10 approved tracks rotated across videos
   - Transition effects: standardized set (cut, dissolve, wipe)

## Output Specification

- **Record Setup**: Returns detailed recording configuration checklist with software settings, demo scenario plan, and asset requirements
- **Edit**: Returns processed video file at output path with edit log (operations performed, duration, resolution)
- **Thumbnail**: Returns Canva design URL and exported thumbnail file (1280x720 JPG)
- **Extract Clip**: Returns vertical clip file ready for Shorts/Reels upload with duration and format confirmation
- **Add Captions**: Returns captioned video file and SRT/VTT file for platform upload
- **Optimize Audio**: Returns audio-optimized video with loudness report (LUFS measurement, noise floor)
- **Batch Produce**: Returns production summary: videos completed, total duration, thumbnails created, clips extracted, and next steps
- **Convert Format**: Returns converted video file with format specification confirmation
- **Create Visual**: Returns animated/static visual asset (equity curve animation, diagram, data visualization)

## API & Platform Requirements

| Platform | API/Tool | Env Variable | Purpose |
|----------|----------|--------------|---------|
| FFmpeg | FFmpeg CLI | N/A (local install) | Video editing, audio processing, format conversion, clip extraction, caption burning |
| Canva | Canva API | `CANVA_API_KEY` | Thumbnail design, visual templates, brand asset management |
| OpenAI | OpenAI API | `OPENAI_API_KEY` | Whisper transcription for captions, script assistance |
| OBS Studio | OBS CLI/API | N/A (local install) | Screen recording automation |

## Quality Checks

- All videos exported at minimum 1080p (1920x1080) at 30fps or higher
- Audio normalized to -14 LUFS for YouTube, -16 LUFS for social platforms
- Thumbnails are 1280x720px, under 2MB, and readable at mobile thumbnail size (168x94px)
- Every Shorts/Reels clip has burned-in captions and a hook within the first 2 seconds
- Hedge Edge logo watermark present on all video content (after intro, persistent)
- No copyrighted music used  only royalty-free or licensed tracks from approved library
- Screen recordings show clean MT5/app interfaces with no personal data, real account numbers, or sensitive information visible
- Vertical content is properly formatted at 9:16 (1080x1920) with no letterboxing artifacts
- Batch production cycles produce at least 4 publish-ready videos per cycle
- All raw footage is backed up before editing begins
- Trading terminology is correctly spelled in all captions (FTMO, MetaTrader, cTrader, Hedge Edge  never misspelled)
- Color grading is consistent across all videos in a batch (same LUT or color profile)
