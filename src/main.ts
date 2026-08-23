import { Plugin, Notice, TFile, normalizePath, requestUrl, addIcon } from "obsidian";
import {
	X_ICON_ID, X_ICON_SVG,
	DEFAULT_SETTINGS, EMOJI_REGEX, SANITIZE_REGEX, HASHTAG_REGEX,
	type XClipperSettings
} from "./constants";
import { XClipperSettingTab } from "./settings-tab";
import { ClipPostModal } from "./modal";
import { getArticleMedia, selectPostText, type XArticle } from "./article";
import { getProtocolClipUrl } from "./protocol";

interface PostNoteData {
	url: string;
	author_name: string;
	author_url: string;
	post_text: string;
	images: string[];
	videos: string[];
	tags: string[];
}

interface FxTwitterApiResponse {
	code?: number;
	message?: string;
	tweet?: {
		author?: { name?: string; screen_name?: string };
		text?: string;
		media?: {
			photos?: Array<{ url?: string }>;
			videos?: Array<{ url?: string }>;
		};
		article?: XArticle;
	};
}

export default class XClipperPlugin extends Plugin {
	settings: XClipperSettings = DEFAULT_SETTINGS;

	async onload(): Promise<void> {
		await this.loadSettings();

		addIcon(X_ICON_ID, X_ICON_SVG);

		this.addRibbonIcon(X_ICON_ID, "Clip post", () => {
			this.openClipPostModal();
		});

		this.addCommand({
			id: "clip-post",
			name: "Clip post",
			callback: () => {
				this.openClipPostModal();
			},
		});

		this.registerObsidianProtocolHandler("x-clipper", (params) => {
			const url = getProtocolClipUrl(params);
			if (!url) {
				new Notice("X Clipper: no valid X post URL was provided");
				return;
			}
			this.openClipPostModal(url);
		});

		this.addSettingTab(new XClipperSettingTab(this.app, this));
	}

