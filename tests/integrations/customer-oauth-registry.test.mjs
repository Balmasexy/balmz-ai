import test from "node:test";
import assert from "node:assert/strict";

const registry = await import("../../lib/integrations/customer-oauth-registry.js").catch(() => null);

test("customer OAuth registry covers the approved account providers", () => {
  assert.ok(registry, "customer OAuth registry module is not implemented");
  const expected = ["google", "microsoft", "slack", "dropbox", "box", "github", "gitlab", "notion"];
  for (const id of expected) {
    const provider = registry.getCustomerOAuthProvider(id);
    assert.ok(provider, "missing OAuth provider " + id);
    assert.ok(provider.authorizationUrl && provider.tokenUrl && provider.userInfoUrl, id + " OAuth endpoints incomplete");
    assert.ok(Array.isArray(provider.scopes) && provider.scopes.length > 0, id + " scopes missing");
  }
});

test("OAuth status reports configured flags without returning credentials", () => {
  assert.ok(registry, "customer OAuth registry module is not implemented");
  const status = registry.getCustomerOAuthProviderStatus({
    GOOGLE_OAUTH_CLIENT_ID: "google-client",
    GOOGLE_OAUTH_CLIENT_SECRET: "google-secret",
  });
  const google = status.find((item) => item.id === "google");
  assert.equal(google.configured, true);
  assert.equal(google.clientId, undefined);
  assert.equal(google.clientSecret, undefined);
  assert.equal(status.find((item) => item.id === "microsoft").configured, false);
});

test("authorization URL binds provider, state, PKCE and callback URI", () => {
  assert.ok(registry, "customer OAuth registry module is not implemented");
  const url = new URL(registry.buildCustomerOAuthAuthorizationUrl("google", {
    state: "random-state-value",
    codeChallenge: "pkce-challenge",
    baseUrl: "https://balmz-ai.onrender.com",
    clientId: "google-client",
  }));
  assert.equal(url.searchParams.get("state"), "random-state-value");
  assert.equal(url.searchParams.get("code_challenge"), "pkce-challenge");
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
  assert.equal(url.searchParams.get("redirect_uri"), "https://balmz-ai.onrender.com/api/integrations/google/callback");
  assert.equal(url.searchParams.get("client_id"), "google-client");
});
