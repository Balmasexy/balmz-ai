"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { SignOutButton } from "@/app/components/sign-out-button";
import { QuickChatHelper } from "@/app/components/quick-chat-helper";
import { copyNativeText, getNetworkState, hapticTap, isNativeApp, listenToNetworkChanges, saveTextExport, shareNativeContent, showNativeToast } from "@/lib/capacitor/native-helpers";

type ImageAttachment = {
  id: string;
  name: string;
  mimeType: "image/jpeg";
  dataBase64: string;
  previewUrl: string;
};
type Message = { id: string; role: "user" | "assistant"; content: string; createdAt: string; images?: ImageAttachment[]; hasAttachments?: boolean; status?: "queued" | "completed" | "failed"; requestId?: string | null; model?: string | null };
type Conversation = { id: string; title: string; updatedAt: string; messages: Message[] };
type PendingChatMessage = { conversationId: string; messageId: string; model: string; requestId: string };
type ModelOption = { value: string; label: string; provider: string; modelId: string };

const STORAGE_KEY = "balmz-ai-client-workplace-v1";
const NEW_CHAT_AFTER_AUTH_KEY = "balmz-ai-open-new-chat-after-auth";
async function prepareImageFile(file: File): Promise<ImageAttachment> {
  if (!file.type.startsWith("image/")) throw new Error(file.name + " is not an image.");
  if (file.size > 15_000_000) throw new Error(file.name + " is too large. Choose an image under 15 MB.");
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1280 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext("2d");
  if (!context) { bitmap.close(); throw new Error("This browser could not prepare the image."); }
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((value) => value ? resolve(value) : reject(new Error("Image compression failed.")), "image/jpeg", 0.72);
  });
  if (blob.size > 1_900_000) throw new Error(file.name + " is still too large after compression. Choose a smaller image.");
  const previewUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("Image could not be read."));
    reader.onerror = () => reject(new Error("Image could not be read."));
    reader.readAsDataURL(blob);
  });
  const dataBase64 = previewUrl.split(",")[1];
  if (!dataBase64) throw new Error("Image encoding failed.");
  return { id: crypto.randomUUID(), name: file.name.slice(0, 160), mimeType: "image/jpeg", dataBase64, previewUrl };
}

const starterPrompts = [
  { title: "Write something", detail: "Draft an email, proposal or post", prompt: "Help me draft a clear, professional email about " },
  { title: "Learn something", detail: "Explain a topic step by step", prompt: "Explain this topic step by step, with practical examples: " },
  { title: "Build something", detail: "Plan or debug a project", prompt: "Help me plan and build this project: " },
  { title: "Explore an idea", detail: "Research options and trade-offs", prompt: "Help me explore this idea, including options and trade-offs: " },
];

function makeConversation(): Conversation {
  return { id: crypto.randomUUID(), title: "New chat", updatedAt: new Date().toISOString(), messages: [] };
}

function shortTitle(value: string): string {
  const cleaned = value.replace(/\s+/g, " ").trim();
  return cleaned.length > 42 ? cleaned.slice(0, 39) + "…" : cleaned || "New chat";
}

function Icon({ name }: { name: "new" | "search" | "chat" | "code" | "book" | "close" | "send" | "menu" | "copy" }) {
  const paths: Record<string, string> = {
    new: "M12 5v14m-7-7h14",
    search: "m21 21-4.3-4.3M10.8 18a7.2 7.2 0 1 1 0-14.4 7.2 7.2 0 0 1 0 14.4Z",
    chat: "M20 11.5a7.5 7.5 0 0 1-7.5 7.5H6l-3 2v-5.5A7.5 7.5 0 1 1 20 11.5Z",
    code: "m8 8-4 4 4 4m8-8 4 4-4 4m-3-10-2 12",
    book: "M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21V5.5Zm0 0V21",
    close: "M18 6 6 18M6 6l12 12",
    send: "M22 2 11 13m11-11-7 20-4-9-9-4 20-7Z",
    menu: "M4 6h16M4 12h16M4 18h16",
    copy: "M8 8h12v12H8zM4 16V4h12",
  };
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px]"><path d={paths[name]} /></svg>;
}