	async loadSettings(): Promise<void> {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	// ── 入力URLからユーザー名とステータスIDを抽出 ──
	parsePostUrl(url: string): { screenName: string; statusId: string } | null {
		const match = url.match(
			/(?:twitter\.com|x\.com)\/([^/]+)\/status\/(\d+)/
		);
		if (!match) return null;
		return { screenName: match[1], statusId: match[2] };
	}

	// ── fxtwitter APIでポストデータを取得 ──
	async fetchPostData(screenName: string, statusId: string): Promise<FxTwitterApiResponse> {
		const apis = [
			`https://api.fxtwitter.com/${screenName}/status/${statusId}`,
			`https://api.vxtwitter.com/${screenName}/status/${statusId}`,
		];

		let lastError: Error | undefined;
		for (const apiUrl of apis) {
			try {
				const response = await this.requestWithRetries(
					() => requestUrl({ url: apiUrl, method: "GET" }),
					2,
					2000
				);

				const json = response.json;

				if (json.code && json.code >= 400) {
					console.warn(`API returned error code ${json.code}: ${apiUrl}`);
					lastError = new Error(`API error ${json.code}: ${json.message || "Unknown"}`);
					continue;
				}

				return json;
			} catch (err) {
				console.warn(`Failed to fetch from ${apiUrl}:`, err);
				lastError = err as Error;
			}
		}

		throw lastError ?? new Error("All API requests failed");
	}

	// ── 履歴から使用回数の多いタグ上位を取得 ──
	getTopRecentTags(maxTags = 20): string[] {
		const history = this.settings.recentTagHistory || [];
		const counts: Record<string, number> = {};

		for (const entry of history) {
			const tags: string[] = Array.isArray(entry)
				? entry
				: (entry.all || []);
			for (const tag of tags) {
				const clean = tag.replace(/^#/, "");
				counts[clean] = (counts[clean] || 0) + 1;
			}
		}

		return Object.entries(counts)
			.sort((a, b) => b[1] - a[1])
			.slice(0, maxTags)
			.map(([tag]) => tag);
	}

	// ── タグ履歴を更新 ──
	async recordTagHistory(manualTags: string[], autoTags: string[]): Promise<void> {
		const allTags = [...manualTags, ...autoTags];
		if (allTags.length === 0) return;

		const history = this.settings.recentTagHistory || [];
		history.push({
			manual: manualTags,
			auto: autoTags,
			all: allTags,
		});

		this.settings.recentTagHistory = history;
		await this.saveSettings();
	}

	// ── モーダルを開いてポストを保存する ──
	openClipPostModal(directUrl?: string): void {
		const suggestedTags = this.getTopRecentTags(20);

		const history = this.settings.recentTagHistory || [];
		let lastUsedTags: string[] = [];
		if (history.length > 0) {
			const lastEntry = history[history.length - 1];
			const manualTags: string[] = Array.isArray(lastEntry)
				? lastEntry
				: (lastEntry.manual || []);
			lastUsedTags = manualTags.map((t) => t.replace(/^#/, ""));
		}

		const onSubmit = async (url: string, shouldOpen: boolean, tags: string): Promise<void> => {
				if (!url.trim()) {
					new Notice("Please enter a valid post URL");
					return;
				}

				const parsed = this.parsePostUrl(url);
				if (!parsed) {
					new Notice("Invalid X/Twitter URL format");
					return;
				}

				new Notice("Fetching post data...");

				try {
					const data = await this.fetchPostData(parsed.screenName, parsed.statusId);
					const tweet = data.tweet;

					if (!tweet) {
						new Notice("Could not retrieve post data");
						return;
					}

					const authorName: string = tweet.author?.name || parsed.screenName;
					const authorScreenName: string = tweet.author?.screen_name || parsed.screenName;
					const postUrl = `https://x.com/${authorScreenName}/status/${parsed.statusId}`;
					const authorUrl = `https://x.com/${authorScreenName}`;
					const postText: string = selectPostText(tweet.article, tweet.text);

					// 画像URLを収集
					const imageUrls: string[] = [];
					if (tweet.media?.photos) {
						for (const photo of tweet.media.photos) {
							if (photo.url) imageUrls.push(photo.url);
						}
					}

					// 動画URLを収集
					const videoUrls: string[] = [];
					if (tweet.media?.videos) {
						for (const video of tweet.media.videos) {
							if (video.url) videoUrls.push(video.url);
						}
					}
					if (tweet.article) {
						const articleMedia = getArticleMedia(tweet.article);
						imageUrls.push(...articleMedia.images);
						videoUrls.push(...articleMedia.videos);
					}

					// メディアをダウンロード
					let savedImagePaths: string[] = [];
					let savedVideoPaths: string[] = [];
					const totalMedia = imageUrls.length + videoUrls.length;

					if (totalMedia > 0) {
						new Notice(`Downloading ${totalMedia} media file(s)...`);
					}

					const folder = this.settings.postsFolder.trim();
					if (imageUrls.length > 0) {
						savedImagePaths = await this.downloadMedia(imageUrls, "image", folder);
					}
					if (videoUrls.length > 0) {
						savedVideoPaths = await this.downloadMedia(videoUrls, "video", folder);
					}

					// タグを整形
					const userTags = tags
						.trim()
						.split(/\s+/)
						.filter((t) => t.length > 0)
						.map((t) => (t.startsWith("#") ? t : `#${t}`));

					// ポスト本文からハッシュタグを自動抽出
					const postTags: string[] = postText.match(HASHTAG_REGEX) || [];

					console.debug("[X Clipper] Post text:", postText);
					console.debug("[X Clipper] Extracted post tags:", postTags);
					console.debug("[X Clipper] User tags:", userTags);

					// 重複を除いて結合
					const seen = new Set<string>();
					const parsedTags: string[] = [];
					for (const t of [...userTags, ...postTags]) {
						const normalized = t.replace(/^＃/, "#");
						const key = normalized.toLowerCase();
						if (!seen.has(key)) {
							seen.add(key);
							parsedTags.push(normalized);
						}
					}

					console.debug("[X Clipper] Final parsedTags:", parsedTags);

					const filePath = await this.savePostAsNote({
						url: postUrl,
						author_name: authorName,
						author_url: authorUrl,
						post_text: postText,
						images: savedImagePaths,
						videos: savedVideoPaths,
						tags: parsedTags,
					});

					const mediaParts: string[] = [];
					if (savedImagePaths.length > 0) mediaParts.push(`${savedImagePaths.length} image(s)`);
					if (savedVideoPaths.length > 0) mediaParts.push(`${savedVideoPaths.length} video(s)`);
					const mediaMsg = mediaParts.length > 0 ? ` (${mediaParts.join(", ")} saved)` : "";
					new Notice(`Post saved successfully!${mediaMsg}`);

					await this.recordTagHistory(userTags, postTags);

					if (shouldOpen) {
						const file = this.app.vault.getAbstractFileByPath(filePath);
						if (file && file instanceof TFile) {
							void this.app.workspace.getLeaf().openFile(file);
						}
					}
				} catch (err) {
					console.error("Error fetching post data:", err);
					const errMsg = (err as Error).message || "Unknown error";
					new Notice(`Error: ${errMsg}. Please check the URL.`);
				}
		};

		if (directUrl) {
			void onSubmit(directUrl, this.settings.openAfterSave, "");
			return;
		}

		new ClipPostModal(
			this.app,
			onSubmit,
			this.settings.openAfterSave,
			suggestedTags,
			lastUsedTags
		).open();
	}

	// ── リトライ付きリクエスト ──
	async requestWithRetries<T>(fn: () => Promise<T>, maxRetries: number, delayMs: number): Promise<T> {
		let lastError: Error | undefined;

		for (let attempt = 1; attempt <= maxRetries; attempt++) {
			try {
				return await fn();
			} catch (err) {
				lastError = err as Error;
				if (attempt < maxRetries) {
					await new Promise((resolve) => setTimeout(resolve, delayMs));
				}
			}
		}

		throw lastError ?? new Error("All retries failed");
	}

	// ── フォルダを再帰的に作成 ──
	async ensureFolderExists(folderPath: string): Promise<void> {
		const { vault } = this.app;
		const normalized = normalizePath(folderPath);

		if (!normalized) return;

		const existing = vault.getAbstractFileByPath(normalized);
		if (existing) return;

		const parts = normalized.split("/");
		let current = "";
		for (const part of parts) {
			current = current ? `${current}/${part}` : part;
			const currentNorm = normalizePath(current);
			if (!vault.getAbstractFileByPath(currentNorm)) {
				try {
					await vault.createFolder(currentNorm);
				} catch (err) {
					if (!(err as Error).message?.includes("Folder already exists")) {
						throw err;
					}
				}
			}
		}
	}

	// ── メディアをダウンロードしてattachmentsフォルダに保存 ──
	async downloadMedia(urls: string[], type: "image" | "video", postsFolder: string): Promise<string[]> {
		const { vault } = this.app;
		const savedPaths: string[] = [];

		// attachmentsフォルダのパスを決定（postsFolder の中に作成）
		let attachmentsFolder: string;
		if (postsFolder) {
			attachmentsFolder = normalizePath(`${postsFolder}/attachments`);
		} else {
			attachmentsFolder = "attachments";
		}

		console.debug("[X Clipper] postsFolder:", postsFolder);
		console.debug("[X Clipper] attachmentsFolder:", attachmentsFolder);

		await this.ensureFolderExists(attachmentsFolder);

		for (let i = 0; i < urls.length; i++) {
			try {
				const mediaUrl = urls[i];
				const response = await requestUrl({ url: mediaUrl, method: "GET" });
				const contentType = response.headers["content-type"] || "";

				let ext: string;
				if (type === "video") {
					if (contentType.includes("mp4") || mediaUrl.includes(".mp4")) ext = "mp4";
					else if (contentType.includes("webm")) ext = "webm";
					else ext = "mp4";
				} else {
					if (contentType.includes("png")) ext = "png";
					else if (contentType.includes("gif")) ext = "gif";
					else if (contentType.includes("webp")) ext = "webp";
					else ext = "jpg";
				}

				const timestamp = Date.now();
				const prefix = type === "video" ? "post_video" : "post_img";
				const fileName = `${prefix}_${timestamp}_${i + 1}.${ext}`;
				const filePath = normalizePath(`${attachmentsFolder}/${fileName}`);

				await vault.createBinary(filePath, response.arrayBuffer);
				savedPaths.push(fileName);
			} catch (err) {
				console.error(`Failed to download ${type} ${i + 1}:`, err);
				new Notice(`Failed to download ${type} ${i + 1}`);
			}
		}

		return savedPaths;
	}

	// ── ポストをMarkdownノートとして保存 ──
	async savePostAsNote(data: PostNoteData): Promise<string> {
		try {
			const { vault } = this.app;
			const folder = this.settings.postsFolder.trim() || "";

			if (folder) {
				await this.ensureFolderExists(folder);
			}

			const authorClean = data.author_name
				.replace(/[\r\n]+/g, " ")
				.replace(EMOJI_REGEX, "")
				.replace(SANITIZE_REGEX, "")
				.replace(/\s+/g, " ")
				.trim();
			const textPreview = data.post_text
				.replace(/[\r\n]+/g, " ")
				.replace(EMOJI_REGEX, "")
				.substring(0, 30)
				.replace(SANITIZE_REGEX, "")
				.replace(/\s+/g, " ")
				.trim()
				.substring(0, 20);

			const safeAuthor = authorClean || "unknown";
			const safePreview = textPreview || "post";
			const fileName = `${safeAuthor} - ${safePreview}....md`;
			const filePath = folder
				? normalizePath(`${folder}/${fileName}`)
				: fileName;

			const content = this.createMarkdownContent(data);

			const existing = vault.getAbstractFileByPath(filePath);
			if (existing && existing instanceof TFile) {
				await vault.modify(existing, content);
			} else {
				await vault.create(filePath, content);
			}

			if (this.settings.copyPathToClipboard) {
				await navigator.clipboard.writeText(`[[${fileName}]]`);
			}

			return filePath;
		} catch (err) {
			new Notice("Error saving post as note");
			throw err;
		}
	}

	// ── Markdownコンテンツを生成 ──
	createMarkdownContent(data: PostNoteData): string {
		const { url, author_name, author_url, post_text, images, videos, tags } = data;
		const now = new Date();

		const dateStr =
			now.toLocaleDateString("ja-JP", { year: "numeric", month: "long", day: "numeric" }) +
			" " +
			now.toLocaleTimeString("ja-JP", { hour12: false, hour: "2-digit", minute: "2-digit" });

		const isoStr = now.toISOString();

		let mediaSection = "";
		const mediaParts: string[] = [];
		if (images && images.length > 0) {
			mediaParts.push(...images.map((img) => `![[${img}]]`));
		}
		if (videos && videos.length > 0) {
			mediaParts.push(...videos.map((vid) => `![[${vid}]]`));
		}
		if (mediaParts.length > 0) {
			mediaSection = "\n" + mediaParts.join("\n") + "\n";
		}

		let tagsYaml = "";
		let tagsInline = "";
		if (tags && tags.length > 0) {
			const cleanTags = tags.map((t) => t.replace(/^#/, ""));
			tagsYaml = `\ntags: [${cleanTags.map((t) => `"${t}"`).join(", ")}]`;
			tagsInline = "\n" + tags.join(" ") + "\n";
		}

		return `---
author: "${author_name}"
author_url: "${author_url}"
post_url: "${url}"
date_saved: ${isoStr}${tagsYaml}
---
# Post by ${author_name}
${post_text}

${mediaSection}
---
${tagsInline}
**Author:** [${author_name}](${author_url})
**Original Post:** [View on X](${url})
**Saved:** ${dateStr}
`;
	}
}
