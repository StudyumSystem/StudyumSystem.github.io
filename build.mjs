// Builds the blog: posts/*.md → blog/<slug>/index.html, blog/index.html, sitemap.xml, feed.xml, and the
// "From the blog" list on the home page. No packages needed: `node build.mjs`.
// A post starts with a header between --- lines: title, description, date (YYYY-MM-DD), slug, draft.
// Drafts (draft: true) are never published.
import { readdirSync, readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";

const SITE = "https://mindscriber.com";
const root = new URL(".", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function parse(file) {
  const raw = readFileSync(file, "utf8").replace(/\r/g, "");
  const m = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!m) throw new Error(`${file}: no --- header`);
  const meta = Object.fromEntries(m[1].split("\n").filter(Boolean).map((l) => [l.slice(0, l.indexOf(":")).trim(), l.slice(l.indexOf(":") + 1).trim()]));
  for (const k of ["title", "description", "date", "slug"]) if (!meta[k]) throw new Error(`${file}: missing ${k}`);
  return { ...meta, draft: meta.draft === "true", body: m[2] };
}

// Enough Markdown for posts: headings, paragraphs, lists, quotes, bold, italic, links, code.
function inline(s) {
  return esc(s)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, t, u) => `<a href="${u}">${t}</a>`);
}
function markdown(md) {
  const out = [];
  for (const block of md.trim().split(/\n\s*\n/)) {
    const lines = block.split("\n");
    const h = block.match(/^(#{2,4})\s+(.*)$/);
    if (h && lines.length === 1) out.push(`<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`);
    else if (lines.every((l) => /^[-*]\s+/.test(l))) out.push(`<ul>${lines.map((l) => `<li>${inline(l.replace(/^[-*]\s+/, ""))}</li>`).join("")}</ul>`);
    else if (lines.every((l) => /^\d+\.\s+/.test(l))) out.push(`<ol>${lines.map((l) => `<li>${inline(l.replace(/^\d+\.\s+/, ""))}</li>`).join("")}</ol>`);
    else if (lines.every((l) => /^>\s?/.test(l))) out.push(`<blockquote>${inline(lines.map((l) => l.replace(/^>\s?/, "")).join(" "))}</blockquote>`);
    else out.push(`<p>${inline(lines.join(" "))}</p>`);
  }
  return out.join("\n");
}

const page = ({ title, description, path, body, jsonld }) => `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(description)}">
  <link rel="canonical" href="${SITE}${path}">
  <meta property="og:type" content="${jsonld?.["@type"] === "BlogPosting" ? "article" : "website"}">
  <meta property="og:site_name" content="Mindscriber">
  <meta property="og:title" content="${esc(title)}">
  <meta property="og:description" content="${esc(description)}">
  <meta property="og:url" content="${SITE}${path}">
  <meta name="twitter:card" content="summary">
  <link rel="icon" href="/favicon.svg" type="image/svg+xml">
  <link rel="alternate" type="application/rss+xml" title="Mindscriber blog" href="/feed.xml">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Manrope:wght@300;400;600&family=JetBrains+Mono:wght@400&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/style.css">
  <link rel="stylesheet" href="/blog/blog.css">
  ${jsonld ? `<script type="application/ld+json">${JSON.stringify(jsonld)}</script>` : ""}
</head>
<body>
  <header class="top"><a class="brand" href="/">Mindscriber</a><nav><a href="/blog/">Blog</a><a class="nav-cta" href="/#waitlist">Join the waitlist</a></nav></header>
  <main class="post-main">
${body}
  </main>
  <footer><span>Mindscriber &copy; 2026</span><a href="mailto:Igar@mindscriber.com">Igar@mindscriber.com</a><a href="https://motivationmachines.com/">Motivation Machines</a><a href="/privacy/">Privacy</a></footer>
</body>
</html>
`;

const longDate = (d) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
const postsDir = join(root, "posts");
const posts = (existsSync(postsDir) ? readdirSync(postsDir).filter((f) => f.endsWith(".md")) : [])
  .map((f) => parse(join(postsDir, f)))
  .filter((p) => !p.draft || process.env.DRAFTS === "1") // DRAFTS=1 previews drafts locally; never publish a build made with it
  .sort((a, b) => b.date.localeCompare(a.date));

// Fresh blog folders (blog.css stays).
for (const d of readdirSync(join(root, "blog"), { withFileTypes: true })) if (d.isDirectory()) rmSync(join(root, "blog", d.name), { recursive: true });

for (const p of posts) {
  const path = `/blog/${p.slug}/`;
  const jsonld = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: p.title,
    description: p.description,
    datePublished: p.date,
    author: { "@type": "Person", name: "Igar Dyachenko" },
    publisher: { "@type": "Organization", name: "Mindscriber", url: SITE },
    mainEntityOfPage: `${SITE}${path}`,
  };
  const body = `    <nav class="crumbs"><a href="/">Home</a> / <a href="/blog/">Blog</a></nav>
    <article class="post">
      <p class="caption">${longDate(p.date)} · Igar Dyachenko</p>
      <h1>${esc(p.title)}</h1>
${markdown(p.body)}
      <p class="post-cta"><a class="btn btn-dark" href="/#waitlist">Join the waitlist for the Janus Batch</a></p>
    </article>`;
  mkdirSync(join(root, "blog", p.slug), { recursive: true });
  writeFileSync(join(root, "blog", p.slug, "index.html"), page({ title: `${p.title} · Mindscriber`, description: p.description, path, body, jsonld }));
}

const list = posts.map((p) => `      <li><a href="/blog/${p.slug}/">${esc(p.title)}</a><span class="caption">${longDate(p.date)}</span><p>${esc(p.description)}</p></li>`).join("\n");
writeFileSync(
  join(root, "blog", "index.html"),
  page({
    title: "Blog · Mindscriber",
    description: "Igar Dyachenko on physiological computing, AI and the body.",
    path: "/blog/",
    body: `    <section class="post">
      <p class="caption">Blog</p>
      <h1>Notes from Mindscriber.</h1>
      ${posts.length ? `<ul class="post-list">\n${list}\n      </ul>` : `<p>The first posts are on their way.</p>`}
    </section>`,
  }),
);

const urls = ["/", "/blog/", "/privacy/", ...posts.map((p) => `/blog/${p.slug}/`)];
const today = new Date().toISOString().slice(0, 10);
writeFileSync(join(root, "sitemap.xml"), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `  <url><loc>${SITE}${u}</loc><lastmod>${posts.find((p) => `/blog/${p.slug}/` === u)?.date ?? today}</lastmod></url>`).join("\n")}\n</urlset>\n`);
writeFileSync(
  join(root, "feed.xml"),
  `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0"><channel><title>Mindscriber</title><link>${SITE}/blog/</link><description>Igar Dyachenko on physiological computing, AI and the body.</description>\n${posts
    .map((p) => `<item><title>${esc(p.title)}</title><link>${SITE}/blog/${p.slug}/</link><guid>${SITE}/blog/${p.slug}/</guid><pubDate>${new Date(`${p.date}T12:00:00Z`).toUTCString()}</pubDate><description>${esc(p.description)}</description></item>`)
    .join("\n")}\n</channel></rss>\n`,
);

// The home page's "From the blog": the three newest posts, or hidden when there are none.
const home = join(root, "index.html");
const latest = posts.slice(0, 3).map((p) => `<li><a href="/blog/${p.slug}/">${esc(p.title)}</a></li>`).join("");
writeFileSync(
  home,
  readFileSync(home, "utf8")
    .replace(/<div class="latest" id="latest"( hidden)?>/, `<div class="latest" id="latest"${posts.length ? "" : " hidden"}>`)
    .replace(/<ul id="latest-list">[\s\S]*?<\/ul>/, `<ul id="latest-list">${latest}</ul>`),
);
console.log(`Built ${posts.length} post(s); drafts skipped.`);
