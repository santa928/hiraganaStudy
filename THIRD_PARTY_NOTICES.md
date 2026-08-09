# Third-party notices

## fude-kana-data stroke templates

The generated files in `src/features/writing/data/generated` are derived from [fude-kana-data](https://github.com/karimghezali/fude-kana-data) by karimghezali, fixed at commit [ab69a27e2f5a5125ac89b5f13a1b0f0e318d5319](https://github.com/karimghezali/fude-kana-data/commit/ab69a27e2f5a5125ac89b5f13a1b0f0e318d5319). fude-kana-data is itself derived from [KanjiVG](https://kanjivg.tagaini.net/) by Ulrich Apel.

Source retrieval URL: https://raw.githubusercontent.com/karimghezali/fude-kana-data/ab69a27e2f5a5125ac89b5f13a1b0f0e318d5319/kana-data/<codepoint>.json

This project extracted 46 basic hiragana and 19 additional word-writing characters, resampled every ordered stroke to 48 points by arc length, normalised each character template into a shared 0..1 coordinate system, and rounded generated point coordinates to four decimal places. Character identity, stroke order, direction, and `isCurl` are preserved, including source `direction.angle: null` values for closed loops.

The generated stroke data is distributed under [Creative Commons Attribution-ShareAlike 3.0 Unported (CC BY-SA 3.0)](https://creativecommons.org/licenses/by-sa/3.0/). The upstream LICENSE and this project's attribution notice are available at `public/licenses/fude-kana-data/`.
