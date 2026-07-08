---
title: "The 429 Wall: Hidden Regional Quotas, a Data Residency Tradeoff, and the 16-Second UX Ceiling"
date: "2026-07-08"
description: "VERA's production environment ground to a halt mid-interview. The culprit was a regional quota we couldn't even see. Here is how we pivoted our infrastructure, discovered an unexpected model capability finding, and engineered a 16-second UX ceiling to keep candidates from getting stranded."
tags: ["VERA", "GCP", "Vertex AI", "Rate Limiting", "EU AI Act", "Build Series"]
order: 3
---

Every developer building with large language models knows the honeymoon phase. That magical window during local testing where everything works flawlessly. For VERA, I was running a custom framework for a Tailor role -- defining required skills like Sewing, Embroidery, Creativity, Sketching, and Communication.

The engine generated the weighted competencies beautifully in under two minutes. I started a live interview mock, began interacting with the candidate interface, and then, right on the third conversation turn, the screen froze.

In the logs, my backend was screaming:

```bash
google.genai.errors.ClientError: 429 RESOURCE_EXHAUSTED.
{
  'error': {
    'code': 429,
    'message': 'Resource exhausted. Please try again later...'
  }
}
```

Here is how I dug through Google Cloud's regional limitations, pivoted the infrastructure, discovered an unexpected model capability finding, and used exponential backoff to turn a catastrophic system crash into a silent, well-managed UX loading state.

## The Architecture Before the Wall

VERA splits its workload across two distinct models, each chosen for a specific cognitive task:

**Gemini 2.5 Pro:** The highest-capability analytical model, reserved exclusively for the heavy lifting of reading a 7-turn interview transcript and scoring it against a rubric.

**Gemini 2.5 Flash:** A fast, lightweight model used for the real-time conversation engine and the parallel framework generator.

Because VERA's core backend lives on Cloud Run in the London region (`europe-west2`), it made logical sense to route inference calls to the same regional endpoints to minimise network latency:

```
[Cloud Run Backend] ---> (europe-west2) ---> [Regional Gemini API]
```

The moment we switched configuration to point to `europe-west2` Vertex AI regional endpoints, the framework generator started throwing a barrage of 429 errors.

## The Mystery of the Ghost Quota

We checked the Google Cloud Console quota dashboard. Token allowances were wide open. We requested increases. Denied.

Then came the strangest part: when searching the GCP quota console for `europe-west2`, Gemini 2.5 Pro was right there. Various Text-to-Speech variants were there. But Gemini 2.5 Flash -- the core workhorse model driving VERA's conversation engine -- was completely missing from the console.

The region exposed older models. It exposed TTS variants. But it did not surface the base Flash model quota in a way that could be adjusted. We were bottlenecked by a regional resource constraint we could not even see.

<div class="image-scroll-wrap">
  <div class="image-scroll-container">
    <img src="/images/vera/quota-diagram-desktop.webp" alt="GCP regional quota wall and global endpoint pivot diagram" />
  </div>
  <p class="scroll-hint">swipe to explore →</p>
</div>

## The Fix: Pivoting to the Global Endpoint

Google's recommended architectural escape hatch for these edge cases is to abandon the localised regional endpoint and initialise the client against their managed global router:

```python
import os
from google import genai

# Before: locked to a single region
# location = os.environ.get("GCP_REGION", "europe-west2")

# After: dynamic global routing
_client = genai.Client(
    vertexai=True,
    project=os.environ.get("GCP_PROJECT_ID"),
    location="global",
)
```

The difference was instantaneous. The 429 crashes stopped immediately.

The global endpoint acts as an intelligent cloud traffic controller. Instead of pinning VERA to the server capacity of a single data centre in London, it dynamically routes inference requests across Google's massive shared worldwide pool of capacity.

## The Catch: Data Residency

In engineering, you rarely get a free lunch.

VERA is built to align with the EU AI Act. When our infrastructure used the regional `europe-west2` endpoint, we had a clean data containment story: candidate information and raw assessment data never left the European region.

By pivoting to `location="global"`, we transferred routing control to Google. While our Cloud Run application server still sits securely in London, the raw transcript arrays and text packets sent during LLM inference may be processed in data centres outside the UK or EU depending on global demand.

For our current operational phase -- running pilot programmes with Amata Storytelling and supporting my MSc dissertation evaluation -- this is an acceptable tradeoff for operational stability. High-risk AI compliance requires acknowledgment, not perfection.

For a future enterprise deployment with strict data sovereignty mandates, this infrastructure choice will need to be revisited. It is documented, flagged, and tracked.

## The Unexpected Finding: Flash Does the Job

Once on the global endpoint, we kept Gemini 2.5 Pro for the final scoring rubric, assuming Flash could not handle the analytical rigour of evaluating a full 7-turn transcript.

Out of curiosity, we tested running the final evaluation tasks on the global Flash endpoint too.

The results were surprising. Because VERA leans heavily on strict schema enforcement -- forcing the model to populate structured JSON keys for confidence intervals, numeric scores, and explicit transcript quote references -- the structural framework does the heavy cognitive lifting. The model's job becomes filling a rigid contract rather than exercising open-ended judgement.

The capability gap between Pro and Flash shrinks dramatically when you constrain the model's freedom with a rigid JSON schema. VERA now runs on Gemini 2.5 Flash for everything -- slashing operational API costs to a fraction of the original budget while keeping processing times fast.

## Defensive Engineering: Jitter and the 16-Second UX Ceiling

Fixing the endpoint solves base capacity. But in production, concurrent usage spikes can still trigger occasional rate limits. You cannot let the application drop dead when that happens.

The answer is exponential backoff with jitter. Instead of retrying immediately and hammering the API, the system waits incrementally longer after each failure, adding randomness to prevent a thundering herd problem where multiple browser sessions retry at the exact same microsecond:

```python
import time
import random

MAX_RETRIES   = 5
BASE_DELAY    = 1.0   # seconds
MAX_DELAY     = 16.0  # give-up threshold
JITTER_FACTOR = 0.3   # up to 30% random variance

for attempt in range(MAX_RETRIES):
    try:
        return call_gemini_api()
    except ClientError as e:
        if e.code not in (429, 503):
            raise  # crash immediately on auth or security errors

        delay = min(BASE_DELAY * (2 ** attempt), MAX_DELAY)
        jitter = random.uniform(0, delay * JITTER_FACTOR)
        time.sleep(delay + jitter)
```

### Designing the Wait: How Long is Too Long?

An exponential retry loop will happily run forever if you let it. But in a live hiring assessment, there is a real human being on the other side of the screen.

The timeout ceiling is a product decision, not an engineering one. I mapped the retry timeline directly to evolving UI loader states:

| Timeline | Backend State | Frontend UX |
|---|---|---|
| 0s – 1s | Retry #1 | Invisible. Standard loader handles this naturally |
| 1s – 3s | Retry #2 | Acceptable. Candidate assumes VERA is processing |
| 3s – 7s | Retry #3 | Loader text shifts to indicate active analysis |
| 7s – 15s | Retry #4 | Copy changes: "Still working on this, analysing context..." |
| 16s+ | Give up | Graceful error. Transcript checkpoint preserved |

Clamping the loop at 16 seconds is where the UX breaks regardless of how good the UI handling is. It is better to fail cleanly, preserve the transcript checkpoint, and let the candidate retry the turn manually, than to keep them trapped in an infinite loading loop.

---

*In the next post: VERA scored an AI model 4.45 out of 5. The lowest score was Collaboration at 3 out of 5 -- and what that result revealed about how we need to redesign the integrity layer.*