export function ClientWorkplace({ userName, userEmail, isAdmin, planName }: { userName: string; userEmail: string; isAdmin: boolean; planName: string | null }) {
  const conversationStorageKey = `${STORAGE_KEY}:${encodeURIComponent(userEmail.trim().toLowerCase())}`;
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState("");
  const [prompt, setPrompt] = useState("");
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [queueBlocked, setQueueBlocked] = useState(false);
  const [networkConnected, setNetworkConnected] = useState(true);
  const [notice, setNotice] = useState("");
  const [mobileSidebar, setMobileSidebar] = useState(false);
  const [copied, setCopied] = useState("");
  const [model, setModel] = useState("");
  const [modelOptions, setModelOptions] = useState<ModelOption[]>([]);
  const [modelsLoading, setModelsLoading] = useState(true);
  const [modelsMessage, setModelsMessage] = useState("");
  const [planCheck, setPlanCheck] = useState<"checking" | "active" | "inactive" | "unavailable">("checking");
  const [currentPlanName, setCurrentPlanName] = useState(planName);
  const [selectedImages, setSelectedImages] = useState<ImageAttachment[]>([]);
  const [imageBusy, setImageBusy] = useState(false);
  const [isDraggingImages, setIsDraggingImages] = useState(false);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [uploadMenuOpen, setUploadMenuOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const conversationMessagesRef = useRef<Map<string, Message[]>>(new Map());
  const pendingMessagesRef = useRef<PendingChatMessage[]>([]);
  const processingQueueRef = useRef(false);
  const queueBlockedRef = useRef(false);

  useEffect(() => {
    try {
      const scoped = localStorage.getItem(conversationStorageKey);
      const legacy = scoped ? null : localStorage.getItem(STORAGE_KEY);
      const raw = scoped ?? legacy;
      if (!scoped && legacy) {
        // Migrate existing browser chat history into the first signed-in account key.
        localStorage.setItem(conversationStorageKey, legacy);
        localStorage.removeItem(STORAGE_KEY);
      }
      const saved = raw ? JSON.parse(raw) as Conversation[] : [];
      const validSaved = Array.isArray(saved) ? saved : [];
      const url = new URL(window.location.href);
      const forceNewChat = localStorage.getItem(NEW_CHAT_AFTER_AUTH_KEY) === "1" || url.searchParams.get("new") === "1";
      if (forceNewChat) {
        const fresh = makeConversation();
        const restored = [fresh, ...validSaved.filter((item) => item && item.id !== fresh.id)];
        conversationMessagesRef.current = new Map(restored.map((item) => [item.id, item.messages]));
        setConversations(restored);
        setActiveId(fresh.id);
        localStorage.removeItem(NEW_CHAT_AFTER_AUTH_KEY);
        if (url.searchParams.has("new")) {
          url.searchParams.delete("new");
          window.history.replaceState({}, "", url.pathname + url.search + url.hash);
        }
      } else if (validSaved[0]?.id) {
        conversationMessagesRef.current = new Map(validSaved.map((item) => [item.id, item.messages]));
        setConversations(validSaved);
        setActiveId(validSaved[0].id);
      } else {
        const first = makeConversation();
        conversationMessagesRef.current = new Map([[first.id, []]]);
        setConversations([first]);
        setActiveId(first.id);
      }
    } catch {
      const first = makeConversation();
      conversationMessagesRef.current = new Map([[first.id, []]]);
      setConversations([first]);
      setActiveId(first.id);
    }
  }, []);

  useEffect(() => {
    if (conversations.length) {
      const textOnly = conversations.map((conversation) => ({
        ...conversation,
        messages: conversation.messages.map((message) => ({
          id: message.id, role: message.role, content: message.content, createdAt: message.createdAt,
        })),
      }));
      localStorage.setItem(conversationStorageKey, JSON.stringify(textOnly));
    }
  }, [conversations]);

  async function loadServerConversation(id: string) {
    const response = await fetch("/api/ai/conversations/" + encodeURIComponent(id), { cache: "no-store" });
    if (!response.ok) throw new Error("This saved conversation could not be loaded.");
    const result = await response.json() as {
      conversation?: { id: string; title: string; updated_at?: string; updatedAt?: string };
      messages?: Array<{ id: string; role: "user" | "assistant"; content: string; createdAt: string; hasAttachments?: boolean; status?: "queued" | "completed" | "failed"; requestId?: string | null; model?: string | null }>;
    };
    const messages: Message[] = Array.isArray(result.messages) ? result.messages.map((message) => ({
      id: message.id,
      role: message.role,
      content: message.content,
      createdAt: message.createdAt,
      hasAttachments: message.hasAttachments === true,
      status: message.status,
      requestId: message.requestId ?? null,
      model: message.model ?? null,
    })) : [];
    conversationMessagesRef.current.set(id, messages);

    const now = Date.now();
    let recoveredTextTurns = 0;
    for (const message of messages) {
      if (message.role !== "user" || message.status !== "queued" ||
          now - new Date(message.createdAt).getTime() < 120_000) continue;
      if (message.hasAttachments) {
        const response = await fetch("/api/ai/conversations/" + encodeURIComponent(id), {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "fail-unrecoverable-attachment", messageId: message.id }),
        });
        if (response.ok) message.status = "failed";
        continue;
      }
      if (!message.requestId || !message.model) continue;
      if (pendingMessagesRef.current.some((pending) => pending.messageId === message.id)) continue;
      pendingMessagesRef.current.push({
        conversationId: id,
        messageId: message.id,
        model: message.model,
        requestId: message.requestId,
      });
      recoveredTextTurns += 1;
    }
    setConversations((current) => {
      const existing = current.find((item) => item.id === id);
      const title = result.conversation?.title || existing?.title || "New chat";
      const updatedAt = result.conversation?.updatedAt || result.conversation?.updated_at || existing?.updatedAt || new Date().toISOString();
      const item: Conversation = { id, title, updatedAt, messages };
      return [item, ...current.filter((entry) => entry.id !== id)].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
    });
    if (recoveredTextTurns > 0) {
      setNotice(recoveredTextTurns === 1
        ? "Recovered a queued text message from your saved chat. Resuming it now."
        : `Recovered ${recoveredTextTurns} queued text messages from your saved chat. Resuming them now.`);
      void processPendingMessages();
    }
  }

  useEffect(() => {
    let cancelled = false;
    async function syncHistory() {
      try {
        const raw = localStorage.getItem(conversationStorageKey);
        const local = raw ? JSON.parse(raw) as Conversation[] : [];
        const localItems = Array.isArray(local) ? local.filter((item) => item && typeof item.id === "string" && Array.isArray(item.messages)) : [];
        if (localItems.length) {
          const safeImport = localItems.map((conversation) => ({
            ...conversation,
            messages: conversation.messages.map((message) => ({
              id: message.id,
              role: message.role,
              content: message.content,
              createdAt: message.createdAt,
              hasAttachments: Boolean(message.hasAttachments || message.images?.length),
            })),
          }));
          await fetch("/api/ai/conversations", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ conversations: safeImport }),
          });
        }
        const response = await fetch("/api/ai/conversations", { cache: "no-store" });
        if (!response.ok) return;
        const result = await response.json() as { storage?: string; conversations?: Array<{ id: string; title: string; updatedAt: string }> };
        if (cancelled || result.storage !== "database" || !Array.isArray(result.conversations)) return;
        const remote = result.conversations;
        setConversations((current) => {
          const localById = new Map(current.map((item) => [item.id, item]));
          const merged = remote.map((item) => {
            const existing = localById.get(item.id);
            return existing
              ? { ...existing, title: item.title || existing.title, updatedAt: item.updatedAt || existing.updatedAt }
              : { id: item.id, title: item.title, updatedAt: item.updatedAt, messages: [] };
          });
          const remoteIds = new Set(remote.map((item) => item.id));
          return [...merged, ...current.filter((item) => !remoteIds.has(item.id))]
            .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
        });
        const selected = localItems[0]?.id && remote.some((item) => item.id === localItems[0].id)
          ? localItems[0].id
          : localItems.length
            ? null
            : remote[0]?.id ?? null;
        if (selected) {
          if (!localItems.some((item) => item.id === selected && item.messages.length)) {
            setActiveId(selected);
            await loadServerConversation(selected);
          } else if (remote.some((item) => item.id === selected)) {
            await loadServerConversation(selected);
          }
        }
      } catch {
        // Local, account-scoped history remains available when durable storage is offline.
      }
    }
    void syncHistory();
    return () => { cancelled = true; };
  }, []);



  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [activeId, conversations, busy]);

  useEffect(() => {
    let active = true;
    let removeListener: (() => Promise<void>) | undefined;
    void getNetworkState().then((state) => { if (active) setNetworkConnected(state.connected); }).catch(() => undefined);
    void listenToNetworkChanges((state) => { if (active) setNetworkConnected(state.connected); })
      .then((listener) => { if (active) removeListener = () => listener.remove(); else void listener.remove(); })
      .catch(() => undefined);
    return () => { active = false; if (removeListener) void removeListener(); };
  }, []);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/subscription", { cache: "no-store" })
      .then(async (response) => {
        const result = await response.json() as { active?: boolean; subscription?: { plan_name?: string } | null; message?: string };
        if (!response.ok) throw new Error(result.message || "Subscription check failed.");
        if (cancelled) return;
        setPlanCheck(result.active ? "active" : "inactive");
        setCurrentPlanName(result.subscription?.plan_name ?? null);
      })
      .catch(() => { if (!cancelled) setPlanCheck("unavailable"); });
    return () => { cancelled = true; };
  }, []);

  async function refreshModels() {
    setModelsLoading(true);
    try {
      const response = await fetch("/api/ai/models", { cache: "no-store" });
      const payload = await response.json() as { models?: ModelOption[]; message?: string };
      if (!response.ok || !Array.isArray(payload.models)) {
        throw new Error(payload.message || "AI model list could not be loaded.");
      }
      setModelOptions(payload.models);
      setModelsMessage(payload.message || "");
      setModel((current) => payload.models!.some((option) => option.value === current)
        ? current
        : payload.models![0]?.value ?? "");
    } catch (cause) {
      setModelOptions([]);
      setModel("");
      setModelsMessage(cause instanceof Error ? cause.message : "AI model list could not be loaded.");
    } finally {
      setModelsLoading(false);
    }
  }

  useEffect(() => {
    void refreshModels();
  }, []);

  useEffect(() => {
    if (!active?.id || busy) return;
    const queued = active.messages.filter((message) =>
      message.role === "user" && message.status === "queued" &&
      Date.now() - new Date(message.createdAt).getTime() < 120_000 &&
      !pendingMessagesRef.current.some((pending) => pending.messageId === message.id),
    );
    if (!queued.length) return;
    const nextRecoveryAt = Math.min(...queued.map((message) => new Date(message.createdAt).getTime() + 120_000));
    const delay = Math.max(1_000, nextRecoveryAt - Date.now());
    const timer = window.setTimeout(() => {
      void loadServerConversation(active.id).catch(() => undefined);
    }, delay);
    return () => window.clearTimeout(timer);
  }, [active?.id, active?.messages, busy]);

  const active = useMemo(() => conversations.find((item) => item.id === activeId) ?? null, [conversations, activeId]);
  const filtered = useMemo(() => conversations.filter((item) => item.title.toLowerCase().includes(query.toLowerCase())), [conversations, query]);

  function newChat() {
    const item = makeConversation();
    conversationMessagesRef.current.set(item.id, []);
    setConversations((current) => [item, ...current]);
    setActiveId(item.id);
    setPrompt("");
    setSelectedImages([]);
    setNotice("");
    setMobileSidebar(false);
    window.setTimeout(() => textareaRef.current?.focus(), 50);
  }

  function minimizeChat() {
    // Keep the active conversation in local storage and return to the page
    // that opened the workspace. This is not the same as starting a new chat.
    const referrer = document.referrer;
    if (referrer) {
      try {
        const previous = new URL(referrer);
        if (previous.origin === window.location.origin && previous.href !== window.location.href) {
          window.history.back();
          return;
        }
      } catch {
        // Fall through to the safe application landing page.
      }
    }
    window.location.assign("/");
  }

  function closeChat() {
    // Closing a chat leaves its saved history intact and opens a clean thread.
    newChat();
  }

  function updateMessages(id: string, messages: Message[]) {
    conversationMessagesRef.current.set(id, messages);
    setConversations((current) => current.map((item) => item.id === id ? {
      ...item,
      messages,
      title: item.messages.length ? item.title : shortTitle(messages.find((message) => message.role === "user")?.content ?? ""),
      updatedAt: new Date().toISOString(),
    } : item).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
  }

  async function handleImageSelection(files: FileList | File[]) {
    const chosen = Array.from(files);
    if (!chosen.length || imageBusy) return;
    const previousImageCount = active?.messages.reduce((total, message) => total + (message.images?.length ?? 0), 0) ?? 0;
    const available = Math.max(0, 4 - previousImageCount - selectedImages.length);
    if (!available) {
      setNotice("You can attach up to four images to a chat.");
      return;
    }
    if (chosen.length > available) setNotice("A chat can contain up to four images. Extra photos were skipped.");
    setImageBusy(true);
    try {
      const prepared: ImageAttachment[] = [];
      for (const file of chosen.slice(0, available)) prepared.push(await prepareImageFile(file));
      setSelectedImages((current) => [...current, ...prepared].slice(0, 4));
      setNotice("");
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : "An image could not be uploaded.");
    } finally {
      setImageBusy(false);
      if (galleryInputRef.current) galleryInputRef.current.value = "";
      if (cameraInputRef.current) cameraInputRef.current.value = "";
    }
  }

  function removeSelectedImage(id: string) {
    setSelectedImages((current) => current.filter((image) => image.id !== id));
  }

  const attachmentPreview = selectedImages.length ? (
    <div className="flex flex-wrap gap-2 px-2 pb-3" aria-label="Attached images">
      {selectedImages.map((image) => (
        <div key={image.id} className="relative h-[76px] w-[76px] overflow-hidden rounded-xl border border-white/10 bg-black/20">
          <img src={image.previewUrl} alt={image.name} className="h-full w-full object-cover" />
          <button type="button" onClick={() => removeSelectedImage(image.id)} aria-label={"Remove " + image.name} className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/75 text-white hover:bg-black">
            <Icon name="close" />
          </button>
        </div>
      ))}
    </div>
  ) : null;

  async function sendMessage(value = prompt) {
    const text = value.trim();
    const attachments = selectedImages;
    if (!text && !attachments.length) return;
    const messageText = text || "Please analyze the attached image(s).";
    if (planCheck !== "active") {
      setNotice(planCheck === "unavailable"
        ? "Your BALMZ AI plan could not be verified. No AI request was sent. Refresh the workspace and try again."
        : "An active BALMZ AI plan is required before sending AI requests. Choose a plan to continue.");
      return;
    }
    if (!model || !modelOptions.some((option) => option.value === model)) {
      setNotice(modelsMessage || "No AI model is connected yet. Ask the Super Admin to connect and test a provider in AI connections.");
      return;
    }

    let conversation = active;
    if (!conversation) {
      conversation = makeConversation();
      conversationMessagesRef.current.set(conversation.id, []);
      setConversations((current) => [conversation!, ...current]);
      setActiveId(conversation.id);
    }

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: messageText,
      createdAt: new Date().toISOString(),
      ...(attachments.length ? { images: attachments } : {}),
    };
    const next = [...conversation.messages, userMessage];
    updateMessages(conversation.id, next);
    pendingMessagesRef.current.push({
      conversationId: conversation.id,
      messageId: userMessage.id,
      model,
      requestId: crypto.randomUUID(),
    });
    setPrompt("");
    setSelectedImages([]);
    setNotice("");
    setMobileSidebar(false);
    void processPendingMessages();
  }

  async function processPendingMessages() {
    if (processingQueueRef.current || queueBlockedRef.current) return;
    processingQueueRef.current = true;
    setBusy(true);
    setQueueBlocked(false);
    try {
      while (pendingMessagesRef.current.length > 0) {
        const pending = pendingMessagesRef.current[0];
        if (!networkConnected) {
          queueBlockedRef.current = true;
          setQueueBlocked(true);
          setNotice("You appear to be offline. Your message is queued and will remain here until you reconnect and retry.");
          break;
        }

        const currentMessages = conversationMessagesRef.current.get(pending.conversationId) ?? [];
        const messageIndex = currentMessages.findIndex((message) => message.id === pending.messageId && message.role === "user");
        if (messageIndex < 0) {
          pendingMessagesRef.current.shift();
          continue;
        }

        const requestMessages = currentMessages.slice(0, messageIndex + 1).map((message) => ({
          role: message.role,
          content: message.content,
          ...(message.images?.length
            ? { images: message.images.map(({ mimeType, dataBase64 }) => ({ mimeType, dataBase64 })) }
            : {}),
        }));

        let response: Response;
        try {
          response = await fetch("/api/ai/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              messages: requestMessages,
              model: pending.model,
              requestId: pending.requestId,
              conversationId: pending.conversationId,
              userMessageId: pending.messageId,
            }),
          });
        } catch {
          queueBlockedRef.current = true;
          setQueueBlocked(true);
          setNotice("Could not reach BALMZ AI. Your message is safely queued; check your connection and retry.");
          break;
        }

        const payload = await response.json().catch(() => ({})) as { message?: string; error?: string; reply?: string };
        if (!response.ok || !payload.reply) {
          const message = payload.message || (response.status === 402
            ? "Your plan does not have an available ai_messages allowance."
            : response.status === 503
              ? "The selected AI provider is unavailable or not configured. Your message remains queued."
              : "The assistant could not complete this request. Your message remains queued.");
          queueBlockedRef.current = true;
          setQueueBlocked(true);
          setNotice(message);
          break;
        }

        const latestMessages = conversationMessagesRef.current.get(pending.conversationId) ?? [];
        const latestIndex = latestMessages.findIndex((message) => message.id === pending.messageId);
        if (latestIndex >= 0) {
          const assistantMessage: Message = {
            id: crypto.randomUUID(),
            role: "assistant",
            content: payload.reply,
            createdAt: new Date().toISOString(),
          };
          const updated = [
            ...latestMessages.slice(0, latestIndex + 1),
            assistantMessage,
            ...latestMessages.slice(latestIndex + 1),
          ];
          updateMessages(pending.conversationId, updated);
        }
        pendingMessagesRef.current.shift();
        setNotice("");
      }
    } finally {
      processingQueueRef.current = false;
      setBusy(false);
      if (pendingMessagesRef.current.length === 0) {
        queueBlockedRef.current = false;
        setQueueBlocked(false);
      }
    }
  }

  function retryQueuedMessages() {
    if (!pendingMessagesRef.current.length) {
      queueBlockedRef.current = false;
      setQueueBlocked(false);
      return;
    }
    if (!networkConnected) {
      setNotice("You are still offline. Reconnect before retrying queued messages.");
      return;
    }
    queueBlockedRef.current = false;
    setQueueBlocked(false);
    setNotice("");
    void processPendingMessages();
  }

  async function shareActiveConversation() {
    if (!active?.messages.length) return;
    const content = active.messages.map((message) =>
      (message.role === "user" ? "You" : "BALMZ AI") + "\n" + message.content,
    ).join("\n\n");
    try {
      await shareNativeContent({
        title: active.title || "BALMZ AI conversation",
        text: content.slice(0, 100_000),
        url: window.location.href,
      });
      void showNativeToast("Conversation ready to share.");
    } catch {
      setNotice("The conversation could not be shared from this device.");
    }
  }

  async function exportActiveConversation() {
    if (!active?.messages.length) return;
    const content = [
      "BALMZ AI conversation export",
      "Title: " + active.title,
      "Exported: " + new Date().toISOString(),
      "",
      ...active.messages.flatMap((message) => [
        (message.role === "user" ? "You" : "BALMZ AI") + " · " + message.createdAt,
        message.content,
        "",
      ]),
    ].join("\n");
    try {
      const safeTitle = (active.title || "conversation").replace(/[^a-zA-Z0-9_-]+/g, "-").slice(0, 48);
      const uri = await saveTextExport("balmz-" + safeTitle + ".txt", content);
      await shareNativeContent({ title: "Export BALMZ AI conversation", text: "Your BALMZ AI conversation export is ready.", url: uri });
      void showNativeToast("Conversation export prepared.");
    } catch {
      setNotice("The conversation export could not be prepared on this device.");
    }
  }

  async function copyMessage(message: Message) {
    try {
      await copyNativeText(message.content);
      setCopied(message.id);
      void hapticTap();
      void showNativeToast("Copied to clipboard.");
      window.setTimeout(() => setCopied(""), 1600);
    } catch { setNotice("Clipboard access is unavailable in this browser or device."); }
  }

  const hasMessages = Boolean(active?.messages.length);

  const attachmentPicker = (
    <div className="relative flex items-center gap-2">
      <button type="button" onClick={() => setUploadMenuOpen((open) => !open)} aria-label="Add photos" aria-haspopup="menu" aria-expanded={uploadMenuOpen} disabled={imageBusy || selectedImages.length + (active?.messages.reduce((total, message) => total + (message.images?.length ?? 0), 0) ?? 0) >= 4} className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-xl text-slate-200 transition hover:border-[var(--balmz-orange)]/50 hover:bg-white/[0.07] disabled:opacity-40">
        <span aria-hidden="true">+</span>
      </button>
      {uploadMenuOpen ? (
        <div role="menu" aria-label="Add to message" className="absolute bottom-12 left-0 z-50 w-56 rounded-2xl border border-white/10 bg-[#151f2e] p-2 shadow-2xl shadow-black/50">
          <button type="button" role="menuitem" onClick={() => { setUploadMenuOpen(false); galleryInputRef.current?.click(); }} className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-xs text-slate-200 transition hover:bg-white/[0.07]">
            <span className="text-lg text-[var(--balmz-orange)]">▧</span><span><span className="block font-semibold">Photos</span><span className="mt-0.5 block text-[10px] text-slate-500">Choose from your device</span></span>
          </button>
          <button type="button" role="menuitem" onClick={() => { setUploadMenuOpen(false); cameraInputRef.current?.click(); }} className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-xs text-slate-200 transition hover:bg-white/[0.07]">
            <span className="text-lg text-[var(--balmz-orange)]">◎</span><span><span className="block font-semibold">Take photo</span><span className="mt-0.5 block text-[10px] text-slate-500">Open your camera</span></span>
          </button>
        </div>
      ) : null}
    </div>
  );

  const uploadInputs = (
    <>
      <input ref={galleryInputRef} type="file" accept="image/*" multiple aria-label="Choose photos" className="sr-only" onChange={(event) => { if (event.target.files) void handleImageSelection(event.target.files); }} />
      <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" aria-label="Take a photo with your camera" className="sr-only" onChange={(event) => { if (event.target.files) void handleImageSelection(event.target.files); }} />
    </>
  );


  return (
    <main className="flex h-[100dvh] min-h-[560px] overflow-hidden bg-[#080c14] text-slate-100">
      {uploadInputs}
      {mobileSidebar ? <button aria-label="Close navigation" onClick={() => setMobileSidebar(false)} className="fixed inset-0 z-30 bg-black/60 lg:hidden" /> : null}
      <aside className={`fixed inset-y-0 left-0 z-40 flex w-[286px] shrink-0 flex-col border-r border-white/[0.08] bg-[#0b111c] transition-transform duration-200 lg:static lg:translate-x-0 ${mobileSidebar ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="flex h-[68px] items-center justify-between border-b border-white/[0.07] px-4">
          <Link href="/" className="flex items-center gap-3">
            <Image src="/balmz-logo.svg" alt="BALMZ AI logo" width={36} height={36} priority className="h-9 w-9 rounded-xl object-contain" />
            <span><span className="block text-sm font-bold tracking-[0.16em] text-white">BALMZ AI</span><span className="block text-[10px] text-slate-500">Your AI workplace</span></span>
          </Link>
          <button onClick={() => setMobileSidebar(false)} className="rounded-lg p-2 text-slate-400 hover:bg-white/5 lg:hidden" aria-label="Close sidebar"><Icon name="close" /></button>
        </div>
        <div className="p-3">
          <button onClick={newChat} className="flex w-full items-center gap-3 rounded-xl border border-white/10 bg-white/[0.045] px-3 py-3 text-sm font-medium text-slate-100 transition hover:border-[var(--balmz-orange)]/50 hover:bg-white/[0.07]">
            <span className="text-[var(--balmz-orange)]"><Icon name="new" /></span> New chat <span className="ml-auto text-[10px] text-slate-500">⌘ K</span>
          </button>
          <label className="mt-3 flex items-center gap-2 rounded-xl bg-white/[0.045] px-3 py-2.5 text-slate-500 focus-within:ring-1 focus-within:ring-[var(--balmz-orange)]">
            <Icon name="search" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search chats" className="min-w-0 flex-1 bg-transparent text-xs text-slate-200 outline-none placeholder:text-slate-600" />
          </label>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-4">
          <p className="px-2 pb-2 pt-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-600">Recent</p>
          {filtered.length ? <div className="space-y-1">{filtered.map((item) => <button key={item.id} onClick={() => {
            setActiveId(item.id); setPrompt(""); setSelectedImages([]); setUploadMenuOpen(false); setMobileSidebar(false); setNotice("");
            void loadServerConversation(item.id).catch(() => undefined);
          }} className={`flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-xs transition ${activeId === item.id ? "bg-[var(--balmz-orange)]/10 text-white" : "text-slate-400 hover:bg-white/[0.045] hover:text-slate-200"}`}><span className={activeId === item.id ? "text-[var(--balmz-orange)]" : "text-slate-600"}><Icon name="chat" /></span><span className="truncate">{item.title}</span></button>)}</div> : <p className="px-3 py-4 text-xs text-slate-600">No matching chats</p>}
          <p className="px-2 pb-2 pt-7 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-600">Explore</p>
          <div className="space-y-1">
            <Link href="/dashboard/plugins" className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-xs text-slate-400 hover:bg-white/[0.045]">⌘ Plugins and connectors</Link>
            <Link href="/dashboard/charts" className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-xs text-slate-400 hover:bg-white/[0.045]">▥ ChartGPT workspace</Link>
            <Link href="/dashboard/usage" className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-xs text-slate-400 hover:bg-white/[0.045]">▤ Usage and limits</Link>
            <Link href="/dashboard/billing" className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-xs text-slate-400 hover:bg-white/[0.045]">₦ Plans & billing</Link>
            {isAdmin ? <>
              <Link href="/dashboard/deployments" className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-xs text-slate-400 hover:bg-white/[0.045]"><Icon name="code" /> Deployment workplace</Link>
              <Link href="/admin?section=terminal" className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-xs text-slate-400 hover:bg-white/[0.045]">›_ Admin terminal</Link>
              <Link href="/admin" className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-xs text-slate-400 hover:bg-white/[0.045]">♙ Super Admin</Link>
            </> : null}
          </div>
        </div>
        <div className="border-t border-white/[0.07] p-3">
          <Link href="/dashboard/settings" className="mb-2 flex items-center gap-3 rounded-xl px-2 py-2 transition hover:bg-white/[0.045]">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--balmz-orange)]/15 text-sm font-semibold text-[var(--balmz-orange)]">{userName.trim().slice(0, 1).toUpperCase() || "U"}</span>
            <span className="min-w-0 flex-1"><span className="block truncate text-xs font-semibold text-slate-200">{userName}</span><span className="block truncate text-[10px] text-slate-500">{currentPlanName || "No active plan"} · Settings</span></span>
            <span className="text-slate-500">›</span>
          </Link>
          <div className="flex items-center justify-between px-2"><span className="truncate text-[10px] text-slate-600">{userEmail}</span><SignOutButton /></div>
        </div>
      </aside>

      <section className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-[68px] shrink-0 items-center justify-between border-b border-white/[0.07] px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <button onClick={() => setMobileSidebar(true)} className="rounded-lg p-2 text-slate-400 hover:bg-white/5 lg:hidden" aria-label="Open navigation"><Icon name="menu" /></button>
            <div><p className="text-sm font-semibold text-white">Chat</p><p className="hidden text-[10px] text-slate-500 sm:block">A focused space for your ideas and work</p></div>
          </div>
          <div className="flex items-center gap-1.5">
            {hasMessages ? <button type="button" onClick={() => void shareActiveConversation()} className="rounded-lg px-2 py-2 text-xs text-slate-400 transition hover:bg-white/5 hover:text-white">Share</button> : null}
            {hasMessages && isNativeApp() ? <button type="button" onClick={() => void exportActiveConversation()} className="rounded-lg px-2 py-2 text-xs text-slate-400 transition hover:bg-white/5 hover:text-white">Export</button> : null}
            <Link href="/dashboard/plugins" className="hidden rounded-lg px-2 py-2 text-xs text-slate-400 transition hover:bg-white/5 hover:text-white sm:inline-flex">Plugins</Link>
            <label className="flex min-w-0 items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.025] px-2.5 py-1.5 text-[10px] text-slate-500">Model <select aria-label="Choose AI model" disabled={modelsLoading || !modelOptions.length} value={model} onChange={(event) => setModel(event.target.value)} className="max-w-[150px] bg-transparent text-xs font-medium text-slate-200 outline-none disabled:opacity-60">{modelOptions.length ? modelOptions.map((option) => <option key={option.value} value={option.value}>{option.provider} · {option.label}</option>) : <option value="">{modelsLoading ? "Loading models…" : "No connected models"}</option>}</select></label>
            <button type="button" onClick={() => void refreshModels()} disabled={modelsLoading} className="hidden rounded-lg border border-white/[0.08] px-2.5 py-2 text-[10px] font-medium text-slate-400 hover:border-[var(--balmz-orange)]/40 hover:text-white disabled:opacity-40 sm:inline-flex">{modelsLoading ? "Loading…" : "Refresh models"}</button>
            {!modelsLoading && !modelOptions.length ? <Link href={isAdmin ? "/admin?section=ai-connections" : "/dashboard/plugins"} className="hidden rounded-lg bg-[var(--balmz-orange)]/[0.09] px-2.5 py-2 text-[10px] font-semibold text-[var(--balmz-orange)] hover:bg-[var(--balmz-orange)]/[0.15] sm:inline-flex">{isAdmin ? "Connect provider" : "Provider setup"}</Link> : null}
            <Link href="/dashboard/settings" aria-label="Open profile settings" className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--balmz-orange)]/15 text-xs font-bold text-[var(--balmz-orange)]">{userName.trim().slice(0, 1).toUpperCase() || "B"}</Link>
          </div>
        </header>

        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          {planCheck !== "active" && planCheck !== "checking" ? <div className="mx-auto mt-4 flex w-[calc(100%-2rem)] max-w-3xl flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--balmz-orange)]/20 bg-[var(--balmz-orange)]/[0.07] px-4 py-3">
            <p className="text-xs leading-5 text-slate-200">{planCheck === "unavailable" ? "We could not verify your plan. AI requests are paused until your plan status can be checked." : "An active BALMZ AI plan is required before sending AI requests."}</p>
            <Link href="/dashboard/billing" className="shrink-0 rounded-lg bg-[var(--balmz-orange)] px-3 py-2 text-[10px] font-semibold text-[#17100a]">View plans</Link>
          </div> : null}
          {!modelsLoading && !modelOptions.length ? <div className="mx-auto mt-4 flex w-[calc(100%-2rem)] max-w-3xl flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--balmz-orange)]/20 bg-[var(--balmz-orange)]/[0.07] px-4 py-3">
            <div><p className="text-xs font-semibold text-slate-200">No chat model is connected</p><p className="mt-1 text-[10px] leading-5 text-slate-500">{modelsMessage || "A Super Admin must connect and test an AI provider before chat can start."}</p></div>
            {isAdmin ? <Link href="/admin?section=ai-connections" className="shrink-0 rounded-lg bg-[var(--balmz-orange)] px-3 py-2 text-[10px] font-semibold text-[#17100a]">Connect a provider</Link> : <span className="text-[10px] text-slate-500">Ask your administrator to configure a provider</span>}
          </div> : null}
          {!hasMessages ? <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col justify-center px-4 py-10 sm:px-8">
            <div className="mx-auto mb-8 max-w-2xl text-center">
              <Image src="/balmz-logo.svg" alt="BALMZ AI logo" width={48} height={48} className="mx-auto mb-5 h-12 w-12 rounded-2xl object-contain shadow-[0_0_38px_rgba(249,115,22,0.18)]" />
              <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">What can I help you with?</h1>
              <p className="mt-3 text-sm leading-6 text-slate-500">Ask a question, develop an idea, or continue your work.</p>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {starterPrompts.map((item) => <button key={item.title} onClick={() => { setPrompt(item.prompt); textareaRef.current?.focus(); }} className="rounded-2xl border border-white/[0.08] bg-white/[0.025] p-4 text-left transition hover:border-[var(--balmz-orange)]/35 hover:bg-white/[0.045]"><span className="block text-sm font-medium text-slate-200">{item.title}</span><span className="mt-1 block text-xs text-slate-500">{item.detail}</span></button>)}
            </div>
            <div onDragOver={(event) => { event.preventDefault(); setIsDraggingImages(true); }} onDragLeave={() => setIsDraggingImages(false)} onDrop={(event) => { event.preventDefault(); setIsDraggingImages(false); if (event.dataTransfer.files.length) void handleImageSelection(event.dataTransfer.files); }} className={`mt-6 rounded-2xl border bg-[#0d1420] p-3 shadow-2xl shadow-black/20 transition ${isDraggingImages ? "border-[var(--balmz-orange)] bg-[var(--balmz-orange)]/[0.05]" : "border-white/[0.08]"}`}>
              {attachmentPreview}
              <textarea ref={textareaRef} value={prompt} onChange={(event) => setPrompt(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void sendMessage(); } }} rows={3} placeholder="Message BALMZ AI…" className="max-h-44 min-h-[72px] w-full resize-y bg-transparent px-2 py-2 text-sm leading-6 text-white outline-none placeholder:text-slate-600" />
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.06] pt-3">
                <div className="flex items-center gap-2">{attachmentPicker}<span className="text-[10px] text-slate-600">Drop images here · Up to 4 photos · Vision support depends on the selected model</span></div>
                <div className="flex items-center gap-3"><span className="text-[10px] text-slate-600">Enter to send · Shift + Enter for a new line</span>
                <button onClick={() => void sendMessage()} disabled={(!prompt.trim() && !selectedImages.length) || imageBusy || planCheck !== "active" || !model} className="flex h-9 items-center gap-2 rounded-xl bg-[var(--balmz-orange)] px-4 text-xs font-semibold text-[#17100a] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"><Icon name="send" /> Send</button></div>
              </div>
            </div>
            <div className="mt-4 flex flex-col items-center gap-2 text-center">
              {planCheck === "checking" ? <p className="text-[10px] text-slate-500">Checking your BALMZ AI plan…</p>
                : planCheck === "active" ? <p className="text-[10px] text-slate-500">Plan active · {currentPlanName || planName || "BALMZ AI"} · message allowance verified before each request.</p>
                : <><p className="text-xs text-slate-400">{planCheck === "unavailable" ? "Your plan status could not be checked. AI requests are paused until verification succeeds." : "An active BALMZ AI plan is required before sending AI requests."}</p><Link href="/dashboard/billing" className="rounded-xl border border-[var(--balmz-orange)]/30 bg-[var(--balmz-orange)]/[0.08] px-4 py-2 text-xs font-semibold text-[var(--balmz-orange)]">View plans and activate access</Link></>}
            </div>
          </div> : <div className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 sm:px-8">
            <div className="space-y-8">{active?.messages.map((message) => <article key={message.id} className={message.role === "user" ? "flex justify-end" : "flex gap-3"}>
              {message.role === "assistant" ? <Image src="/balmz-logo.svg" alt="BALMZ AI" width={32} height={32} className="h-8 w-8 shrink-0 rounded-xl object-contain" /> : null}
              <div className={message.role === "user" ? "max-w-[88%] rounded-3xl bg-[#182232] px-5 py-3.5 text-sm leading-7 text-slate-100" : "min-w-0 flex-1 pt-1 text-sm leading-7 text-slate-200"}>
                <div className="whitespace-pre-wrap break-words">{message.content}</div>
                {message.images?.length ? <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">{message.images.map((image) => <img key={image.id} src={image.previewUrl} alt={image.name} className="max-h-52 w-full rounded-xl border border-white/10 object-cover" />)}</div> : null}
                {!message.images?.length && message.hasAttachments ? <p className="mt-2 text-[10px] leading-5 text-slate-500">Photo attachment was not retained in permanent chat history. Reattach the image to send it again.</p> : null}
                {message.role === "assistant" ? <button onClick={() => void copyMessage(message)} className="mt-3 inline-flex items-center gap-1.5 text-[10px] text-slate-600 hover:text-slate-300"><Icon name="copy" /> {copied === message.id ? "Copied" : "Copy"}</button> : null}
              </div>
            </article>)}
              {busy ? <div className="flex items-center gap-3 text-xs text-slate-500"><Image src="/balmz-logo.svg" alt="BALMZ AI" width={32} height={32} className="h-8 w-8 shrink-0 rounded-xl object-contain" /><span className="animate-pulse">BALMZ AI is thinking…</span></div> : null}
            </div>
            <div ref={bottomRef} />
          </div>}
          {notice ? <div role="alert" className="mx-auto mb-4 flex w-[calc(100%-2rem)] max-w-3xl flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-400/20 bg-amber-400/[0.07] px-4 py-3 text-xs leading-5 text-amber-100"><span>{notice}</span>{queueBlocked ? <button type="button" disabled={!networkConnected || busy} onClick={retryQueuedMessages} className="shrink-0 rounded-lg border border-amber-300/25 px-3 py-2 text-[10px] font-semibold text-amber-100 disabled:opacity-40">Retry queued messages</button> : null}</div> : null}
        </div>

        {hasMessages ? <div className="shrink-0 px-4 pb-4 sm:px-8 sm:pb-6">
          <div onDragOver={(event) => { event.preventDefault(); setIsDraggingImages(true); }} onDragLeave={() => setIsDraggingImages(false)} onDrop={(event) => { event.preventDefault(); setIsDraggingImages(false); if (event.dataTransfer.files.length) void handleImageSelection(event.dataTransfer.files); }} className={`mx-auto max-w-3xl rounded-2xl border bg-[#0d1420] p-3 shadow-2xl shadow-black/20 transition focus-within:border-[var(--balmz-orange)]/35 ${isDraggingImages ? "border-[var(--balmz-orange)] bg-[var(--balmz-orange)]/[0.05]" : "border-white/[0.09]"}`}>
            {attachmentPreview}
            <textarea ref={textareaRef} value={prompt} onChange={(event) => setPrompt(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void sendMessage(); } }} rows={2} placeholder="Message BALMZ AI…" className="max-h-40 min-h-[52px] w-full resize-y bg-transparent px-2 py-2 text-sm leading-6 text-white outline-none placeholder:text-slate-600" />
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.06] pt-2">
              <div className="flex items-center gap-2">{attachmentPicker}<span className="hidden text-[10px] text-slate-600 sm:inline">Add a photo or drop it here</span></div>
              <div className="flex items-center gap-3"><span className="hidden text-[10px] text-slate-600 sm:inline">Shift + Enter for a new line</span>
              <button onClick={() => void sendMessage()} disabled={(!prompt.trim() && !selectedImages.length) || busy || imageBusy || planCheck !== "active" || !model} className="flex h-9 items-center gap-2 rounded-xl bg-[var(--balmz-orange)] px-4 text-xs font-semibold text-[#17100a] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"><Icon name="send" /> Send</button></div>
            </div>
          </div>
        </div> : null}
      </section>
      <QuickChatHelper isAdmin={isAdmin} />
    </main>
  );
}
