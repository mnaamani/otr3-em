# OTR3-em - Off-the-Record Messaging [emscripten]

This module exposes a simple evented API which wraps around libotr3.2.1 compiled to javascript using the emscripten compiler.

**Please consider moving to the newer [otr4-em](https://github.com/mnaamani/otr4-em)**

You can install the module directly from npm registry:

    npm install otr3-em

Important Note:
The package includes an optimised/minified precompiled libotr3.js to simplify npm package installation.
It is however NOT a recommended practice to download a precompiled crypto library for obvious security reasons.

See [How-to build libotr3.js](https://github.com/mnaamani/otr3-em/blob/master/BUILDING)

The API aims to be identical to the native nodejs bindings module [otr3](https://github.com/mnaamani/node-otr-v2/)

[API Documentation](https://github.com/mnaamani/otr3-em/blob/master/doc/API.md)

[Howto use the module in the browser](https://github.com/mnaamani/otr3-em/blob/master/test/index.html)
Tested in chrome only.

### License
GPLv2

### built using
- [crypto-emscipten](https://github.com/mnaamani/crypto-emscripten/) libgcrypt/libotr builder.
- [libotr3.2.1](http://www.cypherpunks.ca/otr/) Off-The-Record Messaging library (GPLv2)
- [Emscripten](https://github.com/kripken/emscripten) Emscripten (MIT)
