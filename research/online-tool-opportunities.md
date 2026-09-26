# Online tool / digital product opportunities: research notes (Sept 2026)

Goal: find a tool that can **pull in free users on its own**, meaning organic search, sharing and embeds rather than paid ads. Making money is a bonus. At minimum it should work as a strong portfolio piece.

> Caveat: I had no access to paid keyword tools (Ahrefs/Semrush), so search-volume numbers still need a cheap validation pass. See "Validation plan" at the bottom.

---

## 1. What the research says about getting traffic in 2026

| Finding | Why it matters |
|---|---|
| Google AI Overviews appear on ~58% of informational queries, and CTR for the top results drops 30–50% when they show. They show much less on transactional ("do this for me") queries. | **Build a tool, not a blog.** AI can answer "how to convert X" but can't *do* the conversion. Tool pages keep their clicks. |
| Programmatic SEO still works in 2026, but only with genuinely distinct pages. Thin template spam gets filtered. | One tool + many real variants (per format, per language, per use case) is a valid growth engine. |
| Instafest reached 100M page views in one week, peaking at 500k new users/hour. Receiptify went global after one celebrity share. Both were student side projects. | **Shareable output** (an image people post) is the strongest free-user engine there is. It's also the hardest to predict. |
| github-readme-stats (65k+ stars) grows because every embed on a profile advertises it. | **Embeddable output** (badge/widget/card) creates a permanent growth loop plus backlinks. |
| Photopea (solo dev) earned about $1M/yr from ads alone. | A free tool with serious traffic can make money from ads with no paywall. |

**The three free-user engines, ranked by reliability:**
1. **Search for a transactional tool query** (slow but compounding, 3–6 months to kick in)
2. **Embeddable output** (steady, compounding)
3. **Shareable output** (lottery-like, huge upside)

The best idea uses two of them.

---

## 2. What is already crowded (avoid unless you have a real edge)

- **Generic PDF/image/video toolkits**: iLovePDF, TinyWow, and now dozens of "privacy-first, WebAssembly, no upload" clones (Fastools with 150+ tools, gottrix with 500+, PDFree, hushvert…). The "runs in your browser" angle is no longer different.
- **AI-search / GEO / llms.txt checkers**: at least 10 free ones already exist.
- **"Wrapped" generators for ChatGPT/Claude/GitHub**: at least 5 for AI chats and several for GitHub, plus an official GitHub challenge.
- **Bijoy ⇄ Unicode converters**: many exist, including .docx converters that keep formatting.
- **Generic Bengali subtitle generators**: Kapwing, VEED, Sonix, CapsAI, Maestra, Banva… (but see gap A below).

Lesson: in 2026 the gap is rarely "no tool exists." It's usually **"existing tools are bad at it"** or **"nobody built it for this specific audience."**

---

## 3. Gaps with real evidence

### Gap A: A Bangla-first speech-to-text & subtitle tool with *actually good* accuracy ⭐ top pick if you can serve Bangla speakers
- **Evidence of a quality gap:** a Sept 2026 open benchmark found that general models (OpenAI gpt-4o-transcribe, Whisper large-v3) have **4–5× the character error rate** of Bangla-specialised models. Specialised models scored about 7% CER (Sarvam saarika v2.5 at 6.9%, Soniox at 7.4%). Earlier research measured zero-shot Whisper at >80% WER on Bengali.
- Most "Bengali subtitle generator" pages are generic multi-language tools with a Bengali landing page, probably running the weaker general models.
- **Demand:** about 270M+ speakers, a big YouTube/Facebook creator economy, news outlets, lecture recordings, podcasts.
- **Traffic engines:** search ("bangla subtitle generator", "bangla voice to text", "bangla audio to text") plus word of mouth in creator groups. A watermark/credit on free exports adds a sharing loop.
- **Moat / profile value:** publish your own benchmark ("we're X% more accurate than Kapwing/VEED on this public test set"). That's credible, easy to share, and very strong on a CV.
- **Money:** creators and agencies already pay for subtitles, so a free tier plus paid minutes fits naturally.
- **Risk:** transcription costs money per minute, so the free tier needs limits (for example 10 min/day). Open fine-tuned models (e.g. BanglaSpeech2Text, Bangla-WhisperDiar) can cut costs.
- **Build size:** medium (upload → transcribe → editable subtitle timeline → SRT/VTT/burned-in export).

### Gap B: A local-language "utility layer" (Bangla or any language you know well)
The same pattern as Gap A, applied more widely: global tools support a language *on paper* but do it badly. Candidates to check: handwriting OCR, Unicode-safe PDF editing, and form/CV templates in the local script.
- Good for building an audience cheaply in a market that big SaaS companies neglect.
- Validate each one by testing the top 5 existing tools yourself. If they're clearly bad, that's your gap.

### Gap C: An embeddable stats card/widget for a platform that doesn't have a good one
- The github-readme-stats model: users paste your image URL into their profile, and every view advertises you.
- Needs a platform with a public API whose users have public profiles/READMEs (think newer dev, AI, learning or competitive platforms).
- **To validate:** search GitHub for "<platform> readme stats". If the top result is dead or unmaintained, that's the opening.
- Low server cost (SVG rendering plus caching), strong developer-portfolio value, but hard to monetise.

