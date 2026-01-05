#!/usr/bin/env node
import 'dotenv/config';
import {render} from 'ink';
import meow from 'meow';
import App from './app.js';

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
