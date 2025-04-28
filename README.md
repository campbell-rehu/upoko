# upoko

> upoko means "chapter" in Te Reo Maori. (https://maoridictionary.co.nz/word/8896)

This app is a simple Node.js application that queries the [Audible](https://audible.readthedocs.io/en/latest/misc/external_api.html#documentation) and [Audnexus](https://github.com/laxamentumtech/audnexus) APIs to retrieve chapter information for the given mp3 audiobook files.

The app then adds chapter tags to the mp3 files using the [NodeID3](https://github.com/Zazama/node-id3) library.

With the chapter tags added, the mp3 files should then be able to be played in any mp3 player that supports chapter tags. Or, the files can be split by chapter using something like [OpenAudible](https://openaudible.org/).

This app was inspired by the following projects:

- [mp3chapters.github.io](https://github.com/mp3chapters/mp3chapters.github.io)
- [beets-audible](https://github.com/seanap/beets-audible)
- [mp3chaps](https://github.com/dskrad/mp3chaps)

## Usage

1. Create a directory called `input` in the root of the project (the app will create it if it doesn't exist)
2. Place your mp3 files in the `input` directory
3. Run the app using the following command:

```
npm install
npm run start
```

4. The app will create a directory called `output` in the root of the project (the app will create it if it doesn't exist) with the updated files