### Gap D: A shareable "result card" around a fresh trend (opportunistic)
- Only worth doing when you spot a new platform or data export **within days** of it appearing. Wrapped-style tools for ChatGPT and GitHub got crowded fast.
- Keep this as a skill you're ready to use (a template app you can ship in 48h), not as the main business.

---

## 4. Recommendation

1. **Main project:** Gap A, if Bangla (or another under-served language you speak) is an option. It has measurable evidence of a quality gap, search demand, a paying segment, and a benchmark-driven story that makes a great profile piece. If not, pick Gap C for a pure portfolio/traffic play.
2. **Side growth hack:** one Gap C widget. It's cheap to run and brings a steady flow of developer backlinks.
3. **Design every tool so its output carries your name** (watermark, "made with", embed link). That's what turns users into free distribution.

---

## 5. Validation plan (1–2 weeks, before building much)

1. **Search demand:** check the top 20 candidate queries in Google Keyword Planner (free) and Google Trends. Target at least 5–10k/mo combined across variants.
2. **Quality gap:** run the same 10 real samples through the top 5 competitors and record the errors. For Gap A, compute CER on a small public Bangla test set.
3. **Smoke test:** ship a one-page MVP with Search Console connected, post it in 3–5 relevant communities (Facebook creator groups, Reddit, dev forums) and watch return visits.
4. **Go/no-go:** keep going if organic impressions grow week over week and at least 20% of users come back.

---

## Sources
- AI Overviews impact: [Contently 2026 data](https://contently.com/2026/04/27/ai-overview-traffic-impact/), [Semrush AI SEO stats](https://www.semrush.com/blog/ai-seo-statistics/), [SeoProfy](https://seoprofy.com/blog/google-ai-overviews/)
- Programmatic SEO 2026: [Indie Hackers pSEO comparison](https://www.indiehackers.com/post/best-pseo-tools-2026-programmatic-seo-software-compared-aUKfjmVmEXaJiblpo1X6)
- Viral tools: [Vercel on Instafest](https://vercel.com/blog/from-idea-to-100-million-views-instafest-music-festival-application), [Receiptify](https://studioforcreativeinquiry.org/project/receiptify), [Photopea](https://en.wikipedia.org/wiki/Photopea)
- Embeds: [github-readme-stats](https://github.com/anuraghazra/github-readme-stats)
- Crowded privacy tools: [Fastools](https://binary.ph/2026/09/14/fastools-a-privacy-first-hub-of-150-browser-based-tools-for-images-video-pdfs-and-developer-tasks/), [Client-Side Kit](https://clientsidekit.com/), [DEV: 107 free browser tools](https://dev.to/krishnaisdinesh/i-built-107-free-browser-based-tools-as-a-solo-developer-heres-what-i-learned-23c8)
- Crowded GEO tools: [Pixelmojo list](https://www.pixelmojo.io/blogs/free-ai-visibility-tools-complete-guide)
- Crowded Wrapped tools: [aiwrapped](https://github.com/akshayvkt/aiwrapped), [LangChain AI Wrapped](https://wrapped.langchain.com/), [GitWrapped](https://github.com/asynced24/gitwrapped)
- Bijoy/Unicode: [bijoy2unicode .docx](https://bijoy2unicode.jehadurre.me/), [banglatools](https://banglatools.com/)
- Bangla subtitles: [Kapwing](https://www.kapwing.com/subtitles/video/bangla), [Sonix](https://sonix.ai/how-to-create-bengali-subtitles), [CapsAI](https://capsai.co/bengali-subtitle-generator)
- Bangla ASR quality: [Bangla STT benchmark v1.0.0](https://github.com/riverbornai/bangla-speech-to-text-benchmark/releases/tag/v1.0.0), [Bangla-WhisperDiar](https://arxiv.org/pdf/2605.08214), [BanglaSpeech2Text](https://github.com/shhossain/BanglaSpeech2Text)
- Idea mining method: [Linkeddit on Reddit complaints](https://linkeddit.com/blog/find-saas-ideas-from-reddit-complaints)

---

## 6. Decision (26 Sept 2026): build Gap A as a zero-cost, in-browser tool

Hosted transcription APIs (Soniox at $0.10/h) would still cost real money with many
free users. The chosen design removes server costs completely: the speech model runs
**in the visitor's browser** (WebGPU, or the CPU via WebAssembly), and the site is
static files on free hosting. The product is **Kotha** (`README.md`), and the launch
plan is in `docs/LAUNCH.md`.

What I verified while building it:

- Whisper's tokenizer uses about **2 tokens per Bangla character** (~10 per word), and
  one decoding window holds only 448 tokens. So audio has to be cut into short pieces
  (at most 12 s), or fast Bangla speech gets truncated.
- Generic small Whisper models fail badly on Bangla. whisper-tiny answers in English even
  when the Bangla language token is forced. A **Bangla fine-tuned model is essential**;
  `tools/convert_model.py` converts one to the browser format and was tested end to end.
- The full browser pipeline (decode → speech detection → Web Worker inference → editor
  → SRT/VTT/burned-in video) runs with a real model in automated tests.

Open question for the first real test: accuracy of the converted Bangla model on real
YouTube-style audio (`scripts/evaluate.ts` measures it).
