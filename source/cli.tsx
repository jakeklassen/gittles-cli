#!/usr/bin/env node
import cfonts from 'cfonts';
import {render} from 'ink';
import meow from 'meow';
import App from './app.js';

cfonts.say('Gittles', {
	font: 'block',
	colors: ['cyan', 'yellow'],
	letterSpacing: 0,
	space: false,
});

const cli = meow(
	`
	Usage
	  $ gittles [command]

	Commands
	  sync    Sync starred repositories from GitHub

	Options
	  --limit  Limit number of stars to sync (for testing)
	  --help   Show help

	Examples
	  $ gittles sync
	  $ gittles sync --limit=10
`,
	{
		importMeta: import.meta,
		flags: {
			limit: {
				type: 'number',
			},
		},
	},
);

const command = cli.input[0];

render(<App command={command} limit={cli.flags.limit} />);
