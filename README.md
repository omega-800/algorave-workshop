# Algorave Workshop

A small, hands-on workshop introducing algoraves, community events where
people make music together with software.

Our focus will be making noise together with [TidalCycles](https://tidalcycles.org/)
and [Strudel](https://strudel.cc), live coding languages for music.

## Contents

| Path                            | What it is                                               |
| ------------------------------- | -------------------------------------------------------- |
| `presentation/`                 | The presentation                                         |
| `example/example.strudel`       | A small strudel song                                     |
| `example/example.tidal`         | A small tidal pattern                                    |
| `tools/strudel-play.mjs`        | Plays strudel code in the terminal, with a live playhead |
| `tools/setup-strudel-server.sh` | Sets up the local strudel audio server                   |
| `tools/nvim-strudel/`           | Vendored audio server (gitignored, built on demand)      |

## Running the presentation

### Nix

```sh
nix develop   # first time: also builds the local strudel server
nix run       # start the presentation

# export to PDF (code snippets shown as static previews)
nix build .#presentation-pdf
```

### Without Nix

Install [presenterm](https://github.com/strawlab/presenterm), `qrencode` and
Node.js >= 22, then:

```sh
bash tools/setup-strudel-server.sh
presenterm -c presentation/config.yaml presentation/presentation.md
```

## Live code in the presentation

Pattern slides carry real code. While presenting, press **Ctrl+E** on a slide
to play the pattern:

- **Strudel** slides: a local strudel server starts on first use (a few seconds -
  it downloads sound samples from the internet the first time) and keeps
  playing while you move on to other slides.
- **Tidal** slides: they need the sound engine running, so start
  `superdirt-start` in a terminal before presenting (see "Tidal Cycles").
- Each played pattern replaces the previous one, so you can walk through the
  slides in order and hear each example.
- Quitting the deck stops the music.

Server output is logged to `logs/strudel-server.log`.

### If the sound misbehaves

Audio goes out through the system's default audio device (ALSA). If nothing
plays, or the music freezes after a second or two, your default device may be
broken. List
your cards with `aplay -l`, then force a working one:

```sh
# /tmp/alsa.conf — adjust the card number to a real output device
pcm.!default {
  type plug
  slave.pcm "hw:1,0"
}
ctl.!default {
  type hw
  card 1
}
```

```sh
ASOUND_CONF=/tmp/alsa.conf nix run
```

## Playing the example song

The easiest way is right in the browser:

1. Open <https://strudel.cc>
2. Paste the contents of `example/example.strudel`
3. Press play and start hacking

Or in the terminal, with the server set up as above:

```sh
nix run .#strudel-play -- example/example.strudel
```

The same song, translated to Tidal, lives in `example/example.tidal`:

```sh
superdirt-start                      # terminal 1: sound engine
tidal-run example/example.tidal      # terminal 2: play it
```

## Tidal Cycles

[TidalCycles](https://tidalcycles.org/) is a live coding language for music
written in Haskell. The nix shell provides a full Tidal + SuperDirt setup:
`tidal-cycles` (the interactive REPL), `tidal-run` (run a `.tidal` file), and
`superdirt-start` (the sound engine). Audio goes out through
[PipeWire](https://pipewire.org/) via the JACK driver, so make sure PipeWire is
running on your machine.

### Two-terminal workflow

```sh
nix develop

# terminal 1 — the sound engine
superdirt-start

# terminal 2 — code
tidal-run test.tidal     # evaluate a .tidal file
# or
tidal-cycles             # interactive REPL (BootTidal preloaded)
```

`superdirt-start` keeps running while you evaluate patterns. In the REPL or in
a `.tidal` file, patterns are written as `d1 $ sound "bd sd"` and evaluated
immediately, live.

### Example

```tidal
d1 $ sound "bd sd bd sd"                 -- drums
d2 $ sound "guitar" # (scale "D2 minor" "[0 2 4 7]")   -- melody
```

Controls are combined with `#` (strudel uses `.`), and `d1`, `d2`, ... are
separate looping tracks.

## Licensing

`tools/nvim-strudel` is a vendored copy of
[nvim-strudel](https://github.com/Goshujinsama/nvim-strudel), which is
licensed under AGPL-3.0. It is used unmodified as a local audio server.
