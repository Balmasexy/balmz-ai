const OPENAI_RESPONSE_TOOL_TYPES = {
  web_search: { type: "web_search" },
  code_interpreter: { type: "code_interpreter", container: { type: "auto" } },
  image_generation: { type: "image_generation" },
};

const OPENAI_LABELS = {
  web_search: "Web search",
  file_search: "File search",
  code_interpreter: "Code Interpreter",
  image_generation: "Image generation",
  computer_use: "Computer use",
  shell: "Shell execution",
  remote_mcp: "Remote MCP",
};

const GEMINI_LABELS = {
  google_search: "Google Search",
  google_maps: "Google Maps",
  url_context: "URL context",
  code_execution: "Python code execution",
  file_search: "Gemini File Search",
  computer_use: "Computer use",
  function_calling: "Function calling",
};

function supportsGeminiCore(model) {
  return /^gemini-(?:2\.5|3)(?:[.-]|$)/i.test(model);
}

export function buildOpenAIResponseTools(requested, vectorStoreIds = []) {
  if (!Array.isArray(requested)) return [];
  const tools = [];
  for (const id of new Set(requested)) {
    if (Object.prototype.hasOwnProperty.call(OPENAI_RESPONSE_TOOL_TYPES, id)) {
      tools.push(OPENAI_RESPONSE_TOOL_TYPES[id]);
    } else if (id === "file_search" && Array.isArray(vectorStoreIds) && vectorStoreIds.length > 0) {
      tools.push({ type: "file_search", vector_store_ids: vectorStoreIds.slice(0, 5) });
    }
  }
  return tools;
}

export function buildGeminiTools(model, requested) {
  if (!supportsGeminiCore(model) || !Array.isArray(requested)) return [];
  const tools = [];
  const selected = new Set(requested);
  if (selected.has("google_search")) tools.push({ google_search: {} });
  if (selected.has("url_context")) tools.push({ url_context: {} });
  if (selected.has("code_execution")) tools.push({ code_execution: {} });
  if (selected.has("google_maps") && /^gemini-3\.5(?:[.-]|$)/i.test(model)) {
    tools.push({ google_maps: {} });
  }
  return tools;
}

export function getProviderToolCapabilities(provider, model, vectorStoreIds = []) {
  if (provider === "openai") {
    const validModel = typeof model === "string" && /^gpt-/i.test(model);
    return [
      { id: "web_search", label: OPENAI_LABELS.web_search, available: validModel, reason: validModel ? null : "Select a supported GPT model connected through the Responses API." },
      { id: "file_search", label: OPENAI_LABELS.file_search, available: validModel && vectorStoreIds.length > 0, reason: vectorStoreIds.length ? null : "Upload and index your private files before using file search." },
      { id: "code_interpreter", label: OPENAI_LABELS.code_interpreter, available: validModel, reason: validModel ? null : "Select a supported GPT model." },
      { id: "image_generation", label: OPENAI_LABELS.image_generation, available: validModel, reason: validModel ? null : "Select a supported GPT model." },
      { id: "computer_use", label: OPENAI_LABELS.computer_use, available: false, reason: "Requires a separately isolated computer-use runtime and human control layer." },
      { id: "shell", label: OPENAI_LABELS.shell, available: false, reason: "Arbitrary shell execution is disabled until an isolated sandbox is deployed." },
      { id: "remote_mcp", label: OPENAI_LABELS.remote_mcp, available: false, reason: "Use the customer-owned MCP tool workspace; provider-mediated MCP forwarding is not enabled." },
    ];
  }
  if (provider === "google") {
    const core = supportsGeminiCore(model);
    const maps = /^gemini-3\.5(?:[.-]|$)/i.test(model);
    return [
      { id: "google_search", label: GEMINI_LABELS.google_search, available: core, reason: core ? null : "Requires a Gemini 2.5 or Gemini 3 model with Google Search support." },
      { id: "google_maps", label: GEMINI_LABELS.google_maps, available: maps, reason: maps ? null : "Google Maps grounding is limited to supported Gemini 3.5 models." },
      { id: "url_context", label: GEMINI_LABELS.url_context, available: core, reason: core ? null : "Requires a supported Gemini 2.5 or Gemini 3 model." },
      { id: "code_execution", label: GEMINI_LABELS.code_execution, available: core, reason: core ? null : "Requires a supported Gemini 2.5 or Gemini 3 model." },
      { id: "file_search", label: GEMINI_LABELS.file_search, available: false, reason: "Create a private Gemini File Search store and bind it to your account first." },
      { id: "computer_use", label: GEMINI_LABELS.computer_use, available: false, reason: "Requires a separately isolated computer-use runtime and human control layer." },
      { id: "function_calling", label: GEMINI_LABELS.function_calling, available: false, reason: "Custom function execution requires a registered server-side handler and approval contract." },
    ];
  }
  return [];
}
