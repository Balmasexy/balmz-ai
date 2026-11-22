# Shared Cloudflare R2 storage

## Workspace architecture

The Deployment Workplace uses one private Cloudflare R2 bucket shared by the BALMZ AI admin control plane for all Render-managed projects. It is not a bucket or credential configured separately on every Render service.

- Project uploads use `projects/<repository-slug>/` namespaces.
- The Deployment Workplace derives the initial namespace list from repositories returned by the connected Render account.
- Multiple Render services using the same repository are grouped into the same repository namespace.
- The legacy Super Admin archive remains under `admin/`; it is not moved or deleted by the workspace storage manager.
- Project namespaces are organizational separation for Super Admin file management. They are not yet per-service runtime credentials or an authorization boundary for applications running in other Render services.
- Render deployment logs and build artifacts are not automatically exported. A separate retention/export workflow is required.

The workspace storage manager lists up to 1,000 objects under `projects/` per refresh and reports the returned object count and actual listed bytes. It does not fabricate total bucket capacity or usage.

## Configure Cloudflare R2

1. Create a **private** bucket in Cloudflare Dashboard → Storage & databases → R2.
2. Create an R2 API token with **Object Read & Write**, scoped to this bucket only.
3. Add these server-side environment variables to the BALMZ AI Render web service, which hosts the admin control plane:
   - `R2_ACCOUNT_ID`
   - `R2_ACCESS_KEY_ID`
   - `R2_SECRET_ACCESS_KEY`
   - `R2_BUCKET_NAME`
4. Save the Render environment changes and wait for the service restart to finish.
5. Configure bucket CORS to allow origin `https://balmz-ai.onrender.com`, method `PUT`, and header `Content-Type`. Keep anonymous public access disabled.

The admin control plane creates short-lived object-specific signed URLs. R2 credentials remain server-side and are not sent to the browser or individual project services.

## Existing Super Admin archive

The separate **Admin → File storage** page continues to manage the legacy `admin/` prefix. Its files are preserved. The Deployment Workplace manages project uploads under `projects/`.

## Safety

- Do not commit R2 keys or paste them into chat.
- Keep the bucket private and use a bucket-scoped API token.
- Do not store provider API keys, Render API keys, or user authentication secrets in the archive.
- Deletion from the project manager is permanent.
