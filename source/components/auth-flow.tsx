import {Box, Text} from 'ink';
import {useEffect, useState} from 'react';
import {authenticate} from '../lib/auth.js';

type AuthFlowProps = {
	onAuthenticated: () => void;
};

type VerificationInfo = {
	userCode: string;
	verificationUri: string;
};

export default function AuthFlow({onAuthenticated}: AuthFlowProps) {
	const [verification, setVerification] = useState<VerificationInfo | null>(
		null,
	);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		authenticate(v => {
			setVerification({
				userCode: v.user_code,
				verificationUri: v.verification_uri,
			});
		})
			.then(() => {
				onAuthenticated();
			})
			.catch((error_: unknown) => {
				setError(error_ instanceof Error ? error_.message : 'Unknown error');
			});
	}, [onAuthenticated]);

	if (error) {
		return (
			<Box flexDirection="column">
				<Text color="red">Authentication failed: {error}</Text>
			</Box>
		);
	}

	if (!verification) {
		return <Text>Initializing authentication...</Text>;
	}

	return (
		<Box flexDirection="column" gap={1}>
			<Text>To authenticate, visit:</Text>
			<Text color="cyan" bold>
				{verification.verificationUri}
			</Text>
			<Text>And enter code:</Text>
			<Text color="yellow" bold>
				{verification.userCode}
			</Text>
			<Text dimColor>Waiting for authentication...</Text>
		</Box>
	);
}
