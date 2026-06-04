#!/usr/bin/env node
/**
 * Marketing screenshots for the App Store / web.
 *
 * Generates three native-iPhone-14-Pro sized PNGs into ../marketing/:
 *   01-grid-partial.png   home grid, a mix of complete + partial + empty colours
 *   02-welcome-sheet.png  home with the "How Snaps works" bottom sheet open
 *   03-intro.png          first watercolor intro slide with the install CTA
 *
 * Requires the dev server to be running on http://localhost:5273
 * (npm run dev). Uses the system Chrome + puppeteer-core so it doesn't
 * have to download a fresh Chromium.
 */
const puppeteer = require("puppeteer-core");
const path = require("path");

const CHROME =
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const URL = "http://localhost:5273";
// Saved into public/marketing so the PWA manifest can reference them as
// /marketing/*.png and they get precached for offline installs.
const OUT_DIR = path.join(__dirname, "..", "public", "marketing");

// iPhone 14 Pro logical 393×852 @3x = 1179×2556 native pixels — the
// standard 6.1" App Store screenshot size.
const VIEWPORT = { width: 393, height: 852, deviceScaleFactor: 3 };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function resetEverything(page) {
  await page.evaluate(async () => {
    localStorage.clear();
    const dbs = (await indexedDB.databases?.()) ?? [];
    for (const d of dbs) if (d.name) indexedDB.deleteDatabase(d.name);
  });
}

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
    defaultViewport: VIEWPORT,
  });

  const page = await browser.newPage();
  page.on("console", (msg) => {
    if (msg.type() === "error") console.error("[page]", msg.text());
  });

  // -------------------------------------------------------------------
  // 1. Partial grid — a few colours complete, a few partial, a few empty
  // -------------------------------------------------------------------
  await page.goto(URL, { waitUntil: "networkidle2" });
  await resetEverything(page);
  await page.evaluate(() => {
    localStorage.setItem("snaps.introSeen.v1", "1");
    localStorage.setItem("snaps.tourSeen.v1", "1");
  });
  await page.reload({ waitUntil: "networkidle2" });

  // Trigger sample load via Settings.
  await page.click('button[aria-label="Settings"]');
  await sleep(700);
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll("button")].find(
      (b) => b.textContent.trim() === "Load samples",
    );
    if (btn) btn.click();
  });

  // Wait for the cascade. Sample loader fetches all 81 photos at ~10
  // parallel workers; 12s gives plenty of headroom.
  await sleep(12000);

  // Close Settings.
  await page.evaluate(() => {
    const done = [...document.querySelectorAll("button")].find(
      (b) => b.textContent.trim() === "Done",
    );
    if (done) done.click();
  });
  await sleep(700);

  // Cut the boards into a marketing-friendly mix: top row complete, the
  // middle row a mix of partial counts, the bottom row mostly empty so
  // the home grid shows off every chip variant in one frame.
  await page.evaluate(() => {
    const boards = JSON.parse(localStorage.getItem("snaps.boards.v1"));
    const trim = (arr, n) =>
      arr.slice(0, n).concat(Array(9 - n).fill(null));
    // Row 1: red 9/9, orange 9/9, yellow 9/9 (leave them as full)
    // Row 2: green 5/9, blue 7/9, purple 2/9
    boards.green = trim(boards.green, 5);
    boards.blue = trim(boards.blue, 7);
    boards.purple = trim(boards.purple, 2);
    // Row 3: pink 4/9, black 0/9, white 0/9
    boards.pink = trim(boards.pink, 4);
    boards.black = Array(9).fill(null);
    boards.white = Array(9).fill(null);
    localStorage.setItem("snaps.boards.v1", JSON.stringify(boards));
  });
  await page.reload({ waitUntil: "networkidle2" });
  // Thumbnails decode + sparkle-in animation needs a moment to settle.
  await sleep(2000);

  await page.screenshot({
    path: path.join(OUT_DIR, "01-grid-partial.png"),
    omitBackground: false,
  });
  console.log("Saved 01-grid-partial.png");

  // -------------------------------------------------------------------
  // 2. Welcome bottom sheet — "How Snaps works"
  // -------------------------------------------------------------------
  await resetEverything(page);
  await page.evaluate(() => {
    // Intro done so the sheet sits over the empty grid (not over the
    // intro overlay); tour unseen so the sheet auto-opens.
    localStorage.setItem("snaps.introSeen.v1", "1");
    localStorage.removeItem("snaps.tourSeen.v1");
  });
  await page.reload({ waitUntil: "networkidle2" });
  // SampleCard / Sheet spring-in then settles; wait for it.
  await sleep(1400);

  await page.screenshot({
    path: path.join(OUT_DIR, "02-welcome-sheet.png"),
  });
  console.log("Saved 02-welcome-sheet.png");

  // -------------------------------------------------------------------
  // 3. Intro overlay — first watercolor slide
  // -------------------------------------------------------------------
  await page.evaluate(() => {
    localStorage.removeItem("snaps.introSeen.v1");
  });
  await page.reload({ waitUntil: "networkidle2" });
  // Watercolor mask reveal is 2.1s; caption word stagger lands ~1s
  // after that. 2.6s catches the steady state of slide 1.
  await sleep(2600);

  await page.screenshot({ path: path.join(OUT_DIR, "03-intro.png") });
  console.log("Saved 03-intro.png");

  await browser.close();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
