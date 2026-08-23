import {
	CONFIG_DIR_NAME,
	VERSION,
	getAgentDir,
	type ExtensionAPI,
	type ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import type { Component, TUI } from "@earendil-works/pi-tui";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import {
	readFileSync,
	writeFileSync,
	readdirSync,
	existsSync,
	copyFileSync,
	mkdirSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";

/* ── Types ── */
interface CCHeaderConfig extends Record<string, any> {
	readOnlyConfig?: boolean;
}

interface SettingsFile {
	ccHeader?: CCHeaderConfig;
	quietStartup?: boolean;
	clearOnStart?: boolean;
	packages?: string[];
	[key: string]: any;
}

interface CCHeaderState {
	logoColorKey: string;
	versionColored: number; // 0=off 1=Pi only 2=Pi+ver
	gradientOn: boolean;
	stripeEnabled: boolean;
	showPkgSkills: boolean;
	logoInterval: number;
	slogan: string;
	sloganOn: boolean;
	sloganColor: boolean;
	sloganColorKey: string;
	disabled: boolean;
	showModelLine: boolean; // NEW: toggle model/thinking line
	customLogoLines: string[] | null;
}

/* ── Constants ── */
const SPEEDS = [25, 50, 75, 100] as const;
const LOGO_COLS = 8;
const LOGO_ROWS = 7;
const LOGO_PIXEL_WIDTH = 14;
export const MAX_SLOGAN_LENGTH = 250;
const COLOR_NAMES: Record<string, string> = {
	a: "anthropic",
	c: "clawd",
	r: "red",
	o: "orange",
	y: "yellow",
	g: "green",
	w: "white",
	b: "blue",
	p: "purple",
};
const DEFAULT_STATE: CCHeaderState = {
	logoColorKey: "c",
	versionColored: 1,
	gradientOn: true,
	stripeEnabled: true,
	showPkgSkills: false,
	logoInterval: SPEEDS[1],
	slogan: "Code something that makes you proud",
	sloganOn: true,
	sloganColor: true,
	sloganColorKey: "c",
	quoteMode: false,
	disabled: false,
	showModelLine: true,
	customLogoLines: null,
};
const CMAP: Record<string, string> = {
	a: "38;2;217;119;87",
	r: "31",
	o: "38;5;208",
	y: "38;5;226",
	g: "38;2;20;180;20",
	w: "38;5;15",
	b: "38;2;40;130;220",
	p: "38;5;129",
	c: "38;2;251;73;52",
};
const QUOTE_AUTHOR_COMPLEMENT: Record<string, string> = {
	a: "38;2;38;136;168",
	r: "38;5;51",
	o: "38;2;50;135;255",
	y: "38;2;180;60;255",
	g: "38;2;235;75;235",
	w: "38;5;240",
	b: "38;5;208",
	p: "38;5;226",
	c: "38;2;4;182;203",
};
const GMAP: Record<string, string[]> = {
	a: ["38;2;217;119;87", "38;2;200;100;70", "38;2;170;80;55", "38;2;130;60;40"],
	r: ["38;2;255;80;80", "38;2;220;40;40", "38;2;180;20;20", "38;2;140;10;10"],
	o: [
		"38;2;255;170;50",
		"38;2;230;140;30",
		"38;2;200;110;20",
		"38;2;160;80;10",
	],
	y: [
		"38;2;255;255;80",
		"38;2;230;230;40",
		"38;2;200;200;20",
		"38;2;160;160;10",
	],
	g: ["38;2;80;255;80", "38;2;40;220;40", "38;2;20;180;20", "38;2;10;140;10"],
	w: [
		"38;2;230;230;210",
		"38;2;190;190;170",
		"38;2;140;140;120",
		"38;2;100;100;85",
	],
	b: [
		"38;2;100;180;255",
		"38;2;70;160;245",
		"38;2;40;130;220",
		"38;2;20;100;195",
	],
	p: [
		"38;2;200;100;255",
		"38;2;170;70;230",
		"38;2;140;40;200",
		"38;2;110;20;160",
	],
	c: ["38;2;251;73;52", "38;2;220;60;40", "38;2;190;45;30", "38;2;155;30;20"],
};
const GRADIENT_LEVEL: Record<string, number> = {
	l1: 0,
	l2: 1,
	l3: 2,
	l4: 3,
	s1: 0,
	s2: 1,
	s3: 2,
	s4: 3,
};

/* ── Runtime state ── */
let state: CCHeaderState = { ...DEFAULT_STATE };
let framesDirty = true;

/* ── Quotes ── */
interface Quote {
	quote: string;
	author: string;
}

let quotesCache: Quote[] | null = null;

function loadQuotes(ctx: ExtensionContext): Quote[] {
	if (quotesCache) return quotesCache;

	const projectRoot = ctx.cwd;
	const quotesPath = join(projectRoot, "quotes.json");

	if (!existsSync(quotesPath)) {
		// Try the package directory as fallback
		const __filename = fileURLToPath(import.meta.url);
		const pkgDir = dirname(dirname(__filename));
		const fallbackPath = join(pkgDir, "quotes.json");
		if (existsSync(fallbackPath)) {
			try {
				quotesCache = JSON.parse(readFileSync(fallbackPath, "utf-8"));
				return quotesCache!;
			} catch {
				return [];
			}
		}
		return [];
	}

	try {
		quotesCache = JSON.parse(readFileSync(quotesPath, "utf-8"));
		return quotesCache!;
	} catch {
		return [];
	}
}

export function formatQuote(quote: string, author: string, punctBonus = 25): string {
	const words = quote.trim().split(/\s+/);
	if (words.length <= 10) {
		return `"${quote}"\n${author}`;
	}

	let bestI = 1;
	let bestScore = Infinity;
	for (let i = 1; i < words.length; i++) {
		const p1 = words.slice(0, i).join(" ");
		const p2 = words.slice(i).join(" ");
		const lenDiff = Math.abs(p1.length - p2.length);
		const lastChar = p1[p1.length - 1];
		const hasPunct = [":", ".", ",", ";", "-", "—"].includes(lastChar);
		const score = lenDiff - (hasPunct ? punctBonus : 0);
		if (score < bestScore) {
			bestScore = score;
			bestI = i;
		}
	}

	const line1 = `"${words.slice(0, bestI).join(" ")}`;
	const line2 = `${words.slice(bestI).join(" ")}"`;
	return `${line1}\n${line2}\n${author}`;
}

export function getRandomQuote(ctx: ExtensionContext): string | null {
	const quotes = loadQuotes(ctx);
	if (quotes.length === 0) return null;
	const random = quotes[Math.floor(Math.random() * quotes.length)];
	return formatQuote(random.quote, random.author);
}

export function formatQuoteAuthor(author: string, colorKey: string): string {
	const color = QUOTE_AUTHOR_COMPLEMENT[colorKey] ?? QUOTE_AUTHOR_COMPLEMENT.c;
	return `\x1b[38;5;244m~\x1b[39m\x1b[${color}m${author}\x1b[39m`;
}

/* ── Pi logo animation ── */
type LogoColor =
	| "panel"
	| "cyan"
	| "red"
	| "green"
	| "orange"
	| "flash"
	| "logo"
	| "logoStripe"
	| "white"
	| "l1"
	| "l2"
	| "l3"
	| "l4"
	| "s1"
	| "s2"
	| "s3"
	| "s4";
type LogoPhase = "left" | "top" | "right" | "none";
type LogoFrame = {
	phase: number;
	active: LogoPhase;
	ax: number;
	ay: number;
	flash: boolean;
	white: boolean;
};

const LOGO_FRAMES: LogoFrame[] = [
	...Array.from({ length: 4 }, (_, ay) => ({
		phase: 0,
		active: "left" as const,
		ax: 2,
		ay,
		flash: false,
		white: false,
	})),
	...Array.from({ length: 3 }, (_, ay) => ({
		phase: 1,
		active: "top" as const,
		ax: 2,
		ay,
		flash: false,
		white: false,
	})),
	...Array.from({ length: 5 }, (_, ay) => ({
		phase: 2,
		active: "right" as const,
		ax: 5,
		ay,
		flash: false,
		white: false,
	})),
	{ phase: 3, active: "none", ax: 0, ay: 0, flash: false, white: false },
	{ phase: 3, active: "none", ax: 0, ay: 0, flash: true, white: false },
	{ phase: 3, active: "none", ax: 0, ay: 0, flash: false, white: false },
	{ phase: 3, active: "none", ax: 0, ay: 0, flash: true, white: false },
	{ phase: 4, active: "none", ax: 0, ay: 0, flash: false, white: false },
	{ phase: 5, active: "none", ax: 0, ay: 0, flash: false, white: false },
	{ phase: 5, active: "none", ax: 0, ay: 0, flash: false, white: true },
	{ phase: 5, active: "none", ax: 0, ay: 0, flash: false, white: false },
	{ phase: 5, active: "none", ax: 0, ay: 0, flash: false, white: true },
	{ phase: 6, active: "none", ax: 0, ay: 0, flash: false, white: false },
];
const LAST_FRAME_INDEX = LOGO_FRAMES.length - 1;

export const colorCell = (color: LogoColor): string => {
	const cg = (n: number) => GMAP[state.logoColorKey]?.[n] ?? "34";
	switch (color) {
		case "cyan":
			return "\x1b[36m██\x1b[39m";
		case "red":
			return "\x1b[31m██\x1b[39m";
		case "green":
			return "\x1b[32m██\x1b[39m";
		case "orange":
		case "flash":
			return "\x1b[33m██\x1b[39m";
		case "white":
			return "\x1b[39m██";
		case "logo":
			return `\x1b[${CMAP[state.logoColorKey]}m██\x1b[39m`;
		case "logoStripe":
			return `\x1b[${CMAP[state.logoColorKey]}m──\x1b[39m`;
		case "l1":
		case "l2":
		case "l3":
		case "l4":
		case "s1":
		case "s2":
		case "s3":
		case "s4":
			return `\x1b[${cg(GRADIENT_LEVEL[color])}m${color[0] === "l" ? "██" : "──"}\x1b[39m`;
		default:
			return "  ";
	}
};

const WHITE_CELLS = new Set([
	"3,2",
	"3,3",
	"3,4",
	"4,2",
	"4,4",
	"5,2",
	"5,3",
	"5,5",
	"6,2",
	"6,5",
]);
const P4_CYAN = new Set(["2,2", "2,3", "2,4", "3,4"]);
const P4_RED = new Set(["3,2", "4,2", "4,3", "5,2"]);
const P4_GREEN = new Set(["4,5", "5,5"]);
const P5_CYAN = new Set(["3,2", "3,3", "3,4", "4,4"]);
const P5_RED = new Set(["4,2", "5,2", "5,3", "6,2"]);
const P5_GREEN = new Set(["5,5", "6,5"]);
const EARLY_ORANGE = new Set(["6,1", "6,2", "6,3", "6,4"]);
const LATE_GREEN = new Set(["4,5", "5,5", "6,5", "6,6"]);
const PIECE_LEFT: [number, number][] = [
	[0, 0],
	[1, 0],
	[1, 1],
	[2, 0],
];
const PIECE_TOP: [number, number][] = [
	[0, 0],
	[0, 1],
	[0, 2],
	[1, 2],
];
const PIECE_RIGHT: [number, number][] = [
	[0, 0],
	[1, 0],
	[2, 0],
	[2, 1],
];

export function logoCellColor(
	frame: LogoFrame,
	y: number,
	x: number,
): LogoColor {
	const key = `${y},${x}`;

	if (frame.white) return WHITE_CELLS.has(key) ? "white" : "panel";
	if (frame.flash && y === 6 && x >= 1 && x <= 6) return "flash";

	if (
		frame.active === "left" &&
		PIECE_LEFT.some(([dy, dx]) => y === frame.ay + dy && x === frame.ax + dx)
	)
		return "red";
	if (
		frame.active === "top" &&
		PIECE_TOP.some(([dy, dx]) => y === frame.ay + dy && x === frame.ax + dx)
	)
		return "cyan";
	if (
		frame.active === "right" &&
		PIECE_RIGHT.some(([dy, dx]) => y === frame.ay + dy && x === frame.ax + dx)
	)
		return "green";

	if (frame.phase === 6) {
		const isPi = WHITE_CELLS.has(key);
		const lvl = state.gradientOn
			? y <= 3
				? 1
				: y === 4
					? 2
					: y === 5
						? 3
						: 4
			: 0;
		if (isPi) return lvl > 0 ? (("l" + lvl) as LogoColor) : "logo";
		return state.stripeEnabled && y >= 2 && y <= LOGO_ROWS && x <= 6
			? lvl > 0
				? (("s" + lvl) as LogoColor)
				: "logoStripe"
			: "panel";
	}
	if (frame.phase === 4) {
		if (P4_CYAN.has(key)) return "cyan";
		if (P4_RED.has(key)) return "red";
		if (P4_GREEN.has(key)) return "green";
		return "panel";
	}
	if (frame.phase >= 5) {
		if (P5_CYAN.has(key)) return "cyan";
		if (P5_RED.has(key)) return "red";
		if (P5_GREEN.has(key)) return "green";
		return "panel";
	}
	if (frame.phase <= 3 && EARLY_ORANGE.has(key)) return "orange";
	if (frame.phase >= 2 && P4_CYAN.has(key)) return "cyan";
	if (frame.phase >= 1 && P4_RED.has(key)) return "red";
	if (frame.phase >= 3 && LATE_GREEN.has(key)) return "green";
	return "panel";
}

function piLogoFrame(frameIndex: number): string[] {
	if (frameIndex === LAST_FRAME_INDEX && state.customLogoLines) {
		return state.customLogoLines;
	}
	const frame = LOGO_FRAMES[frameIndex];
	const lines: string[] = [];
	for (let y = 1; y <= LOGO_ROWS; y++) {
		let line = "";
		for (let x = 1; x <= LOGO_COLS; x++)
			line += colorCell(logoCellColor(frame, y, x));
		lines.push(line);
	}
	return lines;
}

let PRECOMPUTED_LOGO_FRAMES: string[][] = LOGO_FRAMES.map((_, i) =>
	piLogoFrame(i),
);

function recomputeFrames(): void {
	PRECOMPUTED_LOGO_FRAMES = LOGO_FRAMES.map((_, i) => piLogoFrame(i));
	framesDirty = false;
}

/* ── Utilities ── */
export function formatCwd(cwd: string): string {
	const home = homedir();
	return home && cwd.startsWith(home) ? `~${cwd.slice(home.length)}` : cwd;
}

function padRight(text: string, width: number): string {
	const clipped = truncateToWidth(text, width, "");
	return clipped + " ".repeat(Math.max(0, width - visibleWidth(clipped)));
}

export function buildRuntimePaths(
	agentDir: string,
	cwd?: string,
	configDirName: string = CONFIG_DIR_NAME,
) {
	return {
		agentDir,
		settingsPath: join(agentDir, "settings.json"),
		npmRoot: join(agentDir, "npm", "node_modules"),
		globalSkillsDir: join(agentDir, "skills"),
		globalAgentsPath: join(agentDir, "AGENTS.md"),
		projectSkillsDir: cwd ? join(cwd, configDirName, "skills") : undefined,
		projectAgentsPath: cwd ? join(cwd, configDirName, "AGENTS.md") : undefined,
	};
}

function getRuntimePaths(cwd?: string) {
	return buildRuntimePaths(getAgentDir(), cwd);
}

/* ── Stats ── */
function computeStats(ctx: ExtensionContext) {
	const home = homedir();
	const paths = getRuntimePaths(ctx.cwd);
	const root = paths.npmRoot;
	const settingsPath = paths.settingsPath;

	let settingsPackages: string[] = [];
	try {
		const s = readSettings(settingsPath);
		if (s && Array.isArray(s.packages)) settingsPackages = s.packages;
	} catch {
		console.warn("pi-cc-header: failed to read settings.json");
	}
	const settingsNames = new Set(
		settingsPackages.map((p) => String(p).replace(/^npm:/, "")),
	);
	const installed = settingsPackages.length;
	let residue = 0;
	let prompts = 0;
	let pkgSkills = 0;

	function scanPkg(m: any, pkgDir: string, pkgName: string) {
		if (!m.pi) return;
		if (!settingsNames.has(pkgName)) residue++;
		if (Array.isArray(m.pi.prompts)) {
			for (const e of m.pi.prompts) {
				let d = join(pkgDir, e);
				if (!existsSync(d)) d = join(pkgDir, e.replace(/^(\.\.?\/)+/, ""));
				if (existsSync(d)) {
					try {
						prompts += readdirSync(d).filter((f: string) =>
							f.endsWith(".md"),
						).length;
					} catch {
						console.warn("pi-cc-header: failed to read prompts dir", d);
					}
				}
			}
		}
		if (Array.isArray(m.pi.skills)) {
			for (const e of m.pi.skills) {
				let d = join(pkgDir, e);
				if (!existsSync(d)) d = join(pkgDir, e.replace(/^(\.\.?\/)+/, ""));
				if (existsSync(d)) {
					try {
						pkgSkills += readdirSync(d, { withFileTypes: true }).filter(
							(f) => f.isDirectory() || f.name.endsWith(".md"),
						).length;
					} catch {
						console.warn("pi-cc-header: failed to read pkg skills dir", d);
					}
				}
			}
		}
	}

	if (existsSync(root)) {
		for (const name of readdirSync(root)) {
			if (name.startsWith(".")) continue;
			if (name.startsWith("@")) {
				let subs: string[];
				try {
					subs = readdirSync(join(root, name));
				} catch {
					console.warn(
						"pi-cc-header: failed to list scoped packages under",
						name,
					);
					continue;
				}
				for (const sub of subs) {
					const pj = join(root, name, sub, "package.json");
					if (!existsSync(pj)) continue;
					try {
						const m = JSON.parse(readFileSync(pj, "utf-8"));
						scanPkg(m, join(root, name, sub), `${name}/${sub}`);
					} catch {
						console.warn("pi-cc-header: failed to parse", pj);
					}
				}
				continue;
			}
			const pj = join(root, name, "package.json");
			if (!existsSync(pj)) continue;
			try {
				const m = JSON.parse(readFileSync(pj, "utf-8"));
				scanPkg(m, join(root, name), name);
			} catch {
				console.warn("pi-cc-header: failed to parse", pj);
			}
		}
	}

	const skillNames = new Set<string>();
	for (const d of [
		join(home, ".agents", "skills"),
		join(ctx.cwd, ".agents", "skills"),
		paths.globalSkillsDir,
		paths.projectSkillsDir,
	].filter((d): d is string => !!d)) {
		if (!existsSync(d)) continue;
		try {
			for (const e of readdirSync(d, { withFileTypes: true })) {
				if (e.isDirectory() || e.name.endsWith(".md")) skillNames.add(e.name);
			}
		} catch {
			console.warn("pi-cc-header: failed to list skills dir", d);
		}
	}

	const globalAgents = existsSync(paths.globalAgentsPath);
	const projectAgents =
		existsSync(join(ctx.cwd, "AGENTS.md")) ||
		(paths.projectAgentsPath != null && existsSync(paths.projectAgentsPath));

	return {
		extensions: { installed, residue },
		skills: skillNames.size,
		pkgSkills,
		prompts,
		agents:
			globalAgents && projectAgents
				? "Aa"
				: globalAgents
					? "A"
					: projectAgents
						? "a"
						: "",
	};
}

let cachedStats: ReturnType<typeof computeStats> | null = null;
function invalidateStats(): void {
	cachedStats = null;
}

/* ── Component: startup header ── */
class PiHeader implements Component {
	private frame = 0;
	private timer: ReturnType<typeof setTimeout> | null = null;
	private readonly stats: ReturnType<typeof computeStats>;
	private cachedInfoRows: Record<number, string> | null = null;
	private cachedInfoWidth = -1;

	constructor(
		private readonly pi: ExtensionAPI,
		private readonly ctx: ExtensionContext,
		private readonly tui: TUI,
		skipAnimation: boolean = false,
	) {
		cachedStats ??= computeStats(ctx);
		this.stats = cachedStats!;

		if (skipAnimation) {
			this.frame = LAST_FRAME_INDEX;
		} else {
			const tick = () => {
				if (this.frame < LAST_FRAME_INDEX) {
					this.frame++;
					this.tui.requestRender();
					this.timer = setTimeout(tick, state.logoInterval);
				} else {
					this.timer = null;
					this.tui.requestRender();
				}
			};
			this.timer = setTimeout(tick, state.logoInterval);
			this.timer.unref?.();
		}
	}

	render(width: number): string[] {
		const theme = this.ctx.ui.theme;
		const muted = (s: string) => theme.fg("muted", s);

		const logoLines = PRECOMPUTED_LOGO_FRAMES[this.frame];
		const logoWidth = LOGO_PIXEL_WIDTH;
		const infoMaxWidth = Math.max(0, width - logoWidth);

		let infoStrings: string[];
		if (this.cachedInfoRows && this.cachedInfoWidth === width) {
			infoStrings = Object.values(this.cachedInfoRows);
		} else {
			const model = this.ctx.model?.id ?? "Default";
			const effort = this.pi.getThinkingLevel();
			const isLocal = /lm\s*studio|ollama|llama\.local|lmstudio/i.test(model);
			const cwd = formatCwd(this.ctx.cwd);
			const skillText = state.showPkgSkills
				? `${this.stats.skills}|${this.stats.pkgSkills} skills`
				: `${this.stats.skills} skills`;
			const extText =
				this.stats.extensions.residue > 0
					? `${this.stats.extensions.installed}(+${this.stats.extensions.residue}) extensions`
					: `${this.stats.extensions.installed} extensions`;
			const piText =
				state.versionColored >= 2
					? `\x1b[${CMAP[state.logoColorKey]}mPi v${VERSION}\x1b[39m`
					: state.versionColored >= 1
						? `\x1b[${CMAP[state.logoColorKey]}mPi\x1b[39m ${muted(`v${VERSION}`)}`
						: muted(`Pi v${VERSION}`);

			const modelLine = `${model} · ${effort}${this.stats.agents ? `  |  ${this.stats.agents}` : ""}`;

			const rows: string[] = [
				piText,
				muted(skillText),
				muted(`${this.stats.prompts} prompts`),
				muted(extText),
			];
			if (state.showModelLine && !isLocal) rows.push(muted(modelLine));
			if (state.sloganOn && state.slogan) {
				rows.push("");
				const sloganLines = state.slogan.split("\n");
			let quoteLineWidth = 0; // Track width of the quote line for author right-justification
				for (let idx = 0; idx < sloganLines.length; idx++) {
					const line = sloganLines[idx];
					const sloganW = visibleWidth(line);
					const sloganText =
						sloganW > infoMaxWidth
							? truncateToWidth(line, infoMaxWidth - 3, "") + "..."
							: line;

					const isAuthor = idx === sloganLines.length - 1 && sloganLines.length > 1;
					if (isAuthor) {
						// Right-justify author to match the width of the quote line above
						const authorW = visibleWidth(sloganText);
						const padding = Math.max(0, quoteLineWidth - authorW);
						const paddedAuthor = " ".repeat(padding) + sloganText;
						rows.push(
							state.sloganColor
								? formatQuoteAuthor(paddedAuthor, state.sloganColorKey)
								: `[38;5;244m~[39m${paddedAuthor}`,
						);
					} else {
						quoteLineWidth = visibleWidth(sloganText);
						rows.push(
							state.sloganColor
								? `[1m[${CMAP[state.sloganColorKey]}m${sloganText}[39m[22m`
								: muted(`[1m${sloganText}[22m`),
						);
					}
				}
			} else {
				rows.push(muted(this.stats.agents ? `${this.stats.agents} · ${cwd}` : cwd));
			}

			infoStrings = rows;
			this.cachedInfoRows = Object.fromEntries(rows.map((r, i) => [i, r]));
			this.cachedInfoWidth = width;
		}

		// Logo rows 1..5 (y=2..6) paired with info rows 0..3 at indices 2..5
		const LOGO_INFO_MAP: Record<number, number> = { 2: 0, 3: 1, 4: 2, 5: 3 };

		// Build combined logo+info lines
		const combinedLines: string[] = [];
		for (let i = 1; i < logoLines.length - 1; i++) {
			const infoIdx = LOGO_INFO_MAP[i];
			const right = infoIdx != null ? infoStrings[infoIdx] : "";
			combinedLines.push(padRight(logoLines[i], logoWidth) + right);
		}

		const maxLineW = Math.max(...combinedLines.map((s) => visibleWidth(s)));
		const leftPad = Math.max(0, Math.floor((width - maxLineW) / 2));

		const lines: string[] = [];
		for (const cl of combinedLines) {
			lines.push(" ".repeat(leftPad) + truncateToWidth(cl, width - leftPad, ""));
		}

		// Remaining info rows (model, slogan, cwd) centered independently
		const center = (text: string, w: number): string => {
			const vw = visibleWidth(text);
			const pad = Math.max(0, Math.floor((w - vw) / 2));
			return " ".repeat(pad) + text + " ".repeat(Math.max(0, w - pad - vw));
		};
		for (let i = 4; i < infoStrings.length; i++) {
			const row = infoStrings[i];
			lines.push(
				row === "" ? "" : center(truncateToWidth(row, width, ""), width),
			);
		}
		return lines;
	}

	invalidate(): void {}
	reapply(): void {
		this.cachedInfoRows = null;
		this.tui.requestRender();
	}
	dispose(): void {
		if (this.timer != null) clearTimeout(this.timer);
	}
}

/* ── Mount ── */
let active: PiHeader | undefined;
let isResuming = false;

function apply(
	pi: ExtensionAPI,
	ctx: ExtensionContext,
	clearMode: "full" | "viewport" | "none",
	skipAnimation: boolean = false,
) {
	if (ctx.mode !== "tui") return;
	if (clearMode === "full") {
		process.stdout.write("\x1b[2J\x1b[3J\x1b[H");
	} else if (clearMode === "viewport") {
		process.stdout.write("\x1b[2J");
	}
	ctx.ui.setHeader((tui) => {
		active?.dispose();
		active = new PiHeader(pi, ctx, tui, skipAnimation);
		return active;
	});
}

/* ── State <-> config serialization ── */
export const pick = <T>(
	val: unknown,
	guard: (v: unknown) => boolean,
	fallback: T,
): T => (guard(val) ? (val as T) : fallback);

export function stateFromConfig(h: Record<string, any>): CCHeaderState {
	return {
		logoColorKey: pick(
			h.color,
			(v) => !!CMAP[v as string],
			DEFAULT_STATE.logoColorKey,
		),
		versionColored: pick(
			h.ver,
			(v) => typeof v === "number",
			DEFAULT_STATE.versionColored,
		),
		gradientOn: pick(
			h.grad,
			(v) => typeof v === "boolean",
			DEFAULT_STATE.gradientOn,
		),
		stripeEnabled: pick(
			h.lines,
			(v) => typeof v === "boolean",
			DEFAULT_STATE.stripeEnabled,
		),
		showPkgSkills: pick(
			h.pkg,
			(v) => typeof v === "boolean",
			DEFAULT_STATE.showPkgSkills,
		),
		logoInterval: pick(
			h.speed,
			(v) => typeof v === "number" && (SPEEDS as readonly number[]).includes(v),
			DEFAULT_STATE.logoInterval,
		),
		slogan: pick(
			h.slogan,
			(v) => typeof v === "string" && v.length <= MAX_SLOGAN_LENGTH,
			DEFAULT_STATE.slogan,
		),
		sloganOn: pick(
			h.sloganOn,
			(v) => typeof v === "boolean",
			DEFAULT_STATE.sloganOn,
		),
		sloganColor: pick(
			h.sloganColor,
			(v) => typeof v === "boolean",
			DEFAULT_STATE.sloganColor,
		),
		sloganColorKey: pick(
			h.sloganColorKey ?? h.sloganColorCode,
			(v) => !!CMAP[v as string],
			DEFAULT_STATE.sloganColorKey,
		),
		quoteMode: pick(
			(h.quoteMode ?? h.stoicMode),
			(v) => typeof v === "boolean",
			DEFAULT_STATE.quoteMode,
		),
		disabled: pick(
			h.disabled,
			(v) => typeof v === "boolean",
			DEFAULT_STATE.disabled,
		),
		showModelLine: pick(
			h.showModelLine,
			(v) => typeof v === "boolean",
			DEFAULT_STATE.showModelLine,
		),
		customLogoLines: pick(
			h.customLogo,
			(v) => Array.isArray(v) && v.every((l) => typeof l === "string"),
			DEFAULT_STATE.customLogoLines,
		),
	};
}

function stateToConfig(): Record<string, any> {
	return {
		color: state.logoColorKey,
		ver: state.versionColored,
		grad: state.gradientOn,
		lines: state.stripeEnabled,
		pkg: state.showPkgSkills,
		speed: state.logoInterval,
		slogan: state.slogan,
		sloganOn: state.sloganOn,
		sloganColor: state.sloganColor,
		sloganColorKey: state.sloganColorKey,
		quoteMode: state.quoteMode,
		disabled: state.disabled,
		showModelLine: state.showModelLine,
		customLogo: state.customLogoLines,
	};
}

function getCCHeaderConfig(
	settings: SettingsFile | null | undefined,
): CCHeaderConfig {
	const ccHeader = settings?.ccHeader;
	return ccHeader && typeof ccHeader === "object" && !Array.isArray(ccHeader)
		? ccHeader
		: {};
}

export function configWritesEnabled(
	settings: SettingsFile | null | undefined,
): boolean {
	return getCCHeaderConfig(settings).readOnlyConfig !== true;
}

type PersistResult = "saved" | "skipped" | "failed";

function isReadonlyWriteError(error: unknown): boolean {
	if (!error || typeof error !== "object" || !("code" in error)) return false;
	return ["EROFS", "EACCES", "EPERM"].includes(
		String((error as NodeJS.ErrnoException).code),
	);
}

/* ── Config update ── */
function updateState(
	ctx: ExtensionContext,
	applyAndPersist: (msg: string) => void,
	updater: (s: CCHeaderState) => string | null,
	skipFrames: boolean = false,
): void {
	if (state.disabled) {
		ctx.ui.notify(
			"Command unavailable: pi-cc-header disabled. Use /pch --tg to enable.",
			"info",
		);
		return;
	}

	const prevColor = state.logoColorKey;
	const prevGrad = state.gradientOn;
	const prevStripe = state.stripeEnabled;

	const msg = updater(state);
	if (msg === null) return;

	if (
		(!skipFrames && state.logoColorKey !== prevColor) ||
		state.gradientOn !== prevGrad ||
		state.stripeEnabled !== prevStripe
	) {
		framesDirty = true;
	}
	if (framesDirty) recomputeFrames();

	applyAndPersist(msg);
}

function emptySettings(): SettingsFile {
	return {};
}

function parseSettingsFile(settingsPath: string): SettingsFile {
	const content = readFileSync(settingsPath, "utf-8");
	try {
		const parsed = JSON.parse(content);
		if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
			throw new Error("pi-cc-header: settings.json must contain an object");
		}
		return parsed;
	} catch (error) {
		throw new Error("pi-cc-header: invalid settings.json", { cause: error });
	}
}

function backupCorruptedSettings(settingsPath: string): void {
	try {
		if (!existsSync(settingsPath)) return;
		const ts = new Date().toISOString().replace(/[:.]/g, "-");
		const bak = settingsPath.replace(/\.json$/, `.bak.${ts}.json`);
		copyFileSync(settingsPath, bak);
		console.error("pi-cc-header: corrupted settings.json backed up to", bak);
	} catch {
		console.error("pi-cc-header: failed to read or back up settings.json");
	}
}

function restoreDefaultSettingsFile(settingsPath: string): void {
	try {
		mkdirSync(dirname(settingsPath), { recursive: true });
		writeFileSync(settingsPath, "{\n}\n", "utf-8");
	} catch {
		console.error("pi-cc-header: failed to restore default settings.json");
	}
}

function readSettings(settingsPath: string): SettingsFile | null {
	if (!existsSync(settingsPath)) return emptySettings();

	try {
		return parseSettingsFile(settingsPath);
	} catch {
		backupCorruptedSettings(settingsPath);
		restoreDefaultSettingsFile(settingsPath);
		return null;
	}
}

/* ── Entry ── */
export default function (pi: ExtensionAPI) {
	const settingsPath = getRuntimePaths().settingsPath;

	const saveSettings = (s: SettingsFile): boolean => {
		try {
			mkdirSync(dirname(settingsPath), { recursive: true });
			writeFileSync(settingsPath, `${JSON.stringify(s, null, 2)}\n`, "utf-8");
			return true;
		} catch (error) {
			if (isReadonlyWriteError(error)) return false;
			console.error("pi-cc-header: failed to write settings.json");
			return false;
		}
	};

	const withPersistenceNote = (
		msg: string,
		settings: SettingsFile,
		persistResult: PersistResult,
	) => {
		if (persistResult === "saved") return msg;
		if (persistResult === "skipped") {
			return `${msg} (session only; ccHeader.readOnlyConfig=true)`;
		}
		return configWritesEnabled(settings)
			? `${msg} (not saved: settings.json is not writable)`
			: `${msg} (session only; ccHeader.readOnlyConfig=true)`;
	};

	const configStartupEnabled = (s: SettingsFile) => {
		if (configWritesEnabled(s)) {
			s.quietStartup = true;
			s.clearOnStart = true;
			saveSettings(s);
		}
		process.stdout.write("\x1b[2J\x1b[3J\x1b[H");
	};

	const reapply = (
		pi: ExtensionAPI,
		ctx: ExtensionContext,
		s: SettingsFile | null,
		msg: string,
	) => {
		if (!s) {
			ctx.ui.notify(
				"pi-cc-header: settings.json is corrupted or unreadable. A backup has been created.",
				"error",
			);
			return;
		}
		let persistResult: PersistResult = "skipped";
		if (configWritesEnabled(s)) {
			s.ccHeader = { ...getCCHeaderConfig(s), ...stateToConfig() };
			persistResult = saveSettings(s) ? "saved" : "failed";
		}
		active?.dispose();
		active = undefined;
		apply(pi, ctx, "none");
		ctx.ui.notify(withPersistenceNote(msg, s, persistResult), "info");
	};

	pi.on("session_before_switch", (event, _ctx) => {
		if (event.reason === "resume") {
			isResuming = true;
		}
	});

	pi.on("session_start", (event, ctx) => {
		const s = readSettings(settingsPath);
		if (!s) {
			ctx.ui.notify(
				"pi-cc-header: settings.json is corrupted or unreadable. A backup has been created and a fresh default restored.",
				"error",
			);
			return;
		}
		const h = getCCHeaderConfig(s);
		state = stateFromConfig(h);
		if (state.disabled) return;

		if (state.quoteMode && state.sloganOn) {
			const quote = getRandomQuote(ctx);
			if (quote) {
				state.slogan = quote;
				if (configWritesEnabled(s)) {
					s.ccHeader = { ...getCCHeaderConfig(s), ...stateToConfig() };
					saveSettings(s);
				}
			}
		}

		configStartupEnabled(s);
		invalidateStats();
		framesDirty = true;
		recomputeFrames();
		const skipAnimation =
			event.reason === "reload" ||
			isResuming ||
			(event.reason === "startup" &&
				(process.argv.includes("-r") ||
					process.argv.includes("--resume") ||
					process.argv.includes("--session")));
		if (isResuming) isResuming = false;
		setTimeout(() => apply(pi, ctx, "none", skipAnimation), 0);
	});

	/* ── /pch command ── */
	pi.registerCommand("pch", {
		description:
			"pi-cc-header control: --tg (toggle enable/disable), --c <color> (logo color), --i (IBM stripes), --m (Minecraft), --sp <ms> (speed), --v [all|pi|off] (version color), --ps (pkg skills), --s [text|-c [code]|-d|-quote] (slogan, -c sets slogan color), --logo (custom ASCII logo), --df (defaults), --cl (clear config), --ml (toggle model/thinking line), --h (help)",
		handler: async (args, ctx) => {
			const s = readSettings(settingsPath);
			if (!s) {
				ctx.ui.notify(
					"pi-cc-header: settings.json is corrupted or unreadable. A backup has been created.",
					"error",
				);
				return;
			}

			// Parse flags
			const argv = args?.trim().split(/\s+/) ?? [];
			if (argv.length === 0 || argv[0] === "--h" || argv[0] === "-h") {
				ctx.ui.notify(
					`pch flags:
  --tg              Toggle header enable/disable (next session)
  --c <code>        Logo color (c/a/r/o/y/g/w/b/p) | no arg = show current
  --i               Toggle IBM stripes
  --m               Toggle Minecraft gradient
  --sp [ms]         Animation speed (25/50/75/100) | no arg = show current
  --v [all|pi|off]  Version label color | no arg = cycle
  --ps              Toggle pkg skills visibility
  --s [txt|-c [code]|-d|-quote] Slogan: set text / toggle on-off / -c slogan color (codes like --c) / -d delete / -quote random quote
  --logo [l1|l2|-d] Custom ASCII logo lines (pipe-separated) | -d = restore built-in
  --df              Reset to developer defaults
  --cl              Clear all config (for uninstall)
  --ml              Toggle model/thinking line
  --h               Show this help`,
					"info",
				);
				return;
			}

			// Find first flag
			const flag = argv[0];
			const flagArg = argv[1];

			const doUpdate = (
				updater: (st: CCHeaderState) => string | null,
				skipFrames = false,
			) => {
				updateState(
					ctx,
					(msg) => reapply(pi, ctx, readSettings(settingsPath), msg),
					updater,
					skipFrames,
				);
			};

			switch (flag) {
				case "--tg": {
					const h = getCCHeaderConfig(s);
					if (state.disabled) {
						state.disabled = false;
						h.disabled = false;
						s.ccHeader = h;
						invalidateStats();
						configStartupEnabled(s);
						reapply(
							pi,
							ctx,
							s,
							configWritesEnabled(s)
								? "pi-cc-header: ENABLED"
								: "pi-cc-header: ENABLED for this session only",
						);
					} else {
						state.disabled = true;
						h.disabled = true;
						active?.dispose();
						active = undefined;
						ctx.ui.setHeader(undefined);
						if (configWritesEnabled(s)) {
							s.ccHeader = h;
							s.quietStartup = false;
							s.clearOnStart = false;
							const saved = saveSettings(s);
							const persistResult: PersistResult = saved ? "saved" : "failed";
							ctx.ui.notify(
								withPersistenceNote(
									"pi-cc-header: DISABLED. Takes effect next session. /pch --tg to re-enable.",
									s,
									persistResult,
								),
								"info",
							);
						} else {
							ctx.ui.notify(
								"pi-cc-header: DISABLED for this session only. Config writes are disabled; /pch --tg to re-enable.",
								"info",
							);
						}
					}
					return;
				}

				case "--c": {
					if (!flagArg) {
						ctx.ui.notify(
							`Header color: ${state.logoColorKey} (${COLOR_NAMES[state.logoColorKey]}). Available: ${Object.entries(COLOR_NAMES)
								.map(([k, n]) => `${k}=${n}`)
								.join(" ")}`,
							"info",
						);
						return;
					}
					doUpdate((st) => {
						if (!CMAP[flagArg]) {
							ctx.ui.notify(
								`Invalid color: "${flagArg}". Available: ${Object.keys(CMAP).join(" ")}`,
								"error",
							);
							return null;
						}
						st.logoColorKey = flagArg;
						return `Color: ${flagArg}`;
					});
					return;
				}

				case "--i": {
					doUpdate((st) => {
						st.stripeEnabled = !st.stripeEnabled;
						return `IBM-style: ${st.stripeEnabled ? "ON" : "OFF"}`;
					});
					return;
				}

				case "--m": {
					doUpdate((st) => {
						st.gradientOn = !st.gradientOn;
						return `Minecraft-style: ${st.gradientOn ? "ON" : "OFF"}`;
					});
					return;
				}

				case "--sp": {
					if (!flagArg) {
						ctx.ui.notify(
							`Animation speed: ${state.logoInterval}ms. Available: ${SPEEDS.join(" ")}`,
							"info",
						);
						return;
					}
					const n = Number(flagArg);
					if (!(SPEEDS as readonly number[]).includes(n)) {
						ctx.ui.notify(
							`Invalid speed: "${n}". Available: ${SPEEDS.join(" ")}`,
							"error",
						);
						return;
					}
					doUpdate((st) => {
						st.logoInterval = n as (typeof SPEEDS)[number];
						return `Animation speed: ${st.logoInterval}ms`;
					});
					return;
				}

				case "--v": {
					if (flagArg) {
						const v = flagArg.trim();
						if (!["all", "pi", "off"].includes(v)) {
							ctx.ui.notify(
								`Invalid value: "${v}". Available: all, pi, off.`,
								"error",
							);
							return;
						}
						doUpdate(
							(st) => {
								st.versionColored = v === "all" ? 2 : v === "pi" ? 1 : 0;
								return `Version label color: ${["OFF", "Pi only", "Pi+ver"][st.versionColored]}`;
							},
							true,
						);
						return;
					}
					doUpdate(
						(st) => {
							st.versionColored = (st.versionColored + 1) % 3;
							return `Version label color: ${["OFF", "Pi only", "Pi+ver"][st.versionColored]}`;
						},
						true,
					);
					return;
				}

				case "--ps": {
					doUpdate((st) => {
						st.showPkgSkills = !st.showPkgSkills;
						return `Pkg skills: ${st.showPkgSkills ? "VISIBLE" : "HIDDEN"}`;
					});
					return;
				}

				case "--s": {
					doUpdate((st) => {
						if (!flagArg) {
							if (!st.slogan) {
								ctx.ui.notify(
									"Command unavailable: no slogan set. Use /pch --s <text> to set one.",
									"error",
								);
								return null;
							}
							st.sloganOn = !st.sloganOn;
							return st.sloganOn ? "Slogan: ON" : "Slogan: OFF";
						}
						if (flagArg === "-c") {
							if (argv[2]) {
								const c = argv[2].trim();
								if (!CMAP[c]) {
									ctx.ui.notify(`Invalid slogan color: "${c}". Available: c a r o y g w b p`, "error");
									return null;
								}
								st.sloganColorKey = c;
								st.sloganColor = true;
								return `Slogan color: ${c} (${COLOR_NAMES[c]})`;
							}
							st.sloganColor = !st.sloganColor;
							return st.sloganColor ? `Slogan color: ${state.sloganColorKey} (${COLOR_NAMES[state.sloganColorKey]})` : "Slogan color: OFF";
						}
						if (flagArg === "-d") {
							st.slogan = "";
							st.sloganOn = false;
							st.quoteMode = false;
							return "Slogan: deleted";
						}
						if (flagArg === "-quote") {
							const quote = getRandomQuote(ctx);
							if (!quote) {
								ctx.ui.notify(
									"No quotes found. Create quotes.json in project root or package dir.",
									"error",
								);
								return null;
							}
							st.slogan = quote;
							st.sloganOn = true;
							st.quoteMode = true;
							return `Slogan (quote): ${quote.replace(/\n/g, " ")}`;
						}
						const text = flagArg.trim();
						if (!text) {
							ctx.ui.notify(
								`Invalid slogan: "". Slogan must be between 1 and ${MAX_SLOGAN_LENGTH} characters.`,
								"error",
							);
							return null;
						}
						if (text.length > MAX_SLOGAN_LENGTH) {
							ctx.ui.notify(
								`Invalid slogan: "${text}". Slogan must be between 1 and ${MAX_SLOGAN_LENGTH} characters.`,
								"error",
							);
							return null;
						}
						st.slogan = text;
						st.sloganOn = true;
						st.quoteMode = false;
						return `Slogan: ${text}`;
					});
					return;
				}

				case "--df": {
					state = { ...DEFAULT_STATE };
					framesDirty = true;
					recomputeFrames();
					invalidateStats();
					const s2 = readSettings(settingsPath);
					if (!s2) {
						ctx.ui.notify(
							"pi-cc-header: settings.json is corrupted or unreadable. A backup has been created.",
							"error",
						);
						return;
					}
					reapply(pi, ctx, s2, "Reset to developer defaults");
					return;
				}

				case "--cl": {
					if (!configWritesEnabled(s)) {
						ctx.ui.notify(
							"pi-cc-header: /pch --cl is unavailable when ccHeader.readOnlyConfig=true. Remove the config declaratively, then uninstall the package.",
							"info",
						);
						return;
					}
					delete s.ccHeader;
					delete s.quietStartup;
					delete s.clearOnStart;
					const persisted = saveSettings(s);
					state = { ...DEFAULT_STATE, disabled: true };
					active?.dispose();
					active = undefined;
					ctx.ui.setHeader(undefined);
					ctx.ui.notify(
						persisted
							? "pi-cc-header Config: cleared. You can now uninstall the package."
							: "pi-cc-header Config: cleared for this session only. Could not save settings.json.",
						"info",
					);
					return;
				}

				case "--ml": {
					doUpdate((st) => {
						st.showModelLine = !st.showModelLine;
						return `Model/thinking line: ${st.showModelLine ? "ON" : "OFF"}`;
					}, true);
					return;
				}

				case "--logo": {
					// /pch --logo -d            → restore built-in Pi logo
					// /pch --logo line1 | line2  → set custom ASCII art (pipe-separated lines)
					if (flagArg === "-d") {
						doUpdate((st) => { st.customLogoLines = null; return "Logo: restored to built-in"; });
						return;
					}
					const raw = argv.slice(1).join(" ");
					if (!raw.trim()) {
						ctx.ui.notify(
							state.customLogoLines
								? `Custom logo: ${state.customLogoLines.length} lines set. /pch --logo -d to restore built-in.`
								: "No custom logo set. Use /pch --logo line1 | line2 | ... to set one.",
							"info",
						);
						return;
					}
					const lines = raw.split("|").map((l) => l.trim());
					doUpdate((st) => { st.customLogoLines = lines; return `Logo: ${lines.length}-line custom ASCII set`; });
					return;
				}

				default: {
					ctx.ui.notify(
						`Unknown flag: ${flag}. Use /pch --h for help.`,
						"error",
					);
					return;
				}
			}
		},
	});
}

