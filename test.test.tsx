import React from 'react';
import {test, expect} from 'vitest';
import {render} from 'ink-testing-library';
import AuthFlow from './source/components/auth-flow.js';

test('auth flow shows initializing message', () => {
	const {lastFrame} = render(<AuthFlow onAuthenticated={() => undefined} />);

	expect(lastFrame()).toBe('Initializing authentication...');
});
