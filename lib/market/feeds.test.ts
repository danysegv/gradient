import { test } from "node:test";
import assert from "node:assert/strict";
import { parseFeed } from "./feeds.ts";

const RSS = `<?xml version="1.0"?><rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/" xmlns:content="http://purl.org/rss/1.0/modules/content/"><channel>
<item><title><![CDATA[Poster &amp; type]]></title><link>https://ex.com/a</link><pubDate>Mon, 28 Sep 2026 10:00:00 +0000</pubDate>
<enclosure url="https://cdn.ex.com/a.jpg" type="image/jpeg" length="1"/></item>
<item><title>B</title><link>https://ex.com/b</link><media:content url="https://cdn.ex.com/b.webp" medium="image"/></item>
<item><title>C</title><link>https://ex.com/c</link><content:encoded><![CDATA[<p>hi</p><img src="/img/c.png" alt=""/>]]></content:encoded></item>
<item><title>D escaped</title><link>https://ex.com/d</link><description>&lt;img src="https://cdn.ex.com/d.jpg"&gt;</description></item>
<item><title>E video only</title><link>https://ex.com/e</link><enclosure url="https://cdn.ex.com/e.mp4" type="video/mp4"/></item>
<item><title>dup</title><link>https://ex.com/a</link></item>
</channel></rss>`;

test("RSS: every way a feed carries its lead image", () => {
  const items = parseFeed(RSS, "https://ex.com/feed/");
  assert.equal(items.length, 5, "the duplicate link is dropped");
  assert.deepEqual(items[0], {
    url: "https://ex.com/a",
    title: "Poster & type",
    publishedAt: "2026-09-28T10:00:00.000Z",
    imageUrl: "https://cdn.ex.com/a.jpg",
  });
  assert.equal(items[1].imageUrl, "https://cdn.ex.com/b.webp");
  assert.equal(items[2].imageUrl, "https://ex.com/img/c.png", "relative src resolves against the item");
  assert.equal(items[3].imageUrl, "https://cdn.ex.com/d.jpg");
  assert.equal(items[4].imageUrl, null, "a video is not an image");
});

test("Atom: the alternate link, not the self link", () => {
  const xml = `<feed xmlns="http://www.w3.org/2005/Atom"><entry><title>X</title>
<link rel="self" href="https://ex.com/x.atom"/><link rel="alternate" href="https://ex.com/x"/>
<published>2026-09-27T08:00:00Z</published><content type="html">&lt;img src="https://ex.com/x.jpg"/&gt;</content></entry></feed>`;
  const [e] = parseFeed(xml, "https://ex.com/feed.atom");
  assert.equal(e.url, "https://ex.com/x");
  assert.equal(e.imageUrl, "https://ex.com/x.jpg");
  assert.equal(e.publishedAt, "2026-09-27T08:00:00.000Z");
});
