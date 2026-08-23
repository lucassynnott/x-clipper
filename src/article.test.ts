import test from "node:test";
import assert from "node:assert/strict";
import { articleToMarkdown, getArticleMedia, getArticleMediaUrls, selectPostText, type XArticle } from "./article.ts";

const article = {
	title: "A useful article",
	content: {
		blocks: [
			{
				key: "heading",
				type: "header-two",
				text: "Why this matters",
				data: {},
				inlineStyleRanges: [],
				entityRanges: [],
			},
			{
				key: "body",
				type: "unstyled",
				text: "Read the source and remember this.",
				data: {},
				inlineStyleRanges: [
					{ offset: 20, length: 8, style: "Bold" },
				],
				entityRanges: [
					{ offset: 9, length: 6, key: 0 },
				],
			},
			{
				key: "first",
				type: "unordered-list-item",
				text: "First point",
				data: {},
				inlineStyleRanges: [],
				entityRanges: [],
			},
			{
				key: "quote",
				type: "blockquote",
				text: "Quoted idea",
				data: {},
				inlineStyleRanges: [],
				entityRanges: [],
			},
		],
		entityMap: [
			{
				key: "0",
				value: {
					type: "LINK",
					mutability: "MUTABLE",
					data: { url: "https://example.com/source" },
				},
			},
		],
	},
	cover_media: {
		media_info: {
			__typename: "ApiImage",
			original_img_url: "https://example.com/cover.jpg",
		},
	},
	media_entities: [
		{
			media_info: {
				__typename: "ApiImage",
				original_img_url: "https://example.com/inline.png",
			},
		},
	],
};

test("converts an X Article into readable Markdown", () => {
	assert.equal(
		articleToMarkdown(article),
		"# A useful article\n\n## Why this matters\n\nRead the [source](https://example.com/source) and **remember** this.\n\n- First point\n\n> Quoted idea"
	);
});

test("collects and deduplicates article image URLs", () => {
	assert.deepEqual(getArticleMediaUrls(article), [
		"https://example.com/cover.jpg",
		"https://example.com/inline.png",
	]);
});

test("separates Article videos and selects the highest-bitrate MP4 variant", () => {
	const withVideo: XArticle = {
		media_entities: [{
			media_info: {
				__typename: "ApiVideo",
				variants: [
					{ content_type: "application/x-mpegURL", url: "https://example.com/video.m3u8" },
					{ content_type: "video/mp4", bitrate: 256000, url: "https://example.com/low.mp4" },
					{ content_type: "video/mp4", bitrate: 2176000, url: "https://example.com/high.mp4" },
				],
			},
		}],
	};
	assert.deepEqual(getArticleMedia(withVideo), {
		images: [],
		videos: ["https://example.com/high.mp4"],
	});
});

test("keeps ordinary post text unchanged when there is no Article", () => {
	assert.equal(selectPostText(undefined, "An ordinary post"), "An ordinary post");
});

test("prefers complete Article content over the post preview", () => {
	assert.equal(selectPostText(article, "A short preview"), articleToMarkdown(article));
});

test("nests overlapping link and inline-style ranges without corrupting text", () => {
	const overlapping = structuredClone(article);
	overlapping.content.blocks = [{
		key: "overlap",
		type: "unstyled",
		text: "linked",
		data: {},
		inlineStyleRanges: [{ offset: 0, length: 6, style: "Bold" }],
		entityRanges: [{ offset: 0, length: 6, key: 0 }],
	}];
	assert.equal(
		articleToMarkdown(overlapping),
		"# A useful article\n\n[**linked**](https://example.com/source)"
	);
});

test("renders text-bearing atomic entities instead of dropping them", () => {
	const atomicArticle: XArticle = {
		title: "Atomic content",
		content: {
			blocks: [
				{ type: "atomic", text: " ", entityRanges: [{ offset: 0, length: 1, key: 0 }] },
				{ type: "atomic", text: " ", entityRanges: [{ offset: 0, length: 1, key: 1 }] },
				{ type: "atomic", text: " ", entityRanges: [{ offset: 0, length: 1, key: 2 }] },
				{ type: "atomic", text: "E = mc^2", entityRanges: [{ offset: 0, length: 8, key: 3 }] },
			],
			entityMap: [
				{ key: "0", value: { type: "MARKDOWN", data: { markdown: "```js\nconsole.log('saved');\n```" } } },
				{ key: "1", value: { type: "TWEET", data: { tweetId: "123456789" } } },
				{ key: "2", value: { type: "DIVIDER", data: {} } },
				{ key: "3", value: { type: "LATEX", data: {} } },
			],
		},
	};
	assert.equal(
		articleToMarkdown(atomicArticle),
		"# Atomic content\n\n```js\nconsole.log('saved');\n```\n\nhttps://x.com/i/status/123456789\n\n---\n\n$$\nE = mc^2\n$$"
	);
});

test("handles the object-shaped entityMap returned by some API versions", () => {
	const withObjectMap = structuredClone(article);
	withObjectMap.content.entityMap = {
		0: article.content.entityMap[0].value,
	};
	assert.match(articleToMarkdown(withObjectMap), /\[source\]\(https:\/\/example\.com\/source\)/);
});
