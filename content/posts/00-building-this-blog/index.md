---
title: "How I Built My Technical Blog with Hugo, GitHub Actions & a Custom Domain"
date: 2026-03-21
tags: ["Hugo", "GitHub Actions", "CI/CD", "Cloudflare", "DNS"]
description: "I built my own blog infrastructure instead of using Medium. Here's why, and how I set it up with Hugo, PaperMod, GitHub Pages, and a custom domain on Cloudflare."
---

I could have used Medium. I could have used Hashnode or Dev.to. But I'm a cloud engineer, and the way I publish my writing should reflect that.

This blog is a Git repository. Every post is a Markdown file. When I push to `main`, a GitHub Actions pipeline builds the site with Hugo and deploys it to GitHub Pages. My custom domain is managed through Cloudflare. The whole thing is infrastructure-as-code, version-controlled, and automated.

Here's how I set it up, and why I made the choices I did.

## Why Hugo

Static site generators turn Markdown files into HTML. No databases, no server-side rendering, no WordPress security patches at 2am. Hugo is written in Go, which means it builds fast; my entire site compiles in under a second.

I chose Hugo over alternatives like Jekyll or Gatsby for a few reasons. It has no runtime dependencies, just a single binary. The build times are nearly instant. And the theming system is flexible enough to customise without fighting the framework.

## The Theme

I'm using PaperMod as a base, heavily customised with a parchment-inspired design. The aesthetic was intentional; warm cream tones, Playfair Display for headings, Lora for body text, IBM Plex Mono for code. I wanted the blog to feel like a technical journal, not a generic developer portfolio.

The custom CSS lives in `assets/css/extended/custom.css`, which PaperMod loads automatically. No need to fork the theme...just override what you need.

## The CI/CD Pipeline

Every push to `main` triggers a GitHub Actions workflow that:

1. Checks out the repository with submodules (the theme lives in `themes/PaperMod` as a git submodule)
2. Installs Hugo 0.158.0 with extended support
3. Runs `hugo --minify` to build the production site
4. Deploys the `public/` directory to GitHub Pages
```yaml
name: Deploy Hugo to GitHub Pages
on:
  push:
    branches: [main]
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          submodules: true
          fetch-depth: 0
      - name: Setup Hugo
        uses: peaceiris/actions-hugo@v3
        with:
          hugo-version: '0.158.0'
          extended: true
      - name: Build
        run: hugo --minify
      - name: Upload artifact
        uses: actions/upload-pages-artifact@v3
        with:
          path: ./public
  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
    steps:
      - name: Deploy to GitHub Pages
        uses: actions/deploy-pages@v4
```

The entire deployment takes about 30 seconds from push to live.

## Custom Domain & DNS

My domain `princessokafor.dev` is registered through Cloudflare at a cost of about £10/year. The `.dev` TLD enforces HTTPS by default, which is one less thing to configure.

The DNS setup points to GitHub Pages via four A records and a CNAME:

- Four A records pointing `@` to GitHub's IP addresses (185.199.108-111.153)
- One CNAME pointing `www` to `princessokafor.github.io`

One thing to note: if you're using Cloudflare, set the proxy status to **DNS only** (grey cloud) for all records. GitHub Pages needs to handle SSL certificate provisioning directly, and Cloudflare's proxy interferes with that.

A `static/CNAME` file containing `princessokafor.dev` tells GitHub Pages which domain to serve.

## Repository Structure
```
princessokafor.dev/
├── .github/workflows/deploy.yml
├── assets/css/extended/custom.css
├── config/_default/
│   ├── hugo.toml
│   ├── menus.toml
│   └── params.toml
├── content/
│   └── posts/
│       └── 00-building-this-blog/
│           └── index.md
├── layouts/
│   └── index.html
├── static/
│   ├── CNAME
│   └── favicon.svg
└── themes/PaperMod/
```

Every post lives in its own directory under `content/posts/` as a page bundle. This means each post can have its own images and assets without cluttering a shared folder.

## What's Next

This blog exists to document a larger project: building a hybrid AI inference platform that connects a Mac Mini running local LLM inference to Google Cloud Platform via HA VPN with BGP. The infrastructure is provisioned with Terraform, configured with Ansible, and secured with a zero-trust architecture.

The next post will cover Phase 1: Setting up Ollama on Apple Silicon and running local inference on Mistral 7B.

If you want to see the source code for this blog, it's public: [github.com/Princessx0x0/princessokafor.dev](https://github.com/Princessx0x0/princessokafor.dev)
```


