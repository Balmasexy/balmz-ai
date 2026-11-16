# BALMZ AI OpenAI-Compatible API

BALMZ AI can be used as a model provider by applications that support a custom OpenAI-compatible Chat Completions endpoint. Your application connects to BALMZ AI; BALMZ AI routes the request privately to its server-managed Google Gemini model.

## Connection settings

- **Base URL:** `https://balmz-ai.onrender.com/v1`
- **Model:** `balmz-fast`
- **Authentication:** `Authorization: Bearer YOUR_BALMZ_API_KEY`
- **Models endpoint:** `GET https://balmz-ai.onrender.com/v1/models`
- **Chat endpoint:** `POST https://balmz-ai.onrender.com/v1/chat/completions`

In a provider configuration screen, choose OpenAI-compatible / Custom OpenAI API, paste the Base URL, set the model to `balmz-fast`, and add a BALMZ API key with the required scopes.

## Create a key

1. Sign in to BALMZ AI as Super Admin and open **API Keys**.
2. Create a Demo/Test or Live/Production key.
3. Select both **AI chat** (`ai:chat`) and **List models** (`ai:models`) permissions.
4. Copy the generated key immediately. BALMZ AI stores only its hash and cannot reveal it again.
5. Store the key in the other application's server-side secret manager.

A key can be revoked from the same API Keys page. Revocation is enforced on the next request. Never put a production key into public frontend code, a mobile app bundle, a public repository, or a prompt.

## Quick test with curl

List models:

```bash
curl https://balmz-ai.onrender.com/v1/models \
  -H "Authorization: Bearer $BALMZ_API_KEY"
```

Send a message:

```bash
curl https://balmz-ai.onrender.com/v1/chat/completions \
  -H "Authorization: Bearer $BALMZ_API_KEY" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: test-request-001" \
  -d '{
    "model": "balmz-fast",
    "messages": [
      {"role": "system", "content": "Answer clearly and concisely."},
      {"role": "user", "content": "Hello from my application."}
    ]
  }'
```

## OpenAI SDK example

Install the OpenAI client library in your application's server environment, then point it at BALMZ AI:

```python
import os
from openai import OpenAI

client = OpenAI(
    base_url="https://balmz-ai.onrender.com/v1",
    api_key=os.environ["BALMZ_API_KEY"],
)

response = client.chat.completions.create(
    model="balmz-fast",
    messages=[
        {"role": "user", "content": "Give me a concise project summary."}
    ],
)

print(response.choices[0].message.content)
```

Use `stream=True` when an application requires Server-Sent Events. The current compatibility layer returns the generated answer in SSE framing after the model has completed generation; it does not yet forward Gemini tokens incrementally.

## Supported compatibility surface

- `GET /v1/models`
- `POST /v1/chat/completions`
- Standard Bearer API-key authentication
- System, developer, user and assistant text messages
- Multi-turn text context (up to 20 messages)
- Non-streaming JSON and SSE-formatted streaming responses
- Standard OpenAI-style error objects
- `Idempotency-Key` to prevent duplicate usage metering on retried requests (the completion itself is not replay-cached)

The initial API does not yet implement the OpenAI Responses API, tool/function calling, image inputs, audio, embeddings, fine-tuning, or provider-specific Gemini endpoints. Applications must support custom OpenAI-compatible Chat Completions settings; an application that only accepts its own first-party provider credentials cannot be pointed at BALMZ AI directly.

## Usage, ownership and environment

Each request is authenticated against the issued key's hash, status, expiry and scopes. AI chat requests are charged to the BALMZ AI account that created the key and consume that account's `ai_messages` allowance. Missing or exhausted allowance is returned as an OpenAI-style rate-limit error. Demo and Live keys remain separate records; both use the configured BALMZ AI model service and the key owner's account allowance.

BALMZ AI keeps the Gemini credential on the private Render backend. Calling applications receive only BALMZ AI completions; they never receive the upstream Gemini key.
