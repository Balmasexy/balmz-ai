# Super Admin storage

The Super Admin file archive is available from /admin → **File storage**.

## Storage architecture

BALMZ AI uses a private Cloudflare R2 bucket for shared administrator files and deployment archives. This is separate from the Render service filesystem.

- Render's normal application filesystem is not a durable archive.
- A Render persistent disk is local to one Render service and cannot be used by build commands. It also restricts the service to one instance and disables zero-downtime deployment.
- Cloudflare R2 stores objects outside Render, so a service rebuild or restart does not erase the archive.

The current BALMZ AI Neon project is in aws-eu-west-2, where Neon Object Storage is not available. Do not create a replacement Neon database solely to enable file storage; this integration uses a separate R2 bucket instead.

## Configure Cloudflare R2

1. Create a **private** bucket in Cloudflare Dashboard → Storage & databases → R2.
2. Create an R2 API token with **Object Read & Write**, scoped to this bucket only.
3. Add the following server-side environment variables to the BALMZ AI Render web service:
   - R2_ACCOUNT_ID
   - R2_ACCESS_KEY_ID
   - R2_SECRET_ACCESS_KEY
   - R2_BUCKET_NAME
4. Save the Render environment changes and wait for the service restart to finish.
5. Configure the bucket CORS rules to allow origin https://balmz-ai.onrender.com, method PUT, and header Content-Type. Keep anonymous public access disabled.

The app creates a short-lived, object-specific signed URL for each upload or download. The R2 credentials remain server-side. Stored object keys are restricted to the admin/ prefix.

## Current interface

The page reports actual listed file count and bytes returned by R2. It does not show a fabricated quota, total capacity, or usage percentage. The listing reads up to 1,000 objects per refresh; the response reports when additional objects exist.

The current implementation supports file upload, download and delete. It does not automatically archive Render build logs or deploy artifacts yet; those need an explicit export/retention workflow.

## Cost and limits

R2 Standard currently includes 10 GB-month of storage, 1 million Class A operations, and 10 million Class B operations per month. Beyond the included amounts, Standard storage is currently listed at $0.015 per GB-month, Class A at $4.50 per million operations, and Class B at $0.36 per million operations. Internet egress is free. Confirm the provider's current pricing before large-scale use.

## Safety

- Do not commit R2 keys or paste them into a chat.
- Use a private bucket and a bucket-scoped API token.
- Do not store provider API keys, Render API keys or user authentication secrets in the archive.
- File deletion is permanent from this application view.
