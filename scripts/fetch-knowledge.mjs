import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const root = path.resolve(import.meta.dirname, "..");
const knowledge = path.join(root, "knowledge");

function curl(url) {
  return execFileSync("curl.exe", ["-fsSL", url], {
    encoding: "utf8",
    maxBuffer: 20_000_000,
  });
}

function decode(text) {
  return text
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&rsquo;|&#8217;/g, "\u2019")
    .replace(/&lsquo;|&#8216;/g, "\u2018")
    .replace(/&rdquo;|&#8221;/g, "\u201d")
    .replace(/&ldquo;|&#8220;/g, "\u201c")
    .replace(/&mdash;|&#8212;/g, "\u2014")
    .replace(/&ndash;|&#8211;/g, "\u2013");
}

function inline(html) {
  return decode(
    html
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<sup[^>]*>[\s\S]*?<\/sup>/gi, "")
      .replace(/<a [^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, (_, href, label) => {
        const text = inline(label).trim();
        const url = href.startsWith("http") ? href : `https://scrumguides.org/${href.replace(/^\//, "")}`;
        return text ? `[${text}](${url})` : url;
      })
      .replace(/<strong[^>]*>([\s\S]*?)<\/strong>/gi, "**$1**")
      .replace(/<em[^>]*>([\s\S]*?)<\/em>/gi, "*$1*")
      .replace(/<[^>]+>/g, "")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n"),
  ).trim();
}

function htmlToMarkdown(fragment) {
  const blocks = [];
  const pattern = /<(h[1-4]|p|li|ul|ol)[^>]*>([\s\S]*?)<\/\1>/gi;
  let match;
  let listKind = null;
  const src = fragment
    .replace(/<ul[^>]*>/gi, "\n<ul>")
    .replace(/<\/ul>/gi, "</ul>\n")
    .replace(/<ol[^>]*>/gi, "\n<ol>")
    .replace(/<\/ol>/gi, "</ol>\n");

  const tokens = src.split(/(<h[1-4][^>]*>[\s\S]*?<\/h[1-4]>|<p[^>]*>[\s\S]*?<\/p>|<li[^>]*>[\s\S]*?<\/li>|<ul>|<\/ul>|<ol>|<\/ol>)/gi);
  for (const token of tokens) {
    if (!token || !token.trim()) continue;
    if (/^<ul>/i.test(token)) {
      listKind = "ul";
      continue;
    }
    if (/^<\/ul>/i.test(token)) {
      listKind = null;
      continue;
    }
    if (/^<ol>/i.test(token)) {
      listKind = "ol";
      continue;
    }
    if (/^<\/ol>/i.test(token)) {
      listKind = null;
      continue;
    }
    const heading = token.match(/^<h([1-4])[^>]*>([\s\S]*?)<\/h\1>$/i);
    if (heading) {
      const level = Number(heading[1]);
      const text = inline(heading[2]);
      if (text) blocks.push(`${"#".repeat(level)} ${text}`);
      continue;
    }
    const paragraph = token.match(/^<p[^>]*>([\s\S]*?)<\/p>$/i);
    if (paragraph) {
      const text = inline(paragraph[1]);
      if (text) blocks.push(text);
      continue;
    }
    const item = token.match(/^<li[^>]*>([\s\S]*?)<\/li>$/i);
    if (item) {
      const text = inline(item[1].replace(/<ul[\s\S]*$/i, ""));
      if (!text) continue;
      blocks.push(`${listKind === "ol" ? "1." : "-"} ${text}`);
    }
  }
  return blocks.join("\n\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
}

function writeScrumGuide() {
  const htmlPath = path.join(process.env.TEMP ?? ".", "scrum-guide.html");
  if (!fs.existsSync(htmlPath)) {
    fs.writeFileSync(htmlPath, curl("https://scrumguides.org/scrum-guide.html"));
  }
  const html = fs.readFileSync(htmlPath, "utf8");
  const start = html.indexOf('<div class="col-md-9">');
  const end = html.indexOf('<div class="container" id="footer">');
  if (start < 0 || end < 0) throw new Error("Could not find the Scrum Guide content in the official HTML.");
  const fragment = html.slice(start, end);
  const body = htmlToMarkdown(fragment);
  const notice = `---
title: The 2020 Scrum Guide
authors: Ken Schwaber and Jeff Sutherland
source: https://scrumguides.org/scrum-guide.html
pdf: https://scrumguides.org/docs/scrumguide/v2020/2020-Scrum-Guide-US.pdf
license: CC BY-SA 4.0
license_url: https://creativecommons.org/licenses/by-sa/4.0/
modification: Converted from the official HTML page to Markdown. Page navigation was removed. The wording of the Guide is unchanged.
retrieved: 2026-11-21
---

`;
  const dir = path.join(knowledge, "scrum-guide");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "2020-scrum-guide.md"), notice + body, "utf8");
  console.log("wrote knowledge/scrum-guide/2020-scrum-guide.md", body.length);
}

function versionRank(name) {
  const match = /^(\d+)\.(\d+)$/.exec(name);
  if (!match) return -1;
  return Number(match[1]) * 1000 + Number(match[2]);
}

function writeExpansion() {
  const listing = JSON.parse(
    curl("https://api.github.com/repos/ScrumGuides/ScrumGuide-ExpansionPack/contents/site/content"),
  );
  const guides = listing.filter((entry) => entry.type === "dir" && entry.name !== "categories" && entry.name !== "creators");
  const dir = path.join(knowledge, "expansion");
  fs.mkdirSync(dir, { recursive: true });
  const manifest = [];

  for (const guide of guides) {
    const children = JSON.parse(curl(guide.url));
    const versions = children
      .filter((entry) => entry.type === "dir" && versionRank(entry.name) >= 0)
      .sort((a, b) => versionRank(b.name) - versionRank(a.name));
    if (versions.length === 0) {
      console.log("skip", guide.name);
      continue;
    }
    const version = versions[0].name;
    const raw = `https://raw.githubusercontent.com/ScrumGuides/ScrumGuide-ExpansionPack/main/site/content/${guide.name}/${version}/index.md`;
    const markdown = curl(raw);
    const file = `${guide.name}.md`;
    const header = `<!--
source: ${raw}
page: https://scrumexpansion.org/${guide.name}/
version: ${version}
license: CC BY-SA 4.0
authors: Ralph Jocham, John Coleman, and Jeff Sutherland
note: Optional companion to the 2020 Scrum Guide. Stored as published, including its license notice.
retrieved: 2026-11-21
-->

`;
    fs.writeFileSync(path.join(dir, file), header + markdown, "utf8");
    manifest.push({ id: guide.name, version, file, source: raw });
    console.log("wrote", file, version, markdown.length);
  }

  fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n", "utf8");
}

writeScrumGuide();
writeExpansion();
fs.mkdirSync(path.join(knowledge, "guidance"), { recursive: true });
fs.writeFileSync(path.join(knowledge, "guidance", ".gitkeep"), "", "utf8");
