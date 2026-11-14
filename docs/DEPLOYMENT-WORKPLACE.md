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


## Deployment URLs and custom domains

The Domains tab reads the selected service's public URL from Render and lists its custom domains using the Render Custom Domains API. Administrators can add a domain to a web service or static site. Adding a domain in Render does not change DNS: configure the exact DNS records shown in the Render service settings, then refresh until the domain reports verified. Render continues to provide the original onrender.com URL unless its service subdomain policy is separately changed.

The app does not invent preview URLs. A service URL is displayed only when Render returns it for that service.

## Neon Postgres integration

The Neon tab reuses the tested, encrypted Neon connection saved under Super Admin → Service connectors. It lists the connected account's projects, branches, databases and roles. When a Super Admin selects a target, the server:

1. Confirms that the selected Render service and Neon resources belong to the connected accounts.
2. Requests a pooled connection URI from the Neon Management API. The URI is never returned to the browser or written to logs.
3. Tests the database connection with SELECT 1.
4. Updates only the selected Render service's DATABASE_URL using Render's single-variable endpoint.

The operation preserves all other service environment variables. If DATABASE_URL already exists, the UI requires a separate explicit replacement checkbox and confirmation. The operation does not automatically deploy the service; use Deploy latest after checking the selected project, branch and role. Use a restricted runtime role, not an owner role, for production traffic.

The target Render environment must have the appropriate permissions to update service environment variables. The Render API's single-variable operation does not replace the complete environment-variable list.

## Secret handling and limits

Neon API credentials remain encrypted in balmz_service_credentials or server environment variables. Neon database URIs are resolved and tested server-side. The browser sees resource names and non-secret connection status only. This workflow does not create Neon projects, branches, databases or roles and does not reset any database password.
