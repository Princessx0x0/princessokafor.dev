---
title: "How VERA's Scoring Pipeline Works: Two Passes, Four Parallel Calls, and Why LLMs Cannot Do Maths"
date: "2026-07-07"
description: "The naive approach was tempting. I tried it. It failed miserably. Here is why a single-prompt architecture breaks down under production constraints, and how we engineered a multi-pass, parallelised, schema-enforced inference pipeline that delivers compliant, assessment-ready frameworks in under 10 seconds."
tags: ["VERA", "Architecture", "Gemini", "Vertex AI", "FastAPI", "Build Series"]
order: 2
---

The naive approach was tempting. Toss a job description at an LLM and ask for a psychometric framework. I tried it. It failed miserably.

Building an AI tool in the HR tech space right now means playing on hard mode. Under the EU AI Act, AI systems used for recruitment and hiring are classified as high-risk. Transparency, human oversight, and data integrity are not features you tack on later -- they are the core engineering constraints from day one.

Here is why a single-prompt architecture breaks down under production constraints, and how we engineered a multi-pass, parallelised, schema-enforced inference pipeline that delivers compliant, assessment-ready frameworks in under 10 seconds.

## Why Two Passes? The Synthesis vs. Precision Problem

A single LLM call cannot reliably optimise for two structurally distinct cognitive tasks simultaneously.

**Pass 1 requires broad synthesis:** reading a messy, free-text role description and extracting a coherent set of high-level competencies that collectively map the target role.

**Pass 2 requires narrow precision:** taking those distinct competencies and generating five highly calibrated, granular behavioural scoring anchors for each one.

When you smash these tasks together into one mega-prompt, the model chokes. The competency descriptions end up vague because the model is distracted by the scoring matrix, or the scoring anchors turn into generic boilerplate because the model exhausted its attention on the initial synthesis.

By separating the architecture into two dedicated passes -- each with its own specialised system instructions and explicit JSON schemas -- the model is freed to execute each task in complete isolation.

<div class="image-scroll-wrap">
  <div class="image-scroll-container">
    <img src="/images/vera/architecture-desktop.webp" alt="VERA two-pass scoring pipeline architecture diagram" />
  </div>
  <p class="scroll-hint">swipe to explore →</p>
</div>

## Pass 1: Framework Generation and Fixing LLM Maths

Pass 1 runs at `temperature=0.2` to prioritise structure and analytical consistency over creative prose. The system instruction relies on three non-negotiable architectural anchors.

### 1. Intentional Persona Framing

We explicitly anchor the prompt: *"You are an expert Industrial-Organisational Psychologist designing bias-free competency frameworks."* This is not decorative prompting fluff. LLM output quality is sensitive to role framing -- instructing the model to operate within the specific terminology of I-O psychology activates hyper-specific latent patterns around construct validity and behavioural specificity.

### 2. Embedded Few-Shot Anchoring

Rather than relying on abstract guidelines, we inject a real, production-grade reference framework from VERA's standard library dynamically at call time:

```python
def _get_reference_examples() -> str:
    fw = get_framework("grad-software-engineer-001")
    # Returns a string-formatted role title, opening question, and competency list
```

This gives the model an exact target to hit regarding tone, length, and specificity before it processes the user's input.

### 3. Hard Deterministic Rules and Schema Enforcement

We enforce strict structural guidelines via system rules combined with a Vertex AI `response_schema`:

```python
PASS1_SCHEMA = {
    "type": "object",
    "properties": {
        "opening_question": {"type": "string"},
        "competencies": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "id":          {"type": "string"},
                    "name":        {"type": "string"},
                    "weight":      {"type": "number"},
                    "description": {"type": "string"},
                },
                "required": ["id", "name", "weight", "description"]
            }
        }
    },
    "required": ["opening_question", "competencies"]
}
```

By enforcing `response_mime_type="application/json"` with this schema, the Vertex AI SDK forces the model to mathematically constrain its token generation to this layout. No missing fields, no formatting mutations, and clean `snake_case` IDs that can be dropped directly into Firestore as document keys without sanitisation.

### The Catch: Fixing Floating-Point Drift

Even with a strict schema, LLMs are notoriously bad at basic arithmetic. Ask a model to output four weights that sum to exactly 1.0 and it will confidently output `0.40, 0.25, 0.20, 0.14`.

