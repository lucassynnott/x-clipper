export function getProtocolClipUrl(params: Record<string, string>): string | null {
	const input = params.url || params.text || "";
	const match = input.match(/https?:\/\/(?:www\.)?(?:twitter\.com|x\.com)\/[^\s/]+\/status\/\d+/i);
	return match?.[0] || null;
}
