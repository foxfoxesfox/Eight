---
name: Eight
description: Every dancer. Every count.
colors:
  ink: "#17171a"
  paper: "#f4f2ee"
  ground: "#e7e4de"
  white: "#fdfcfa"
  line: "#cfcac0"
  mute: "#5c5850"
  bad: "#a3231a"
  gel-fire: "#d63a1c"
  gel-indigo: "#3a22b8"
  gel-peacock: "#007f80"
  gel-rose: "#cf2468"
  gel-amber: "#ffb000"
  gel-moss: "#3f7d24"
  gel-violet: "#7d33c7"
  gel-steel: "#2f64ad"
typography:
  display:
    fontFamily: "Figtree Variable, system-ui, sans-serif"
    fontSize: "clamp(3rem, 6.4vw, 6rem)"
    fontWeight: 800
    lineHeight: 0.95
    letterSpacing: "-0.04em"
  headline:
    fontFamily: "Figtree Variable, system-ui, sans-serif"
    fontSize: "2.6rem"
    fontWeight: 800
    letterSpacing: "-0.03em"
  title:
    fontFamily: "Figtree Variable, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 800
  body:
    fontFamily: "Figtree Variable, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 500
    lineHeight: 1.4
  label:
    fontFamily: "Figtree Variable, system-ui, sans-serif"
    fontSize: "12.5px"
    fontWeight: 600
rounded:
  swatch: "4px 4px 12px 12px"
  field: "8px"
  panel: "12px"
  pill: "999px"
spacing:
  xs: "6px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "20px"
components:
  button:
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
    padding: "8px 14px"
  button-solid:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    rounded: "{rounded.pill}"
    padding: "8px 14px"
  button-solid-on-bar:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
    padding: "8px 14px"
  field:
    backgroundColor: "{colors.white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.field}"
    padding: "8px 10px"
  top-bar:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    height: "56px"
  formation-bar:
    textColor: "{colors.white}"
    rounded: "{rounded.swatch}"
    height: "84px"
  rail:
    backgroundColor: "{colors.paper}"
    padding: "18px 16px"
    width: "248px"
---

# Design System: Eight

## Overview

**Creative North Star: "The Gel Book"**

Eight borrows from a stage lighting swatch book. Every formation owns one numbered lighting colour, and the stage is washed in the colour of the formation the playhead is on. The shell stays quiet and light so that colour can do that one job at full strength.

It is a working tool first. The layout is the one an editor's user expects: a bar on top, dancers on the left, the stage in the middle, details on the right, the timeline along the bottom. The world contributes type, palette, density and the wash; it never rearranges the screen.

**Key Characteristics:**
- Near-black top bar, warm light-grey panels, saturated colour reserved for formations
- The stage wash, stage outline, top-bar underline and playhead cap all follow the current formation's colour
- Flat colour throughout: no gradients on surfaces, no faked materials
- One typeface, Figtree, with heavy weights carrying rank
- Tabular numerals wherever time or position is shown

## Colors

A neutral warm-grey shell around eight saturated lighting colours.

### Primary
- **Indigo** (`gel-indigo`): the default lighting colour, used for focus rings, text selection and the caret when no formation sets its own.

### Secondary
- **Fire, Peacock, Rose, Amber, Moss, Violet, Steel** (`gel-*`): the other lighting colours a formation can take. Each fills its formation bar at full strength and tints the stage at about 15%.

### Neutral
- **Ink** (`ink`): top bar, body text, solid buttons, selected rows, the playhead line.
- **Paper** (`paper`): rails, timeline panel, text on ink.
- **Ground** (`ground`): the page and the area around the stage.
- **White** (`white`): inputs, the timeline track, menus.
- **Line** (`line`): borders on inputs, outline buttons and panel edges.
- **Mute** (`mute`): secondary text; passes 4.5:1 on paper.
- **Bad** (`bad`): destructive actions and error text.

### Dark theme
A toggle in the top bar switches to charcoal panels (ink `#f1efea`, paper `#242428`, ground `#19191c`, white `#2e2e33`, line `#4a4a52`, mute `#b5b0a6`). The lighting colours do not change. The top bar and landing hero stay dark in both themes, and print sheets stay light in both because they are paper.

### Named Rules
**The One Wash Rule.** Saturated colour on a screen belongs to formations. The shell never takes a lighting colour of its own beyond the 5px underline of the top bar.

**The Ink-On-Colour Rule.** Text on a lighting colour or a dancer mark is black or white, chosen by luminance, never a tint.

## Typography

**Display Font:** Figtree Variable (with system-ui)
**Body Font:** Figtree Variable (with system-ui)

**Character:** One friendly, even grotesk at heavy and medium weights. Rank comes from weight and size, never from a second face.

### Hierarchy
- **Display** (800, clamp 3rem to 6rem, 0.95): the landing headline only.
- **Headline** (800, 2.6rem): page titles such as "Your routines".
- **Title** (800, 14 to 20px): panel headings, formation names in bars, the time readout.
- **Body** (500, 15px, 1.4): everything else. Prose is capped near 62ch.
- **Label** (600, 12.5px): field labels and secondary readouts in the mute colour.

