#!/usr/bin/env node
// Fake ffmpeg binary used by the component test suite.
// Only needs to respond to -version (used by the doctor check).
// Real ffmpeg is never invoked for audio conversion when fake yt-dlp is active —
// yt-dlp would shell out to ffmpeg, but the fake yt-dlp copies the fixture directly.

'use strict';
process.stdout.write('ffmpeg version 6.1.1 Copyright (c) 2000-2023 the FFmpeg developers\n');
process.exit(0);
