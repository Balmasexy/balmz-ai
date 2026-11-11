# Deployment workplace

The authenticated Super Admin deployment workplace is available at `/dashboard/deployments`.

## Render integration

The workspace lists up to 50 services accessible to the configured Render API key, shows the most recent deployment for each service, and can trigger a build-and-deploy for a selected connected service. It can optionally clear the build cache when the administrator explicitly selects that option.

Configure the following server-side secret on the BALMZ AI Render web service:

- `RENDER_API_KEY`: a Render API key with access only to the intended workspace/resources where scoped keys are available.

The API key is never sent to the browser and is never stored in browser local storage. The deployment API requires a valid Better Auth session and a database-confirmed Super Admin role. Before starting a deployment, the server verifies that the selected service ID is returned by the connected Render account.

## Cost and safety

- The UI itself does not charge a fee.
- Hosting plans, build minutes, storage, bandwidth, and provider usage may incur charges or be subject to free-tier quotas.
- A deployment request starts a real provider build; it is not a simulation.
- Cache clearing is opt-in per deployment.
- This release does not create, delete, suspend, resize, or change environment variables on hosting services.
- No Render API key should be placed in frontend code, a chat prompt, or a Git commit.

## Current scope

Render connected-service listing and deployment trigger are implemented. Vercel, GitHub Actions custom pipelines, repository import/create, build log streaming, rollback, custom domains, and project environment editing are not yet implemented in this screen.
