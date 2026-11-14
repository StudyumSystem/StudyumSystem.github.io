const n=`import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import GameModal, { Completion, ScoreScreen } from "./GameModal.jsx";
import Burst, { PINK_BLACK } from "./Burst.jsx";
import { pad2, shuffle, takeQuote, prefersReducedMotion, recordStars, ROUND_STARS } from "./shared.js";
import { play as playSound } from "./sound.js";
const play = (name) => playSound(name, "word-hunt");

// MM-GAME-01 Word Hunt (Marta's spec): 10x10 grid, 10 pool words per round,
// placed across or down; swipe a row or column in either direction. No timer, counter 0/10.
const SIZE = 10;
const COUNT = 10;
// 12 Nov (Marta: "the words must be new every round, on the same theme"): her word pool (MM-G01-07, the first
// 20) and 67 more art and design words of the same kind, 87 in all, none longer than 8 letters. A round takes
// 10 words not played yet, so no word comes back until the whole pool has been played (8 rounds); then it starts
// over, never with the words of the round just played. No word holds another one, read either way (SKETCH
// holds ETCH, so ETCH is not in), or the grid could never show that word exactly once.
const POOL = [
  // her pool
  "PAPER", "PENCIL", "PAINT", "BRUSH", "INK", "CANVAS", "COLOR", "FRAME", "PHOTO", "SHAPE",
  "LINE", "LIGHT", "ART", "DESIGN", "FORM", "CLAY", "DRAW", "PRINT", "SKETCH", "MUSE",
  // brand, type and layout
  "BRAND", "LOGO", "FONT", "ICON", "STYLE", "SYMBOL", "EMBLEM", "GLYPH", "SERIF", "ITALIC",
  "BOLD", "MARGIN", "GRID", "LAYOUT", "MOCKUP", "PIXEL", "VECTOR", "LAYER", "CROP", "BLEND",
  "GRADIENT", "RENDER", "PROOF", "DRAFT", "IDEA", "CONCEPT", "VISION", "STORY", "BOARD", "MOOD",
  "POSTER", "STUDIO",
  // colour, light and surface
  "PALETTE", "HUE", "TONE", "TINT", "SHADE", "SHADOW", "MATTE", "GLOSS", "PIGMENT", "PATTERN",
  "TEXTURE", "CONTOUR", "CURVE", "SCALE", "FOCUS", "LENS", "IMAGE",
  // the studio's tools and works
  "EASEL", "CHALK", "PASTEL", "CRAYON", "MARKER", "STENCIL", "COLLAGE", "MOSAIC", "MURAL", "GALLERY",
  "STATUE", "GLAZE", "FRESCO", "CHARCOAL", "GRAPHITE", "ACRYLIC", "CRAFT", "MOTIF",
];
const LETTERS = "ABCDEFGHIJKLMNOPRSTUVWY";
const INSTRUCTIONS =
  "Find the 10 hidden art-inspired words. Swipe across letters horizontally or vertically. Find them all to complete the game."; // MM-G01-03 (11 Nov)
const WORD_STARS = 10; // her MM-G01-03: one word found = "10 MM✦"

// The same confetti as Memory Match's finish (two rings, pink and black, from the middle of the board).
function Firework() {
  const reach = useMemo(() => Math.max(320, Math.min(window.innerWidth, window.innerHeight) * 0.5), []);
  return <Burst rings={[{ n: 52, reach, size: 11 }, { n: 36, reach: reach * 0.55, size: 9, delay: 260 }]} colors={PINK_BLACK} />;
}

// Every row and column read both ways, to count how often a word can be found.
function lines(grid) {
  const out = [];
  for (let i = 0; i < SIZE; i++) {
    const row = grid.slice(i * SIZE, i * SIZE + SIZE).join("");
    let col = "";
    for (let r = 0; r < SIZE; r++) col += grid[r * SIZE + i];
    out.push(row, col, [...row].reverse().join(""), [...col].reverse().join(""));
  }
  return out;
}
const occurrences = (all, word) =>
  all.reduce((n, line) => { let k = 0, at = line.indexOf(word); while (at >= 0) { k++; at = line.indexOf(word, at + 1); } return n + k; }, 0);

function tryPlace(words) {
  const grid = Array(SIZE * SIZE).fill(null);
  const placed = [];
  // Longest first, so the short ones fill the gaps.
  for (const word of words.slice().sort((a, b) => b.length - a.length)) {
    const spots = [];
    for (const across of [true, false])
      for (let r = 0; r < SIZE; r++)
        for (let c = 0; c < SIZE; c++) {
          if ((across ? c : r) + word.length > SIZE) continue;
          const cells = [...word].map((_, k) => (across ? r * SIZE + c + k : (r + k) * SIZE + c));
          if (cells.every((cell, k) => grid[cell] === null || grid[cell] === word[k])) spots.push(cells);
        }
    if (!spots.length) return null;
    const cells = spots[Math.floor(Math.random() * spots.length)];
    cells.forEach((cell, k) => { grid[cell] = word[k]; });
    placed.push({ word, cells });
  }
  for (let i = 0; i < grid.length; i++) if (!grid[i]) grid[i] = LETTERS[Math.floor(Math.random() * LETTERS.length)];
  // Valid only if each chosen word can be found exactly once and no other pool word shows up by chance.
  const all = lines(grid);
  for (const w of POOL) {
    const n = occurrences(all, w);
    // A palindrome would be counted twice (both directions); none in the pool, but keep the rule honest.
    const want = words.includes(w) ? ([...w].reverse().join("") === w ? 2 : 1) : 0;
    if (n !== want) return null;
  }
  return { grid, placed };
}

// The words not played since the pool last ran out, and the round just played (kept while the page is open,
// so closing and reopening the game also brings new words).
let unplayed = [];
let lastWords = [];
function newRound() {
  let carry = [];
  if (unplayed.length < COUNT) {
    carry = unplayed; // the last few of the pool are played first, then the pool starts over
    unplayed = POOL.filter((w) => !lastWords.includes(w));
  }
  for (let attempt = 0; attempt < 600; attempt++) {
    const rest = shuffle(unplayed.filter((w) => !carry.includes(w)));
    // a carried word that keeps failing to fit is let go after a while rather than holding the round up
    const words = [...(attempt < 300 ? carry : []), ...rest].slice(0, COUNT);
    const round = tryPlace(words);
    if (round) {
      unplayed = unplayed.filter((w) => !words.includes(w));
      lastWords = words;
      return round;
    }
  }
  throw new Error("Word Hunt: could not build a grid");
}

// Cells from a to b, snapped to the row or the column the drag mostly follows.
function straight(a, b) {
  const ar = Math.floor(a / SIZE), ac = a % SIZE, br = Math.floor(b / SIZE), bc = b % SIZE;
  const across = Math.abs(bc - ac) >= Math.abs(br - ar);
  const len = across ? Math.abs(bc - ac) : Math.abs(br - ar);
  const step = across ? Math.sign(bc - ac) : Math.sign(br - ar) * SIZE;
  return Array.from({ length: len + 1 }, (_, k) => a + k * step);
}

// 14 Nov (Marta's iPhone video: swiping PATTERN lit PATTERNU and it never counted): on a touch screen the swipe's
// end moves on to a letter only once the finger is 40% inside it, and back only once 40% inside the one before, so a
// fingertip on a border or rolling as it lifts doesn't flick the end onto the next letter. The start stays where the
// finger first touched; the mouse keeps the plain letter under it (dead 0, as before).
const DEAD = 0.4;
// f: the finger along one axis in cells (2.5 = the middle of the third); cur: the end's cell on that axis now
function steady(f, cur, dead) {
  const k = f >= cur + 1 + dead ? Math.floor(f - dead) : f < cur - dead ? Math.floor(f + dead) : cur;
  return Math.min(SIZE - 1, Math.max(0, k));
}

// 14 Nov (a player's feedback through Marta: "frame" with a "k" counted): a word not found yet counts only when the
// swipe holds exactly its letters, from either end, and not one more or one less; FRAMEK, PATTERNU or ATTERN never
// count. The finger's overshoot is caught by the dead zone above instead, so what lights up is what is checked.
function pickWord(sel, placed, found) {
  for (const p of placed) {
    if (found.includes(p.word) || sel.length !== p.cells.length) continue;
    if (p.cells.every((i, k) => sel[k] === i) || p.cells.every((i, k) => sel[sel.length - 1 - k] === i)) return p;
  }
  return null;
}

export default function WordHunt({ open, onClose }) {
  const [round, setRound] = useState(null);
  const [found, setFound] = useState([]); // words found, in order
  const [sel, setSel] = useState([]);
  const [pop, setPop] = useState(null);
  const [quote, setQuote] = useState(null);
  const [phase, setPhase] = useState("play"); // play | score | done
  const [finish, setFinish] = useState(null); // null | "fade" | per-letter rain
  const drag = useRef(null);
  const end = useRef(null); // the swipe's end cell { r, c } and its dead zone (steady)
  const selRef = useRef([]);
  const gridRef = useRef(null);
  const timers = useRef([]);
  const later = (fn, ms) => timers.current.push(setTimeout(fn, ms));
  const clearTimers = () => { timers.current.forEach(clearTimeout); timers.current = []; };

  const reset = useCallback(() => {
    clearTimers();
    drag.current = null;
    setRound(newRound());
    setFound([]);
    setSel([]);
    setPop(null);
    setQuote(null);
    setPhase("play");
    setFinish(null);
  }, []);

  // Closing or reopening always starts a fresh grid at 0/10.
  useEffect(() => { if (open) reset(); return clearTimers; }, [open, reset]);

  const done = found.length === COUNT;

  const cellAt = (e) => {
    const rect = gridRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * SIZE;
    const y = ((e.clientY - rect.top) / rect.height) * SIZE;
    const c = Math.floor(x), r = Math.floor(y);
    return { x, y, r: Math.min(SIZE - 1, Math.max(0, r)), c: Math.min(SIZE - 1, Math.max(0, c)), inside: r >= 0 && r < SIZE && c >= 0 && c < SIZE };
  };

  const onDown = (e) => {
    if (done || !round) return;
    const { r, c, inside } = cellAt(e);
    if (!inside) return;
    e.preventDefault();
    gridRef.current.setPointerCapture?.(e.pointerId);
    drag.current = r * SIZE + c;
    end.current = { r, c, dead: e.pointerType === "mouse" ? 0 : DEAD };
    selRef.current = [drag.current];
    setSel(selRef.current);
  };

  const onMove = (e) => {
    if (drag.current == null) return;
    e.preventDefault();
    const { x, y } = cellAt(e);
    const at = end.current;
    at.r = steady(y, at.r, at.dead);
    at.c = steady(x, at.c, at.dead);
    selRef.current = straight(drag.current, at.r * SIZE + at.c);
    setSel(selRef.current);
  };

  const onUp = () => {
    if (drag.current == null) return;
    drag.current = null;
    const sel = selRef.current;
    selRef.current = [];
    const hit = pickWord(sel, round.placed, found);
    setSel([]); // a wrong selection simply fades back (colour transition on the cells)
    if (!hit) { if (sel.length > 1) play("back"); return; }
    const next = [...found, hit.word];
    setFound(next);
    setPop(hit.word);
    later(() => setPop(null), 450);
    if (next.length === COUNT) {
      play("win");
      recordStars("word-hunt", ROUND_STARS);
      // 12 Nov 01:50 (Marta: "something like in Memory Match"): the squares of the grid burst outward from its
      // middle, a little turned, with the same pink-and-black confetti as Memory Match, then the score screen
      // (with reduced motion the board simply fades)
      if (prefersReducedMotion()) {
        later(() => setFinish("fade"), 350);
        later(() => setPhase("score"), 1150);
      } else {
        later(() => {
          const g = gridRef.current?.getBoundingClientRect();
          if (!g) return;
          const cx = g.left + g.width / 2, cy = g.top + g.height / 2;
          const far = Math.max(window.innerWidth, window.innerHeight) * 0.75;
          const cell = g.width / SIZE;
          setFinish(Array.from({ length: SIZE * SIZE }, (_, i) => {
            let dx = g.left + (i % SIZE + 0.5) * cell - cx, dy = g.top + (Math.floor(i / SIZE) + 0.5) * cell - cy;
            const len = Math.hypot(dx, dy) || 1;
            dx /= len; dy /= len;
            const d = far * (0.8 + Math.random() * 0.4);
            return { dx: \`\${dx * d}px\`, dy: \`\${dy * d}px\`, rot: \`\${(Math.random() - 0.5) * 140}deg\`, delay: \`\${Math.random() * 120}ms\` };
          }));
        }, 450);
        later(() => setPhase("score"), 450 + 1450);
      }
    } else {
      // a found word, then its MM✦ credited (Marta, 11 Nov 19:56)
      play("match");
      later(() => play("coins"), 220);
    }
  };

  const toQuote = useCallback(() => { setQuote(takeQuote("word-hunt")); setPhase("done"); }, []);

  const foundCells = new Set();
  const popCells = new Set();
  round?.placed.forEach((p) => {
    if (!found.includes(p.word)) return;
    p.cells.forEach((i) => { foundCells.add(i); if (p.word === pop) popCells.add(i); });
  });
  const selCells = new Set(sel);

  const ended = phase !== "play";
  const counter = ended ? null : found.length === 0 ? \`0 / \${COUNT}\` : \`\${pad2(found.length)} / \${COUNT}\`;

  return (
    <GameModal
      open={open}
      onClose={onClose}
      onBack={phase === "done" ? () => setPhase("score") : null}
      label="Word Hunt"
      game
      stage={phase !== "done"}
      textBox={[333, 608]}
      phoneTextW={320}
      instructions={ended ? null : INSTRUCTIONS}
      counter={counter}
      stars={ended ? null : found.length * WORD_STARS}
      hud={!ended}
      confirm={ended ? "completed" : found.length ? "game" : null}
    >
      {phase === "done" && quote ? (
        <Completion quote={quote} onPlayAgain={reset} />
      ) : phase === "score" ? (
        <ScoreScreen badge="Perfect find" label="All words discovered" value={\`\${COUNT} / \${COUNT}\`} stars={ROUND_STARS} onDone={toQuote} />
      ) : (
        <div className="flex flex-1 items-start justify-center overflow-clip px-[15px] pt-[19px] pb-8 lg:pointer-events-none lg:absolute lg:inset-0 lg:p-0 lg:pt-[calc(178*var(--mm-u))]">
          {/* her MM-G01-01 / -03 at 1920 x 1019: ten squares of 73.9 a row (739), 178 from the panel's top, centred;
              on the computer in her frame's px measured against the screen's height (--mm-u, GameModal), 12 Nov */}
          <div
            ref={gridRef}
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={onUp}
            role="grid"
            aria-label={\`Word Hunt letter grid, \${found.length} of \${COUNT} words found\${found.length ? \`: \${found.join(", ")}\` : ""}\`}
            className={\`\${finish === "fade" ? "mm-fade-out" : ""} relative grid w-[min(100%,calc(100cqh-51px))] max-w-[640px] select-none grid-cols-10 gap-px border [container-type:inline-size] [touch-action:none] lg:pointer-events-auto lg:w-[calc(739*var(--mm-u))] lg:max-w-none \${
              Array.isArray(finish) ? "border-transparent bg-transparent" : "border-[#d4d4d4] bg-[#d4d4d4]"
            }\`}
          >
            {round?.grid.map((ch, i) => {
              const on = selCells.has(i) || foundCells.has(i);
              const f = Array.isArray(finish) && finish[i];
              return (
                <span
                  key={i}
                  role="gridcell"
                  className={\`flex aspect-square items-center justify-center text-[7.2cqw] lg:text-[6.7cqw] font-normal leading-none transition-colors duration-300 motion-reduce:transition-none \${
                    on ? "bg-[#fef7fc] text-[#F600A9]" : "bg-white text-black"
                  } \${popCells.has(i) ? "mm-match" : ""} \${f ? "mm-fly" : ""}\`}
                  style={f ? { "--dx": f.dx, "--dy": f.dy, "--rot": f.rot, animationDelay: f.delay } : undefined}
                >
                  {ch}
                </span>
              );
            })}
            {Array.isArray(finish) && <Firework />}
          </div>
        </div>
      )}
    </GameModal>
  );
}
`;export{n as s};
