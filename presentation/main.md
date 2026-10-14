Tidal Cycles and Strudel
===

[Tidal Cycles](https://tidalcycles.org/) is a live coding language for music
written in haskell, created by Alan Hickey. You write short, looping patterns of sound:

```strudel +exec +pty
$: sound("bd sd bd sd")
```

Press Ctrl+E to hear it. Play it, edit it, hear the change while it keeps playing.

Strudel
===

[Strudel](https://strudel.cc) is the modern successor to Tidal Cycles:

- Simlar pattern language, upgraded audio engine
- Runs entirely in your browser
- Edit patterns live, while the music plays

Building blocks
===

```javascript
[0 2 4 7]   // sequence: one step at a time
~           // rest
<0 2>       // stack: both, in the same step
[0 1]!2     // repeat
0@16        // offset: start one sixteenth later
```

Musical scales
===

```strudel +exec +pty
$: n("[0 [~ 0] 4 [3 2] [0 ~] [0 ~] <0 2> ~]")
  .scale("D2:minor")
```

`n` plays scale degrees — the scale does the music theory for you.

Effects
===

```strudel +exec +pty
$: note("[~ [<[d3,a3,f4]!2 [d3,bb3,g4]!2> ~]]*2")
  .sound("gm_electric_guitar_muted")
  .delay(.5)
```

`.room`, `.lpf`, `.gain`, `.delay` — chain as many as you like.

Our example song
===

`example/example.strudel`

```strudel +exec +pty
$: note("[~ [<[d3,a3,f4]!2 [d3,bb3,g4]!2> ~]]*2")
  .sound("gm_electric_guitar_muted").delay(.5)

$: sound("bd rim").bank("RolandTR707").delay(.5)

$: n("<4 [3@3 4] [<2 0> ~@16] ~>")
  .scale("D4:minor").sound("gm_accordion:2")
  .room(2).gain(.4)

$: n("[0 [~ 0] 4 [3 2] [0 ~] [0 ~] <0 2> ~]/2")
  .scale("D2:minor")
  .sound("sawtooth,triangle").lpf(200)
```

Four channels: guitar, drums, melody, bass.
