title: "From Local Inference to Hybrid Cloud: Setting Up Ollama on Apple Silicon and Connecting It to GCP"
date: 2026-03-29
tags: ["Ollama", "Apple Silicon", "LLM", "Terraform", "GCP", "Tailscale", "VPC", "IAP", "Zero Trust"]
description: "I set up a Mac Mini M1 running Mistral 7B with Ollama, Terraformed a zero-trust GCP environment, and connected them through an encrypted Tailscale tunnel. A GCP VM with no public IP now calls a local AI model in my home."
---

This post covers Phase 1 and Phase 2 of my hybrid AI inference platform. Phase 1 gets local inference running on a Mac Mini. Phase 2 builds the cloud side with Terraform and connects the two through a private network. By the end, a GCP VM in us-central1 is calling an AI model on my Mac Mini in Lincoln, UK, through an encrypted tunnel.

## Part 1: Local Inference

### Why local inference matters

Cloud AI inference is powerful but expensive. Every API call to Vertex AI or OpenAI costs money. For straightforward tasks like summarisation, Q&A, and code explanation, a smaller model running on your own hardware handles the job without the bill.

The Mac Mini M1 with 16GB unified memory is well suited for this. Apple Silicon's unified memory architecture means the CPU and GPU share the same RAM pool. There is no bottleneck copying data between separate memory banks, which is exactly what inference workloads need. Ollama optimises specifically for this architecture.

The cost of running inference locally is essentially electricity. The cost of cloud inference is per-token. For a portfolio project where I will be making thousands of test requests, local inference saves real money.

### Installing Ollama

Ollama handles model downloads, memory management, and serves inference over an HTTP API. Installation with Homebrew:

```bash
brew install ollama
```

Starting the server:

```bash
ollama serve
```

Pulling Mistral 7B:

```bash
ollama pull mistral
```

The download is about 4GB. Once complete, you can test interactively:

```bash
ollama run mistral "What is BGP and why is it important for hybrid cloud networking?"
```

Mistral responds with a detailed explanation. On my M1, the first request takes 5-6 seconds because the model loads into memory from disk. After that, the model stays loaded and subsequent requests are faster.

### Understanding the HTTP API

The interactive terminal mode is useful for testing, but the hybrid platform needs a programmable interface. Ollama exposes a REST API on port 11434:

```bash
curl http://localhost:11434/api/generate \
  -d '{"model": "mistral", "prompt": "hello", "stream": false}'
```

The response is JSON:

```json
{
  "model": "mistral",
  "response": "Hello! How can I help you today?",
  "total_duration": 3701572250,
  "load_duration": 1388095834,
  "prompt_eval_count": 6,
  "prompt_eval_duration": 366034291,
  "eval_count": 26,
  "eval_duration": 1926452792
}
```

Breaking down the key fields:

**total_duration** is in nanoseconds. 3.7 seconds total for this request, which includes loading the model.

**load_duration** of 1.4 seconds is the time spent loading the model into memory. This only happens on the first request or after the model has been evicted. Subsequent requests skip this entirely.

**prompt_eval_count** of 6 means the word "hello" was tokenised into 6 tokens. Models do not process words directly. They convert text into numerical tokens first.

**eval_count** of 26 and **eval_duration** of 1.9 seconds means Mistral generated 26 tokens at roughly 13-14 tokens per second. That is solid throughput for a 7B parameter model on consumer hardware.

### Cold vs warm inference

Run the same request twice in a row and compare `total_duration`. The first request includes model loading. The second request skips it because the model is already in memory. On my M1:

- Cold request (model loading): ~5-6 seconds
- Warm request (model loaded): ~2-3 seconds

In a production system, you would keep the model loaded permanently and monitor for unexpected cold starts. A sudden increase in response time could indicate the model was evicted from memory, which might mean another process is competing for RAM.

### Adding a second model

I pulled Microsoft's Phi-3 as a lightweight alternative:

```bash
ollama pull phi3
```

Phi-3 is smaller than Mistral 7B, which means faster responses but less capable reasoning. Having two models locally gives the orchestrator options: route simple requests to Phi-3 for speed, and complex requests to Mistral for quality.

At this point, the Mac Mini is a working inference node. But it only responds to localhost. Time to connect it to the cloud.

---

## Part 2: Building the Cloud Side

### Making Ollama reachable

By default, Ollama listens on `127.0.0.1:11434`. The `127.0.0.1` address means localhost only. No other machine on any network can reach it. For the hybrid platform, the GCP orchestrator needs to call this API remotely.

The fix is changing the bind address. `127.0.0.1` means "only this machine." `0.0.0.0` means "all network interfaces," which includes localhost, WiFi, and any VPN interfaces:

```bash
OLLAMA_HOST=0.0.0.0 ollama serve &
```

You can verify the difference with `lsof`:

```bash
lsof -i :11434
```

Before the change, this shows `localhost:11434`. After, it shows `*:11434`. The asterisk means all interfaces.

**A note on security:** Binding to `0.0.0.0` means anyone on my local WiFi who knows the IP and port could send prompts to my model. For development behind a NAT router with no port forwarding, this is acceptable. In production, I would bind only to the Tailscale interface (`OLLAMA_HOST=100.80.121.94`) or add firewall rules restricting port 11434 to the Tailscale IP range. I will address this in the security hardening phase.

