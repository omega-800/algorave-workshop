# Algorave Workshop

A small, hands-on workshop introducing algoraves, community events where
people make music together with software.

Our focus will be making noise together in [Strudel](https://strudel.cc), a
live coding language for music.

## Contents

| Path                      | What it is                                        |
| ------------------------- | ------------------------------------------------- |
| `presentation/`           | The presentation                                  |
| `example/example.strudel` | A small strudel song                              |
| `tools/strudel-play.mjs`  | Plays strudel code in the terminal, with a live playhead |
| `tools/setup-strudel-server.sh` | Sets up the local strudel audio server    |
| `tools/nvim-strudel/`     | Vendored audio server (gitignored, built on demand) |

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
Node.js ≥ 22, then:

```sh
bash tools/setup-strudel-server.sh
presenterm -c presentation/config.yaml presentation/presentation.md
```

## Live code in the presentation

Pattern slides carry real strudel code. While presenting, press **Ctrl+E** on
a slide to play the pattern:

- A local strudel server starts on first use (a few seconds — it downloads
  sound samples from the internet the first time) and keeps playing while you
  move on to other slides.
- Each played pattern replaces the previous one, so you can walk through the
  slides in order and hear each example.
- Quitting the deck stops the music.

Server output is logged to `logs/strudel-server.log`.

### If the sound misbehaves

Audio goes out through the system's default audio device (ALSA). If nothing
plays, or the music freezes after a second or two, your default device may be
broken (a common culprit: an HDMI output with no working audio path). List
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

## Licensing

`tools/nvim-strudel` is a vendored copy of
[nvim-strudel](https://github.com/Goshujinsama/nvim-strudel), which is
licensed under AGPL-3.0. It is used unmodified as a local audio server.
