# 2026 Build With AI Hackathon - Setup & Credits

This repository contains the initialization script for the **Build With AI Hackathon**.

## Hackathon Credit Claim

Running the provided setup script is the primary way to claim your hackathon credits and prepare your development environment.

### Automatic Project Creation
The `init.sh` script will **automatically create a new Google Cloud Project** for you. This project is pre-configured for the hackathon and ensures a clean isolated environment for your team's work.

### Using Google Cloud Services
Once the script has finished and your project is created:
1.  **Full Service Access**: You can create and use most Google Cloud Platform (GCP) services within this project (Compute Engine, Cloud Run, Vertex AI, etc.).
2.  **Credit Billing**: All usage within this project will be automatically charged to the **$25 credits** provided to you for the event.
3.  **AI Studio Integration**: You can also use this Project ID as your **Paid Project ID in Google AI Studio**. This allows you to use the Gemini API with the higher rate limits provided by the hackathon credits.

## Getting Started

To initialize your environment, run the following commands in your Cloud Shell or local terminal:

```bash
chmod +x init.sh
./init.sh
```

Follow the prompts to authenticate and finalize your setup.
