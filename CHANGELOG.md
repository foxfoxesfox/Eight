# Changelog

What changed in Eight, newest first. Dates are when the work was committed. The app has no numbered releases yet; `package.json` stays at 0.1.0 until the first public one.

## Unreleased

**Added**
- Video as a routine's music: MP4, MOV or WebM plays beside the stage in step with the formations, with Mirror video and Hide video.
- A song file can supply the waveform for a video, with an offset to line the two up. Useful for videos over 300 MB, which have no waveform of their own, and for a cleaner waveform than a room recording gives.
- Export window in place of the dropdown: routine file, picture, PDF sheets or video, each with a line saying what you get.
- Video export options: 720p or 1080p, the routine's video beside the formations, mirrored or not.
- A storage check before saving a song or video, and plain messages about file limits.
- README banner, poster, a 20-second promo video and this changelog.
- The song or video is a track on the timeline: its name and volume sit at the start of its row, and clicking it (or right-clicking the waveform) opens volume, replace and remove. An empty row offers "Add music or video".
- Drag a song, video or routine file onto the editor to add or open it. A message shows while a large file is read, and Replace swaps the song or video without removing it first.
- Trimming: drag either end of the song or video's waveform, or trim the start or end to the playhead from its menu, to use only part of the file. Playback, the waveform, preview and video export all follow the trim, and "Restore the full length" undoes it.
- Preview: a full-screen run-through of the routine, like a presenter view, with the stage (and video), the formation, count and notes, what comes next, and arrow keys between formations.
- Resizable workspace: drag the side panels, the timeline and the divider between the stage and the video; hide either side panel. The layout is remembered in the browser.
- Props can be a rectangle, oval, triangle, diamond or hexagon.
- Right-click a dancer or prop, on the stage or in the list, for colour, offstage, back to its spot in the formation before, straighten its path, or remove. With several selected it acts on all of them.
- A user guide and FAQ in `docs/GUIDE.md`, shown inside the app on a Help page linked from every screen.
- The app asks the browser to keep its saved routines when disk space runs low.
- `npm run e2e`: 59 end-to-end checks of every screen and feature, in headless Chrome and optionally Safari. `npm run e2e:open` serves the same checks as a web page to run from any browser.

**Changed**
- Dancers and props share eight standard colours plus the colour picker (was twelve).
- "Add formation" is a slot at the end of the timeline and adds after the last formation (Duplicate in the right-click menu adds after any other).
- Formation bars too narrow for their name show their number; the name and lengths are in the tooltip. The time readout no longer cuts off the formation name.
- Playback speed is a slider from 0.25× to 1.5× (was a three-option menu), and dragging it no longer restarts the song.
- Video export is 1080p by default (was 720p).
- A finished video is offered as a Save link, because browsers often block a download that starts by itself.
- Videos are no longer refused for size; above 300 MB they load without a waveform.

**Fixed**
- Exported videos had a sound track with nothing in it: the song or video's sound was recorded as silence.
- In Safari, exporting a video with music could stop at 100% and never finish, Cancel did not stop it, and finished exports were silent and cut short. Safari exports now finish at full length with the sound; if a browser refuses to record the sound, the video is made silent and a message says so.
- In Safari, the waveform of a long video stopped part way (at 1:54 of a 2:22 video), because Safari's sound decoder reads only part of a video file. Eight now reads the sound frame by frame when that happens.
- A video or song could get a length shorter than the file in some browsers, cutting the timeline off early. The length now comes from the browser's player, and routines saved with a wrong length correct themselves when opened.
- A selected dancer or prop in the list lost its name while the pointer was over it.

## 16 November 2026: phase 3

**Added**
- Timing in seconds or in counts at the tempo, with any number of counts in a bar and default lengths for new formations.
- "Snap to" on the timeline: counts, half counts, bars, whole seconds, or formation edges and the playhead.
- Stage settings: metres or feet, grid spacing, snap step, quarter lines or numbers along the front.
- Dancers' view, showing the stage from the back.
- Preset shapes (line, two rows, block, circle, V, pyramid) and group tools (turn, mirror, spread, tighten).
- A warning when two dancers would cross paths moving into a formation.
- Props that move and animate like dancers; offstage marking; more colours and two more mark shapes.
- Right-click menu on formations: duplicate, reset to the one before, line everyone up, move, delete.
- Video export of the whole routine with its music.

**Fixed**
- A new formation copied the path bends of the one before, so dancers wandered while standing still.
- The current time next to Play was invisible at laptop widths.
- "Back up all" files could not be imported.
- Undoing "Remove music" or "Add music" left the song and the timeline out of step.
- The song stayed silent after a loop or a seek back from past its end.
- Dancers could be dragged or resized out of sight.
- Removing a dancer and adding one could give two dancers the same letter.
- Clicking one dancer in a selected group did not select just that dancer.
- The routine list could show a routine as it was a moment before the last edit.

## 15 November 2026: phase 2

**Added**
- A timeline with one bar per formation, trimming of hold and moving-in time, zoom, and a beat grid.
- Music: add a song, see its waveform, play formations against it, loop a formation, play at reduced speed.
- Curved paths between formations, with ghosts of where everyone stood before.
- A dark theme.
- Offline support: once loaded, the app opens without a connection.
- PDF sheets (one or four formations to a page) and a picture of the current formation.

## 13 November 2026: phase 1

**Added**
- The editor: a stage, dancers you can drag, formations, undo and redo.
- A lighting colour and a note for each formation.
- Routines saved in the browser, with search, sort, duplicate, archive and delete.
- Export and import of a routine as an open JSON file.
- Landing page.
