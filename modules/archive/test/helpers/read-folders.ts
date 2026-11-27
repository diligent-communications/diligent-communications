// Run as its own process by the restart test: reads the folder settings from
// the settings file named on the command line and prints the result as JSON.

import { readFolders } from '../../src/archive.ts';

const settingsFile = process.argv[2];
if (settingsFile === undefined) {
  throw new Error('Pass the settings file location.');
}
process.stdout.write(JSON.stringify(await readFolders(settingsFile)));
