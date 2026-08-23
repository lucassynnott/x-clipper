export interface ArticleEntity {
	key?: string;
	value?: {
		type?: string;
		data?: Record<string, unknown>;
	};
	type?: string;
	data?: Record<string, unknown>;
}

export interface ArticleBlock {
	type?: string;
	text?: string;
	inlineStyleRanges?: Array<{ offset: number; length: number; style: string }>;
	entityRanges?: Array<{ offset: number; length: number; key: number | string }>;
}

export interface XArticle {
	title?: string;
	content?: {
		blocks?: ArticleBlock[];
		entityMap?: ArticleEntity[] | Record<string, ArticleEntity>;
	};
	cover_media?: unknown;
	media_entities?: unknown[];
}

function normalizeEntityMap(
	entityMap: ArticleEntity[] | Record<string, ArticleEntity> | undefined
): Map<string, ArticleEntity> {
	const result = new Map<string, ArticleEntity>();
	if (Array.isArray(entityMap)) {
		for (const entity of entityMap) {
			if (entity.key !== undefined) result.set(String(entity.key), entity.value || entity);
		}
	} else if (entityMap) {
		for (const [key, entity] of Object.entries(entityMap)) {
			result.set(key, entity.value || entity);
		}
	}
	return result;
}

function applyRanges(block: ArticleBlock, entities: Map<string, ArticleEntity>): string {
	const text = block.text || "";
	type Range = {
		start: number;
		end: number;
		open: string;
		close: string;
		priority: number;
	};
	const ranges: Range[] = [];

	for (const range of block.inlineStyleRanges || []) {
		const markers: Record<string, [string, string]> = {
			bold: ["**", "**"],
			italic: ["*", "*"],
			underline: ["<u>", "</u>"],
			strikethrough: ["~~", "~~"],
			code: ["`", "`"],
		};
		const marker = markers[range.style.toLowerCase()];
		if (marker) {
			ranges.push({
				start: range.offset,
				end: range.offset + range.length,
				open: marker[0],
				close: marker[1],
				priority: 1,
			});
		}
	}

	for (const range of block.entityRanges || []) {
		const entity = entities.get(String(range.key));
		const type = entity?.type || entity?.value?.type;
		const data = entity?.data || entity?.value?.data;
		if (type === "LINK") {
			const url = data?.url || data?.expanded_url || data?.href;
			if (typeof url === "string") {
				ranges.push({
					start: range.offset,
					end: range.offset + range.length,
					open: "[",
					close: `](${url})`,
					priority: 0,
				});
			}
		}
	}

	const validRanges = ranges.filter((range) =>
		range.start >= 0 && range.end > range.start && range.start < text.length
	);
	const opens = new Map<number, Range[]>();
	const closes = new Map<number, Range[]>();
	for (const range of validRanges) {
		range.end = Math.min(range.end, text.length);
		opens.set(range.start, [...(opens.get(range.start) || []), range]);
		closes.set(range.end, [...(closes.get(range.end) || []), range]);
	}

	let result = "";
	for (let index = 0; index <= text.length; index++) {
		const closing = closes.get(index) || [];
		closing.sort((a, b) => b.start - a.start || b.priority - a.priority);
		result += closing.map((range) => range.close).join("");

		const opening = opens.get(index) || [];
		opening.sort((a, b) => b.end - a.end || a.priority - b.priority);
		result += opening.map((range) => range.open).join("");

		if (index < text.length) result += text[index];
	}
	return result;
}

function renderAtomicBlock(block: ArticleBlock, entities: Map<string, ArticleEntity>): string {
	const rendered: string[] = [];
	for (const range of block.entityRanges || []) {
		const entity = entities.get(String(range.key));
		const type = entity?.type || entity?.value?.type;
		const data = entity?.data || entity?.value?.data;
		if (type === "MARKDOWN" && typeof data?.markdown === "string") {
			rendered.push(data.markdown.trim());
		} else if (type === "TWEET" && typeof data?.tweetId === "string") {
			rendered.push(`https://x.com/i/status/${data.tweetId}`);
		} else if (type === "DIVIDER") {
			rendered.push("---");
		} else if (type === "LATEX" && typeof data?.latex === "string") {
			rendered.push(`$$\n${data.latex}\n$$`);
		}
	}
	return rendered.join("\n\n");
}

export function articleToMarkdown(article: XArticle): string {
	const entities = normalizeEntityMap(article.content?.entityMap);
	const lines: string[] = [];
	if (article.title?.trim()) lines.push(`# ${article.title.trim()}`);

	for (const block of article.content?.blocks || []) {
		if (block.type === "atomic") {
			const atomic = renderAtomicBlock(block, entities);
			if (atomic) lines.push(atomic);
			continue;
		}
		const text = applyRanges(block, entities).trim();
		if (!text) continue;
		switch (block.type) {
			case "header-one": lines.push(`# ${text}`); break;
			case "header-two": lines.push(`## ${text}`); break;
			case "header-three": lines.push(`### ${text}`); break;
			case "header-four": lines.push(`#### ${text}`); break;
			case "header-five": lines.push(`##### ${text}`); break;
			case "header-six": lines.push(`###### ${text}`); break;
			case "unordered-list-item": lines.push(`- ${text}`); break;
			case "ordered-list-item": lines.push(`1. ${text}`); break;
			case "blockquote": lines.push(`> ${text.replace(/\n/g, "\n> ")}`); break;
			case "code-block": lines.push(`\`\`\`\n${text}\n\`\`\``); break;
			default: lines.push(text);
		}
	}
	return lines.join("\n\n");
}

export function selectPostText(article: XArticle | undefined, postText: string | undefined): string {
	const articleMarkdown = article ? articleToMarkdown(article) : "";
	return articleMarkdown || postText || "";
}

function mediaUrl(value: unknown): string | null {
	if (!value || typeof value !== "object") return null;
	const media = value as Record<string, unknown>;
	const info = (media.media_info || media) as Record<string, unknown>;
	for (const key of ["original_img_url", "media_url_https", "media_url", "url"]) {
		if (typeof info[key] === "string") return info[key] as string;
	}
	return null;
}

export function getArticleMediaUrls(article: XArticle): string[] {
	const urls = [mediaUrl(article.cover_media), ...(article.media_entities || []).map(mediaUrl)]
		.filter((url): url is string => Boolean(url));
	return [...new Set(urls)];
}