### Setting up Tailscale

Tailscale creates an encrypted WireGuard mesh network. Every device that joins gets a private `100.x.x.x` IP address and can communicate directly with every other device, regardless of NATs or firewalls.

I chose Tailscale over Cloudflare Tunnel for a specific reason. Cloudflare Tunnel creates outbound-only connections, which means GCP could not initiate requests to the Mac Mini. The hybrid platform needs bidirectional connectivity because the orchestrator actively calls Ollama. Tailscale provides full mesh connectivity where any node can reach any other node.

On the Mac Mini:

```bash
brew install tailscale
sudo tailscaled &
sudo tailscale up
```

After authenticating, the Mac Mini received the Tailscale IP `100.80.121.94`. Testing inference over the Tailscale interface:

```bash
curl http://100.80.121.94:11434/api/generate \
  -d '{"model": "mistral", "prompt": "hello", "stream": false}'
```

Mistral responded. Ollama is now reachable over the private network.

In a later phase, I will layer HA VPN with BGP on top of this Tailscale connectivity. Tailscale will act as the underlay network for IPsec tunnels, adding redundancy and dynamic routing. But the immediate goal was proving private connectivity works.

### Terraforming the GCP environment

Everything on the GCP side is defined in Terraform. No console clicking, no manual setup. The code is organised into three modules:

```
terraform/
  main.tf
  variables.tf
  outputs.tf
  modules/
    network/    # VPC, subnet, firewall, Cloud NAT
    compute/    # VM, service account, IAM
    security/   # Secret Manager
```

Each module has a single responsibility. The root `main.tf` passes outputs between them:

```hcl
module "compute" {
  source           = "./modules/compute"
  project_id       = var.project_id
  subnet_self_link = module.network.infra_subnet_self_link
}
```

This means I can modify networking without touching compute, or replace the VM configuration without affecting the firewall rules.

### The network

The VPC uses `auto_create_subnetworks = false`. By default, GCP creates a subnet in every region. Disabling this gives explicit control over IP ranges and placement.

The subnet uses `10.10.0.0/24` with `private_ip_google_access = true`. Private Google Access means VMs without public IPs can still reach Google APIs like Secret Manager and Cloud Monitoring.

**Cloud NAT** provides outbound internet access. The VM needs to pull Docker images and install packages, but I do not want to assign a public IP for that. Cloud NAT acts as a managed outbound gateway. Traffic exits through an auto-allocated NAT IP, but nothing from the internet can initiate an inbound connection. One-way glass.

### Firewall rules

The custom VPC has no default allow rules. I defined four explicit rules:

**IAP SSH**: Allows TCP port 22 from `35.235.240.0/20` only. This is Google's IAP range. When I SSH through IAP, Google verifies my identity before creating the tunnel. No SSH keys to manage, no bastion host to maintain, no port 22 exposed to the internet.

**Internal traffic**: Allows all protocols within `10.10.0.0/24`. VMs in the subnet can communicate freely.

**Health checks**: Allows TCP on ports 80, 443, and 8080 from Google's health check ranges. Preparation for when we add a load balancer.

**Deny all** (priority 65534): Explicitly denies all other ingress from `0.0.0.0/0`. GCP custom VPCs are default-deny, but making this rule explicit documents the intent.

### The VM

The orchestrator VM is an `e2-micro` running Debian 12:

**No external IP.** The `network_interface` block has no `access_config`. The VM is invisible to the internet.

**Shielded instance.** Secure boot, vTPM, and integrity monitoring protect against boot-level tampering.

**OS Login.** Authentication uses my Google identity rather than SSH keys. No key files to rotate or leak.

**Least-privilege service account.** Only `logging.logWriter` and `monitoring.metricWriter` roles. It can send logs and metrics, nothing else.

**Startup script.** On first boot, the VM installs Docker, nginx, and Tailscale automatically.

### The moment of truth

After `terraform apply` was completed, I SSH'd into the VM through IAP:

```bash
gcloud compute ssh orchestrator-vm --zone=us-central1-a --tunnel-through-iap
```

Then joined the Tailscale network:

```bash
sudo tailscale up
```

And called Ollama on my Mac Mini:

```bash
curl http://100.80.121.94:11434/api/generate \
  -d '{"model": "mistral", "prompt": "hello", "stream": false}'
```

Mistral responded in 5.7 seconds. A GCP VM in us-central1, sitting in a private subnet with no public IP, sent a prompt through an encrypted Tailscale tunnel to a Mac Mini in Lincoln, UK, and received an AI-generated response.

That is hybrid cloud connectivity. Built from code. Secured by default.

### What Terraform changes

Without Terraform, this setup would mean clicking through dozens of console screens, remembering IP ranges, hoping firewall rules are consistent, and having no record of what was configured.

With Terraform, the entire environment is about 200 lines of HCL across three modules. `terraform plan` shows what will change. `terraform apply` creates everything in 90 seconds. `terraform destroy` removes it cleanly. If I need to recreate this in a different region or project, I change two variables.

The infrastructure is documented by being code.

## What's next

Two phases down. The Mac Mini serves local inference, and GCP can reach it through an encrypted tunnel. Phase 3 layers HA VPN with BGP on top of the Tailscale connectivity for enterprise-grade redundancy. Phase 4 builds the orchestration API that intelligently routes requests between local and cloud models.

