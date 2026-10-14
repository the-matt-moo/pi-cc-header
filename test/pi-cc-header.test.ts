import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { homedir, tmpdir } from "node:os";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import {
	pick,
	stateFromConfig,
	colorCell,
	logoCellColor,
	formatCwd,
	buildRuntimePaths,
	MAX_SLOGAN_LENGTH,
	configWritesEnabled,
	formatQuote,
	formatQuoteAuthor,
	detectBoltVersion,
	formatVersionTitle,
	piLogoFrame,
} from "../extensions/pi-cc-header.ts";

const stripAnsi = (text: string) => text.replace(/\x1b\[[0-9;]*m/g, "");

describe("Pi-Bolt rendering", () => {
	it("detects only a Bolt executable with valid sibling metadata", () => {
		const dir = mkdtempSync(join(tmpdir(), "cc-header-"));
		try {
			const exe = join(dir, "pi-bolt.exe");
			assert.equal(detectBoltVersion(exe), undefined);
			writeFileSync(join(dir, "pi-bolt.txt"), "Pi-Bolt 0.8.4 (Pi 1.1.0), win32-x64, JIT off\n");
			assert.equal(detectBoltVersion(exe), "0.8.4");
			assert.equal(detectBoltVersion(join(dir, "pi-bolt")), "0.8.4");
			assert.equal(detectBoltVersion(join(dir, "node.exe")), undefined);
			assert.equal(detectBoltVersion(join(dir, "pi.exe")), undefined);
			writeFileSync(join(dir, "pi-bolt.txt"), "invalid metadata");
			assert.equal(detectBoltVersion(exe), undefined);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	it("preserves the standard title and formats both Bolt and Pi versions", () => {
		const muted = (text: string) => `\x1b[90m${text}\x1b[39m`;
		assert.equal(formatVersionTitle(muted, undefined, "1.1.0"),
			"\x1b[38;2;251;73;52mPi\x1b[39m \x1b[90mv1.1.0\x1b[39m");
		assert.equal(formatVersionTitle(muted, "0.8.4", "1.1.0"),
			"\x1b[38;2;255;215;0mPi-Bolt\x1b[39m \x1b[38;2;251;73;52m0.8.4\x1b[39m \x1b[90m|\x1b[39m \x1b[38;2;251;73;52mPi 1.1.0\x1b[39m");
	});

	it("changes only the two i pixels once assembled, preserving every frame's geometry", () => {
		for (let frame = 0; frame < 22; frame++) {
			const standard = piLogoFrame(frame, false);
			const bolt = piLogoFrame(frame, true);
			assert.deepEqual(bolt.map(stripAnsi), standard.map(stripAnsi));
			if (frame < 16) {
				assert.deepEqual(bolt, standard);
				continue;
			}
			const top = frame === 16 ? 4 : 5;
			for (let row = 1; row <= 7; row++) {
				const cells = standard[row - 1].match(/\x1b\[(?!39m)[0-9;]*m(?:██|──)\x1b\[39m|\x1b\[39m██|  /g)!;
				if (row === top) cells[4] = colorCell("boltYellow");
				if (row === top + 1) cells[4] = colorCell("boltBlue");
				assert.equal(bolt[row - 1], cells.join(""));
			}
		}
		const final = piLogoFrame(21, true);
		assert.ok(final[4].includes("\x1b[38;2;255;215;0m██\x1b[39m"));
		assert.ok(final[5].includes("\x1b[38;2;251;73;52m██\x1b[39m"));
	});
});

// ── pick ──
describe("pick", () => {
	it("returns val when guard passes", () => {
		assert.equal(
			pick(42, (v) => typeof v === "number", 0),
			42,
		);
	});
	it("returns fallback when guard fails", () => {
		assert.equal(
			pick("hi", (v) => typeof v === "number", 99),
			99,
		);
	});
	it("handles boolean guard", () => {
		assert.equal(
			pick(true, (v) => typeof v === "boolean", "nope"),
			true,
		);
	});
	it("rejects mismatched truthy types", () => {
		assert.equal(
			pick(1, (v) => typeof v === "string", "fallback"),
			"fallback",
		);
	});
});

// ── stateFromConfig ──
describe("stateFromConfig", () => {
	it("returns defaults for empty config", () => {
		const s = stateFromConfig({});
		assert.equal(s.logoColorKey, "c");
		assert.equal(s.versionColored, 1);
		assert.equal(s.gradientOn, true);
		assert.equal(s.stripeEnabled, true);
		assert.equal(s.quoteMode, false);
	});


	it("reads sloganColorKey", () => {
		const s = stateFromConfig({ sloganColorCode: "g" });
		assert.equal(s.sloganColorKey, "g");
	});

	it("rejects invalid sloganColorKey (falls back)", () => {
		const s = stateFromConfig({ sloganColorCode: "z" });
		assert.equal(s.sloganColorKey, "c");
	});

	it("reads quoteMode", () => {
		const s = stateFromConfig({ quoteMode: true });
		assert.equal(s.quoteMode, true);
	});

	it("reads valid color key", () => {
		const s = stateFromConfig({ color: "a" });
		assert.equal(s.logoColorKey, "a");
	});

	it("rejects invalid color key (falls back)", () => {
		const s = stateFromConfig({ color: "z" });
		assert.equal(s.logoColorKey, "c");
	});

	it("reads versionColored", () => {
		const s = stateFromConfig({ ver: 2 });
		assert.equal(s.versionColored, 2);
	});

	it("rejects non-number ver", () => {
		const s = stateFromConfig({ ver: "2" });
		assert.equal(s.versionColored, 1);
	});

	it("reads speed within range", () => {
		const s = stateFromConfig({ speed: 100 });
		assert.equal(s.logoInterval, 100);
	});

	it("accepts arbitrary positive speed", () => {
		const s = stateFromConfig({ speed: 35 });
		assert.equal(s.logoInterval, 35);
	});

	it("rejects non-positive speed (falls back)", () => {
		const s = stateFromConfig({ speed: -10 });
		assert.equal(s.logoInterval, 50);
	});

	it("reads slogan", () => {
		const s = stateFromConfig({ slogan: "hello world" });
		assert.equal(s.slogan, "hello world");
		assert.equal(s.sloganOn, true);
	});

	it("rejects overlong slogan (falls back to default)", () => {
		const overlong = "x".repeat(MAX_SLOGAN_LENGTH + 1);
		const s = stateFromConfig({ slogan: overlong });
		assert.equal(s.slogan, "Code something that makes you proud");
	});
});

describe("configWritesEnabled", () => {
	it("returns false when readOnlyConfig is enabled", () => {
		assert.equal(
			configWritesEnabled({ ccHeader: { readOnlyConfig: true } }),
			false,
		);
	});

	it("ignores non-object ccHeader values", () => {
		assert.equal(configWritesEnabled({ ccHeader: true as any }), true);
		assert.equal(configWritesEnabled({ ccHeader: [] as any }), true);
	});

	it("returns true by default", () => {
		assert.equal(configWritesEnabled({ ccHeader: {} }), true);
		assert.equal(configWritesEnabled({}), true);
		assert.equal(configWritesEnabled(null), true);
	});
});

// ── formatQuote ──
describe("formatQuoteAuthor", () => {
	it("renders the author name in a complementary color with no tilde prefix", () => {
		assert.equal(
			formatQuoteAuthor("Seneca", "c"),
			"\x1b[38;2;4;182;203mSeneca\x1b[39m",
		);
	});
});

describe("formatQuote", () => {
	it("formats short quote (10 words or fewer) on 1 line with author right-aligned", () => {
		const result = formatQuote("We suffer more in imagination than in reality.", "Seneca");
		const lines = result.split("\n");
		assert.equal(lines.length, 2);
		assert.ok(lines[0].startsWith('"'));
		assert.ok(lines[0].endsWith('"'));
		// Author should be right-aligned: ends at same column as quote line
		const quoteWidth = lines[0].length;
		const authorStart = lines[1].lastIndexOf("Seneca");
		assert.equal(authorStart + "Seneca".length, quoteWidth);
	});

	it("formats long quote (> 10 words) split across 2 lines with author right-aligned to longest", () => {
		const quote = "You have power over your mind - not outside events. Realize this, and you will find strength.";
		const result = formatQuote(quote, "Marcus Aurelius");
		const lines = result.split("\n");
		assert.equal(lines.length, 3);
		assert.ok(lines[0].startsWith('"'));
		assert.ok(lines[1].endsWith('"'));
		// Author should be right-aligned to the longest quote line
		const maxQuoteWidth = Math.max(lines[0].length, lines[1].length);
		const authorStart = lines[2].lastIndexOf("Marcus Aurelius");
		assert.equal(authorStart + "Marcus Aurelius".length, maxQuoteWidth);
	});
});

// ── colorCell ──
describe("colorCell", () => {
	it("renders cyan cell", () => {
		const c = colorCell("cyan");
		assert.ok(c.includes("36m"));
		assert.ok(c.includes("██"));
	});

	it("renders logo cell in default (clawd) color", () => {
		const c = colorCell("logo");
		assert.ok(c.includes("38;2;251;73;52"));
	});

	it("renders panel default", () => {
		assert.equal(colorCell("panel"), "  ");
	});

	it("renders white cell", () => {
		assert.equal(colorCell("white"), "\x1b[39m██");
	});

	it("renders gradient l1 from default color map", () => {
		const c = colorCell("l1");
		assert.ok(c.includes("██"));
		assert.ok(c.includes("38;2;"));
	});
});

// ── logoCellColor ──
describe("logoCellColor", () => {
	const stillFrame = {
		phase: 6,
		active: "none" as const,
		ax: 0,
		ay: 0,
		flash: false,
		white: false,
	};

	it("returns panel for empty area (1,1)", () => {
		assert.equal(logoCellColor(stillFrame, 1, 1), "panel");
	});

	it("returns logo for white cell on Pi shape", () => {
		const c = logoCellColor(stillFrame, 5, 3); // (3,5) → WHITE_CELLS
		assert.ok(c.startsWith("l") || c === "logo");
	});

	it("returns flash for flash frame", () => {
		const flashFrame = { ...stillFrame, flash: true, white: false };
		assert.equal(logoCellColor(flashFrame, 6, 3), "flash");
	});
});

// ── buildRuntimePaths ──
describe("buildRuntimePaths", () => {
	it("builds settings and resource paths from custom agentDir", () => {
		const paths = buildRuntimePaths(join("/", "tmp", "custom-agent"));
		assert.equal(paths.settingsPath, join("/", "tmp", "custom-agent", "settings.json"));
		assert.equal(paths.npmRoot, join("/", "tmp", "custom-agent", "npm", "node_modules"));
		assert.equal(paths.globalSkillsDir, join("/", "tmp", "custom-agent", "skills"));
		assert.equal(paths.globalAgentsPath, join("/", "tmp", "custom-agent", "AGENTS.md"));
	});

	it("builds project-local paths from configurable config dir name", () => {
		const paths = buildRuntimePaths(
			join("/", "tmp", "custom-agent"),
			join("/", "work", "repo"),
			".config-pi",
		);
		assert.equal(paths.projectSkillsDir, join("/", "work", "repo", ".config-pi", "skills"));
		assert.equal(paths.projectAgentsPath, join("/", "work", "repo", ".config-pi", "AGENTS.md"));
	});
});

// ── formatCwd ──
describe("formatCwd", () => {
	const home = homedir();

	if (home) {
		it("abbreviates home directory", () => {
			const cwd = join(home, "projects", "test");
			assert.equal(formatCwd(cwd), `~${cwd.slice(home.length)}`);
		});
	}

	it("returns path unchanged when not under home", () => {
		const result = formatCwd("/tmp/somewhere");
		assert.equal(result, "/tmp/somewhere");
	});
});
