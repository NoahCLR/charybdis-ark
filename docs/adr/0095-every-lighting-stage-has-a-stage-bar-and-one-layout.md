# Every Lighting stage has a stage bar and one layout

Cited as D-L95.

Each Lighting stage laid itself out its own way. Background effect and
Auto-mouse fade used three columns, the stages with a list a list and two
columns, so the colour editor started in a different place on each tab. The
**Stage on** switch rode on whichever section said where or when the stage
painted (LIT-03, option D, 2026-11-06). On Layer colours, Pointing modes and
Combo feedback that section held only the picked item's settings, so "Stage
off" sat beside Dragscroll's Locality and read as "Dragscroll off". On
Behaviour feedback the switch moved down to When it flashes, and on
Replacement feedback to How long it flashes, as much as 175px lower. Behaviour
feedback's per-case Locality and its Flash interval, shared by every case,
sat under headings in the same style, and only the guide said which was
which. What each stage does was behind a **What this stage does** fold that
moved with the tallest column. A switch elsewhere that kept a stage from
painting led the tab with a banner that pushed everything down 56 to 97px.

Noah asked (2026-11-13) for the screen to say what is shared and what is
specific, for things to stay in one place between tabs, and for the info mark
to do the fold's job. Of three sketches (a stage bar, two zones inside the
existing columns, and tidying only) he picked the stage bar: "B looks good".

## The decision

- **A stage bar across the top of every stage holds what is the whole
  stage's.** Its name, with what it does behind the info mark; the settings
  every item on the stage shares, headed by the words its accents already use
  for all of them (**Every behaviour state** over Tap branch commit and Flash
  interval; **Every case** over Flash length, with a link to Leader waits on
  Host settings, which Leader waiting lasts as long as); a short note where
  nothing is shared; whether a switch elsewhere, or All lighting, keeps the
  stage from painting, in a word that goes to that switch, the bar tinted;
  and **Stage on**, always the bar's last item. All accents has a bar too,
  with the keyboard's accent count.
- **Under it, every stage has the same columns.** A first column (the list,
  or the background effect's Effect and the fade's Fade), the colour beside
  Where it paints, and the accents under both. The background effect's LEDs
  are its Where it paints; the fade's Timing sits there too. On a stage with a
  list, the item picked heads its colour, where it paints and its accents,
  which are its own alone: its mark and name, over a line saying where it
  paints, or, for a replacement case, when it shows. Combo feedback's list
  picks only the combo the board holds, so its colour is headed **Every
  combo** and its list rings the combo held rather than shading it as an
  edited item.
- **Info marks replace the fold** (extending D-L88's mark beyond Text
  replacement): what a stage does on its bar, what a section's choices mean
  on its heading (the same Locality rows on every Where it paints, with that
  stage's trigger key), how accents work on the Accents heading, and the
  board's shortcuts on its corner, as the Keymap's. Inline stays what is
  needed every time.
- **Nothing moves between tabs or states.** The workbench floor is rebuilt
  from the stages on each render, so an accent editor that grew it gives the
  room back. A passthrough colour keeps its square and fields, dimmed under
  what it means. The tabs keep fixed widths, reading by short words where the
  window is too narrow for the names.

This amends D-L89 and D-L93 where they place the switch on the section that
says where or when the stage paints, and D-L93's "the two sections share the
column beside the colour": a case's Locality sits beside its colour, and what
the stage shares is on the bar.

## Considered options

- **Two zones inside the existing columns**: the picked item's colour and
  Locality in one column, the stage's settings and switch heading the last.
  No new row, but on Layer colours and Pointing modes the last column held
  only the switch.
- **Tidy only**: one grid, the switch on the last column's first heading
  everywhere, the fold an info mark in the tab strip. Most movement gone,
  but the switch would sit on the per-case Where it paints on Behaviour and
  Replacement feedback, the confusion this set out to end.
- **Keep the switch on a section heading (LIT-03).** It saved a row; the row
  now carries the stage's name, its info mark and what it shares, and keeps
  the switch in one place.

## Consequences

- The bar costs about 42px on every tab, the same on each, so no tab moves.
- At 1280px the bar keeps one line: the tab already names the stage, so the
  bar's name is left to a screen reader there.
- The colour choice is one control, **Colour**, **Off** and **Passthrough**,
  beside the colour's value; D-L94's words and states are unchanged.
- Accents are grouped by whom they light for, and Change and Remove on one
  for every item say so.