### Named Rules
**The Tabular Rule.** Times, counts and coordinates use tabular numerals so they do not jitter while playing.

## Layout

The editor is a fixed grid filling the viewport: a 56px bar, a 248px dancer rail, a fluid stage, a 272px details rail, and the timeline across the bottom. The stage scales to fit and never scrolls; the timeline scrolls sideways when zoomed.

Under 900px the grid becomes one column in this order: bar, stage, timeline, dancers, details. Timeline tools become a single row that scrolls sideways. Library and print pages centre in a column up to 1040px and 1100px.

Spacing steps are 6, 8, 12, 16 and 20px. Related controls sit 8 to 12px apart; panels are padded 16 to 20px.

## Elevation & Depth

Flat by default. Depth comes from tone: ink bar over paper rails over the ground. The stage has a soft radial glow in the current lighting colour behind it, which is light, not a shadow.

### Shadow Vocabulary
- **Menu** (`0 14px 34px -12px #00000066, 0 0 0 1px` line): floating menus only.
- **Message** (`0 8px 24px -10px #00000055`): the error toast.

### Named Rules
**The Flat Surface Rule.** Panels, bars and buttons carry no shadow at rest. Only things that float above the page get one.

## Shapes

Buttons are full pills. Inputs and list rows use 8px corners; panels 12px. Formation bars have the swatch shape: nearly square on top (4px) and rounded underneath (12px). Dancers are circles, rounded squares, triangles, diamonds or hexagons with a white ring, so shape backs up colour. Props are plain rounded slabs in a neutral grey, drawn under the dancers.

## Components

### Buttons
- **Shape:** pill (999px), 8px by 14px padding, weight 600.
- **Default:** transparent with a 1px border at 35% of the text colour.
- **Solid:** ink on light surfaces, paper on the ink bar.
- **Hover / Focus:** a 10% tint of the text colour; press scales to 0.97; focus is a 2px ring in the current lighting colour.
- **Danger:** same outline shape with text in the bad colour.

### Inputs / Fields
- **Style:** white fill, 1px line border, 8px corners, label above in the label style. A unit such as "s" or "m" sits inside the right edge.
- **Focus:** 2px ring in the current lighting colour.

### Navigation
- The ink top bar holds the wordmark (a link back to the routines list), the routine name as an inline field, and actions on the right. Its 5px underline takes the current lighting colour.

### Formation bar
- One bar per formation in its lighting colour, with its number and name on top. Along the bottom, a strip filled at 32% of the text colour shows the time spent moving in; a solid knob at the strip's end is the slider. A grip on the bar's right edge changes the total length. The current bar gets a 3px ink outline inside a white inner ring.

### Windows and menus
- **Export window:** a centred modal on the white surface with 12px corners and the menu shadow, over a dimmed page. Choices are bordered rows with a radio, a bold title and one line of plain explanation; the chosen row gets an ink border. Options for a choice appear in a paper panel beneath it, only when that choice is selected.
- **Formation menu:** right-clicking a formation bar opens a floating menu in the menu style, upwards from the pointer. Destructive items use the bad colour; unavailable ones are dimmed, not hidden.
- **Messages:** errors use the bordered error toast; neutral news (a finished video, a file with no waveform) uses the same shape in white with a line border.

### Panels
- The dancers panel, details panel and timeline can be resized by dragging their edge; a 2px line in the current lighting colour shows on the edge under the pointer. The side panels hide with a round arrow button at the stage's top corners. Under 900px wide the layout stacks and these controls are hidden.

### Preview
- A full-screen view on the ink background: formation number chip and name top left, clock top right, the stage (and video) filling the middle, the formation's note bottom left, play controls bottom centre and the next formation as a small drawing bottom right.

### Video beside the stage
- A routine's video shares the stage area half and half, on black with 8px corners. It carries no controls of its own: Play, the playhead and speed drive it.

### Stage
- Pale wash of the current colour, grid at 24% of it, dashed centre line and a 0.07m outline in the full colour. Selected dancers get a white halo ringed in ink. Previous positions are dashed ghosts joined by dashed ink paths; a white handle on a selected dancer's path bends it.

## Do's and Don'ts

### Do:
- **Do** let the current formation's colour drive the stage wash, outline, bar underline and playhead cap together.
- **Do** pick black or white text on any coloured fill by luminance.
- **Do** give every dancer a label and a shape as well as a colour.
- **Do** keep controls standard: buttons, selects, checkboxes and inputs the user already knows.

### Don't:
- **Don't** put a lighting colour on shell chrome beyond the bar underline.
- **Don't** add a small uppercase label above a formation name or heading.
- **Don't** use text characters as icons; icons are drawn SVG at one 2px stroke.
- **Don't** add shadows to panels, bars or buttons at rest.
