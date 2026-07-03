---
title: "Why I Built VERA: The 2AM Rejection That Started Everything"
date: "2026-07-03"
description: "I got rejected by HireVue at 2AM. The system's own data said I was exceptional. No explanation was given. Here is what I found when I went looking for one and what I decided to build instead."
tags: ["VERA", "AI Hiring", "HireVue", "EU AI Act", "Build Series"]
order: 1
---

I applied for the graduate scheme at BAE Systems. One of those roles you actually want, structured, serious, the kind of thing you spend time on. I got through to the interview stage and was invited to complete a HireVue assessment.

The instructions were clear: dress corporately, treat it like a real interview. There would be two sections, a video interview and a games-based assessment. I did both. I took it seriously.

Then I got my results.

## The feedback said I was exceptional

HireVue promises personalised insights based on your performance. Mine came back glowing. High marks for teamwork. Strong signals on cognitive complexity and adaptability. The kind of feedback that makes you think: *okay, I have got this.*

![HireVue feedback from my BAE Systems assessment showing strong signals across all three competency areas](/images/vera/hirevue-feedback.png)
*HireVue's own assessment of my performance: before the 2AM rejection.*


At 2AM, a rejection arrived.

No explanation. No specific feedback. Just a generic message explaining that they could not tell me why I was being rejected at this time.

I sat with that for a while. Because something about it did not add up. If you are using AI to analyse someone's performance, the AI knows why it made the decision it made. That is not magic. That is how the system works. A model that can produce a positive signal on teamwork and cognitive complexity can absolutely produce a reason for rejection; unless the reasons are not something they want to explain.

I submitted a request for feedback. I received an automated refusal.

## So I went looking for answers

What started as frustration turned into a research spiral. I wanted to understand what was actually happening inside these tools. What I found was not reassuring.

Mackereth and Drage (2022) described the use of facial microexpression analysis and voice tone scoring as modern phrenology -- the attempt to read internal states from physical signals with no scientific basis, mirroring histories of taxonomical racism. The research was clear: video and audio signals do not reliably predict job performance. They predict how someone looks on camera, how they are lit, what they are wearing. HireVue's own data had flagged me as a strong candidate. The rejection contradicted it.

The regulatory picture confirmed what the research suggested. The EU AI Act classifies recruitment AI as a high-risk system category, with full enforcement coming into effect on 2 August 2026. NYC Local Law 144 requires annual bias audits of automated employment decision tools. The Electronic Privacy Information Center filed a complaint against HireVue in 2019, citing the use of unvalidated pseudoscientific signals in high-stakes employment decisions.

Bommasani et al. (2026) went further. Analysing 4.1 million applications across 156 employers, they found that 25.87% of applications submitted by Black applicants are routed to models that demonstrably disadvantage them. More structurally: over 60% of the Fortune 100 use a single vendor's algorithms. The same candidates are being rejected everywhere, simultaneously, with no recourse. They called it algorithmic monoculture.

Rivera (2012) put the historical foundation under all of it. Hiring has always functioned as a gatekeeping mechanism -- not for competence, but for similarity. A system trained on historical hiring outcomes does not fix that bias. It encodes it.

## The signal has to be replaced, not adjusted

This is the part that changed how I thought about the problem.

The instinct when you find bias in a system is to try to tune it out -- remove the protected characteristics, adjust the weights, run bias audits. But Mackereth and Drage show why that does not work. Gender and race are not isolatable data fields. They are structural forces that shape how people speak, write, present experience, and navigate institutions. Strip them from a model trained on historically biased outcomes and you do not get a neutral system. You get a system that defaults to an implicit baseline -- whoever has historically been hired.

The signal itself is the problem. Video analysis, voice tone scoring, facial microexpression detection -- these need to be removed entirely, not adjusted.

So I stopped trying to fix the existing architecture and started designing a replacement.

## VERA

VERA stands for Verified, Explainable, Responsible Assessment. The name comes from the Latin for truth -- which felt right for a system whose entire purpose is to tell candidates the truth about how they were evaluated.

The design constraints came directly from what I had found:

**No video. No audio. No biometrics.** If the signal cannot be scientifically validated as a predictor of job performance, it has no place in the system.

**Human-approved rubrics.** A recruiter defines the role. VERA generates a competency framework. A human reviews and approves it before any candidate is evaluated. The criteria are visible, not hidden.

**Evidence-based scoring.** Every decision is backed by direct quotes from the candidate's own words. The model cannot produce a score without producing the evidence for it.

**Mandatory human review.** VERA does not reject candidates. It produces structured reports that a human must review before any decision is communicated. The system by design cannot produce an unexplained