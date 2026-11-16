# Changelog

What changed in Eight, newest first. Dates are when the work was committed. The app has no numbered releases yet; `package.json` stays at 0.1.0 until the first public one.

## Unreleased

**Added**
- Video as a routine's music: MP4, MOV or WebM plays beside the stage in step with the formations, with Mirror video and Hide video.
- A song file can supply the waveform for a video, with an offset to line the two up. Useful for videos over 300 MB, which have no waveform of their own, and for a cleaner waveform than a room recording gives.
- Export window in place of the dropdown: routine file, picture, PDF sheets or video, each with a line saying what you get.
- Video export options: 720p or 1080p, the routine's video beside the formations, mirrored or not.
- A storage check before saving a song or video, and plain messages about file limits.
- README banner, poster and this changelog.

**Changed**
- Video export is 1080p by default (was 720p).
- A finished video is offered as a Save link, because browsers often block a download that starts by itself.
- Videos are no longer refused for size; above 300 MB they load without a waveform.

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
