# Third-party code

This app includes code from the projects below under the MIT License and the Apache License 2.0, and one typeface under the SIL Open Font License. The MIT License text follows the table; each Apache-2.0 project's licence ships beside this file.

| Project | Copyright | Used for | Version |
|---|---|---|---|
| [Butterchurn](https://github.com/music-assistant/butterchurn), the Music Assistant fork of [jberg/butterchurn](https://github.com/jberg/butterchurn) 3.0.0-beta.5 | (c) 2013-2018 Jordan Berg | MilkDrop renderer, bundled into `vendor/butterchurn.min.js` | 3.0.0-beta.5.ma.4 |
| [@assemblyscript/loader](https://github.com/AssemblyScript/assemblyscript) (Apache-2.0, full text in `assemblyscript-loader-LICENSE.txt`) | The AssemblyScript Authors (Daniel Wirtz and contributors) | Loads Butterchurn's WebAssembly; inlined in Butterchurn's build, so in `vendor/butterchurn.min.js` | 0.28.20 |
| [eel-wasm](https://github.com/captbaritone/eel-wasm) | (c) Jordan Eldredge | Compiles MilkDrop preset equations to WebAssembly; inlined in `vendor/butterchurn.min.js` | 0.0.16 |
| [ecma-proposal-math-extensions](https://github.com/rwaldron/proposal-math-extensions) | (c) Rick Waldron | `Math.clamp`, `Math.scale` and friends; inlined in `vendor/butterchurn.min.js` | 0.0.2 |
| [butterchurn-presets](https://github.com/jberg/butterchurn-presets) | (c) 2013-2018 Jordan Berg | MilkDrop presets, selected into `vendor/presets.js` | 2.4.7 |
| [sendspin-js](https://github.com/Sendspin/sendspin-js) (Apache-2.0, full text in `sendspin-js-LICENSE.txt`) | Sendspin Protocol Authors | "Play on this TV" Sendspin player, bundled into `app.js` | 3.2.1 |
| [Archivo](https://github.com/Omnibus-Type/Archivo) (SIL OFL 1.1, full text in `fonts/OFL.txt`) | (c) 2020 The Archivo Project Authors | Interface typeface, `fonts/archivo-*.woff2` (Google Fonts latin and latin-ext subsets, variable weight and width) | Google Fonts v25 |

## MIT License

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
