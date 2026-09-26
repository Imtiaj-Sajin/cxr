# Kotha: launch plan for free users

Goal: steady, organic traffic with a budget of about zero. The product already has the
three engines from the research (`research/online-tool-opportunities.md`): it's a tool
people search for, its output spreads (the optional credit on burned-in videos), and it
works for a whole language community.

## Week 0: before telling anyone

1. **Convert the Bangla model** with `tools/convert_bangla_model.ipynb` and make it the default (`VITE_BANGLA_MODEL_ID`).
2. **Measure it**: run `scripts/evaluate.ts` on FLEURS plus ~20 real YouTube-style clips you transcribe by hand. Write down CER/WER for the Bangla model against `whisper-small`. This number is the headline of every post.
3. **Deploy** to Vercel or Netlify (free). Get a short domain if possible (for example `kotha.app` or `banglasub.com`), or use the free `*.vercel.app`.
4. **Google Search Console**: verify the site and submit it. Add privacy-friendly analytics, such as the free tiers of Cloudflare Web Analytics or Plausible/Umami, to see which pages bring people in.

## Week 1: launch where Bangla creators already are

| Channel | What to post |
|---|---|
| Facebook groups (Bangladeshi YouTubers, video editors, freelancers, CSE/students) | 60-second screen recording: drop video → Bangla subtitles → upload to YouTube. Stress "free, no limit, video stays on your computer". |
| r/bangladesh, r/kolkata, r/india (tools), r/SideProject, r/webdev | Short story post: "I built a free Bangla subtitle generator that runs entirely in the browser". |
| LinkedIn + dev.to / Medium / Hashnode | Technical write-up: WebGPU + Whisper in the browser, the Bangla tokenizer problem (2 tokens per character), the accuracy numbers. This is the portfolio piece. |
| Product Hunt / Hacker News "Show HN" | "Show HN: Private Bangla subtitles, fully in-browser (WebGPU)". |
| Hugging Face | Publish the converted model with a good model card, and optionally a Space linking to the site. Hugging Face readers are a real source of traffic. |

## Ongoing: search traffic (compounds over months)

Tool queries keep their clicks even with AI answers in search. Useful pages to add over time, each a real tool page rather than a thin text page:

- "Bangla subtitle generator", "বাংলা সাবটাইটেল তৈরি", "bangla audio to text", "bangla voice to text", "bengali transcription"
- How-to pages that end in the tool: "how to add Bangla subtitles to YouTube", "Facebook video e Bangla caption", "SRT file ki / কিভাবে বানাবো"
- Format tools that reuse the existing code: SRT ↔ VTT converter, subtitle timing shifter, Bangla digit converter. Each is a small page that ranks on its own and links to the main tool.

## Built-in growth loops

- **Watermark credit** on burned-in videos (on by default, one click to remove): every shared video advertises the site.
- **Share link for models**: `?model=owner/name` lets people share a setup.
- **Resume + offline**: returning users skip the model download, so repeat use feels instant.

## What to measure

| Metric | Target after 90 days |
|---|---|
| Weekly visitors from search | Growing week over week |
| Share of visitors who start a transcription | > 30% |
| Returning users (7-day) | > 20% |
| Bangla CER on your real-clip test set | Better than the tools you compare against. Publish the table. |

## Money later (only if traffic comes)

- Keep the core free. Optional paid "high accuracy" mode for long files using a hosted API (the research found Soniox at $0.10/h), paid via bKash/SSLCommerz or a merchant of record.
- Or light, relevant ads on the landing page only (never in the editor).
- Sponsorship or grants: open-source Bangla language tech is a good fit for grants and university collaborations.