To a human, close enough. To a database and a downstream mathematical scoring engine, that missing `0.01` causes cascading errors. We solved this by treating LLM output as a draft and running it through a deterministic correction layer immediately upon return:

```python
total = sum(c["weight"] for c in competencies)

if total != 1.0 and len(competencies) > 0:
    competencies[-1]["weight"] = round(
        1.0 - sum(c["weight"] for c in competencies[:-1]), 4
    )
```

The user sees a perfectly balanced 100% framework -- not because the AI was mathematically perfect, but because the application code cleanly clamped the boundaries.

## Pass 2: Massively Parallel Scoring Anchors

Once Pass 1 hands off the verified competencies, Pass 2 fires up to build the actual grading rubrics.

If we executed these calls sequentially, the user would watch a loading spinner for nearly 30 seconds. To maintain a responsive UX, we map the tasks across Python's `ThreadPoolExecutor` to execute all four calls simultaneously:

```python
def _pass2_parallel(competencies: list, role_title: str) -> list:
    with ThreadPoolExecutor(max_workers=4) as executor:
        futures = [
            executor.submit(_pass2_single, comp, role_title)
            for comp in competencies
        ]
        return [f.result() for f in futures]
```

Instead of the total processing time being the sum of all calls, our total latency is simply the execution time of the single slowest call -- typically 2 to 3 seconds.

### Fighting Ambiguity with the 15-Word Constraint

The Pass 2 prompt enforces a hyper-specific constraint: exactly one behavioural anchor per score level, maximum 15 words each.

```python
_PASS2_SYSTEM = """You are an expert psychometric evaluation architect.
Competency: {name}
Role Context: {role_title}

CRITICAL RULES:
Provide EXACTLY one sentence per level, max 15 words each.
Scale rules: 5=exceptional master, 4=strong, 3=reactive rule-based, 2=struggles, 1=no evidence."""
```

The 15-word constraint is a deliberate psychometric defence mechanism. If you let an LLM write a 50-word paragraph for a scoring anchor, you introduce massive subjective ambiguity. Short, tight, punchy behavioural indicators force the model to zero in on the exact differentiating signal for that skill level.

Injecting `{role_title}` directly ensures a communication competency anchor for a Motion Animator explicitly references articulating creative movement and timing -- not generic corporate presentation skills.

## The Compliance Gate: Output Assembly

After both passes resolve, VERA compiles the raw data into a unified framework payload. But it cannot go live immediately.

```python
return {
    "role_id":      f"custom-{safe_id}-{org_id[:8]}",
    "role_title":   role_title,
    "competencies": competencies,
    "ai_generated": True,
    "status":       "pending_review",
    "validation":   {"valid": True, "reason": "validated natively via schema enforcement"},
}
```

Two critical fields:

**`ai_generated: True`** -- this flag is persistent. It journeys through the database and into the final audit logs so any downstream compliance audit can clearly differentiate automated framework foundations from human-built ones.

**`status: "pending_review"`** -- this is our hard architectural line for the EU AI Act. A framework cannot be assigned to an active candidate assessment until a human recruiter logs in, reviews the text, and explicitly approves it. Human oversight is not an afterthought option on a settings page. It is physically hardcoded into the data state lifecycle.

## The Defensive Engineering Matrix

When building with LLMs, you must design defensively. You operate under the assumption that the stochastic nature of models will fail you, and you build code layers to catch those failures.

| Architectural Layer | Failure Mode Addressed |
|---|---|
| I-O Psychology Persona | Generic, non-measurable, fluffy competency language |
| Few-Shot Reference Embedding | Model structural drift or incorrect specificity levels |
| Hard System Rules | Variable-length outputs or missing evaluation fields |
| Schema Enforcement | Malformed JSON strings or breaking type mutations |
| Weight Normalisation Layer | Floating-point math drift breaking downstream calculations |
| Parallel ThreadPool Execution | High sequential latency ruining application UX |
| 15-Word Anchor Constraints | Verbose, ambiguous rubrics that degrade inter-rater reliability |
| `pending_review` Status Gate | Non-compliance with EU AI Act mandatory human oversight provisions |

By decoupling ingestion, processing, calibration, and compliance checks into independent, programmatic steps, VERA turns an unpredictable generative model into a reliable, enterprise-grade data pipeline.

---

*In the next post: the Global Endpoint Pivot -- how hidden regional cloud quotas almost broke our production environment mid-interview, and the tough data-residency tradeoffs required to fix it.*
