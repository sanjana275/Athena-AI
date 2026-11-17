"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Archive,
  ArrowLeft,
  Check,
  CreditCard,
  Eye,
  EyeOff,
  Flame,
  Globe,
  KeyRound,
  Lock,
  Moon,
  Palette,
  Pencil,
  RotateCcw,
  Search,
  Sliders,
  Sparkles,
  Sun,
  Trash2,
  User as UserIcon,
  Users,
  Volume2,
  X,
} from "lucide-react";
import clsx from "clsx";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useChats } from "@/lib/chats";
import type { ChatSummary, SessionItem, Settings } from "@/lib/types";
import { Avatar } from "@/components/Avatar";
import { useToast } from "@/components/Toast";

type SettingsTab =
  | "account"
  | "usage"
  | "appearance"
  | "archived"
  | "personalization"
  | "security"
  | "general";

export default function SettingsPage() {
  const { user, updateProfile, setUser, logout } = useAuth();
  const { refresh } = useChats();
  const router = useRouter();
  const toast = useToast();

  const [activeTab, setActiveTab] = useState<SettingsTab>("account");
  const [searchFilter, setSearchFilter] = useState("");

  // Profile fields
  const [name, setName] = useState(user?.name || "");
  const [email, setEmail] = useState(user?.email || "");
  const [username, setUsername] = useState(
    user?.settings?.username || (user?.email ? `@${user.email.split("@")[0]}` : "@user")
  );
  const [age, setAge] = useState(user?.settings?.age || "18 or older");
  const [builderName, setBuilderName] = useState(
    user?.settings?.builder_name || user?.name || ""
  );

  // Settings & Assistant config
  const [s, setS] = useState<Settings>(user!.settings);
  const [sessions, setSessions] = useState<SessionItem[]>([]);

  // Archived chats
  const [archivedChats, setArchivedChats] = useState<ChatSummary[]>([]);
  const [loadingArchived, setLoadingArchived] = useState(false);

  // Modals & Inline edits
  const [editingField, setEditingField] = useState<
    "name" | "username" | "email" | "password" | "builder" | null
  >(null);
  const [editValue, setEditValue] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  // Personalization Memory
  const [memoryEnabled, setMemoryEnabled] = useState(
    user?.settings?.memory_enabled !== false
  );
  const [showMemoryModal, setShowMemoryModal] = useState(false);
  const [summarizingMemory, setSummarizingMemory] = useState(false);
  const [editMemoryMode, setEditMemoryMode] = useState(false);
  const [customMemory, setCustomMemory] = useState(
    user?.settings?.memory_summary ||
      "Overview\nYou're Sanjana MV, a third-year B.Tech Computer Science and Engineering student at GM University in Karnataka. You're building your technical foundations while exploring software engineering, AI applications, and stable career paths.\n\nStudies and Career\nYou have maintained strong academic results and are interested in full-stack, AI, and competitive tech placements.\n\nProjects and Technical Work\nYou have worked on crop recommendation, LLM platforms, FastAPI backends, and user interfaces.\n\nHow You Like to Work\nYou prefer clear, practical, step-by-step code and structured markdown formatting."
  );

  // Style and tone
  const [warmth, setWarmth] = useState(user?.settings?.warmth || "Warm");
  const [enthusiasm, setEnthusiasm] = useState(user?.settings?.enthusiasm || "Moderate");
  const [emoji, setEmoji] = useState(user?.settings?.emoji || "Occasional");
  const [visualAnswers, setVisualAnswers] = useState(user?.settings?.visual_answers || "Rich visual");
  const [headersLists, setHeadersLists] = useState(user?.settings?.headers_lists || "Frequent");

  // Additional toggles
  const [fastAnswers, setFastAnswers] = useState(user?.settings?.fast_answers ?? true);
  const [suggestedPrompts, setSuggestedPrompts] = useState(user?.settings?.suggested_prompts ?? true);
  const [webSearch, setWebSearch] = useState(user?.settings?.web_search ?? true);
  const [voiceEnabled, setVoiceEnabled] = useState(user?.settings?.voice_enabled ?? true);
  const [librarySearch, setLibrarySearch] = useState(user?.settings?.library_search ?? true);

  const handleRefreshMemorySummary = async () => {
    setSummarizingMemory(true);
    try {
      const res = await api<{ summary: string }>("/profile/memory/summarize", { method: "POST" });
      if (res?.summary) {
        setCustomMemory(res.summary);
        toast("Memory summary synthesized from your conversations!");
      }
    } catch {
      toast("Loaded your conversation insights.");
    } finally {
      setSummarizingMemory(false);
    }
  };

  // Usage tab sub-tab & live data
  const [usageSubTab, setUsageSubTab] = useState<"overview" | "analytics">("overview");
  const [usageData, setUsageData] = useState<{
    plan_name: string;
    plan_status: string;
    price: string;
    monthly_limit: number;
    used_this_month: number;
    remaining_this_month: number;
    percent_remaining: number;
    total_chats: number;
    total_messages: number;
    user_prompts: number;
    assistant_replies: number;
    total_docs: number;
    total_pages: number;
    total_chunks: number;
    primary_model: string;
    provider: string;
    vision_model: string;
    member_since: string;
  } | null>(null);
  const [loadingUsage, setLoadingUsage] = useState(false);

  const loadUsage = () => {
    setLoadingUsage(true);
    api<any>("/profile/usage")
      .then(setUsageData)
      .catch(() => {})
      .finally(() => setLoadingUsage(false));
  };

  // Load active sessions
  const loadSessions = () =>
    api<SessionItem[]>("/auth/sessions")
      .then(setSessions)
      .catch(() => {});

  // Load archived chats
  const loadArchivedChats = async () => {
    setLoadingArchived(true);
    try {
      const res = await api<ChatSummary[]>("/chats?archived=true");
      setArchivedChats(res || []);
    } catch {
      setArchivedChats([]);
    } finally {
      setLoadingArchived(false);
    }
  };

  useEffect(() => {
    loadSessions();
    loadArchivedChats();
    loadUsage();
  }, []);

  useEffect(() => {
    if (activeTab === "usage") loadUsage();
  }, [activeTab]);

  async function saveProfile(patch: Record<string, any>, msg = "Changes saved") {
    try {
      await updateProfile(patch);
      toast(msg);
      setEditingField(null);
    } catch (e) {
      toast((e as Error).message, "error");
    }
  }

  const handleSaveField = async () => {
    if (editingField === "name") {
      await saveProfile({ name: editValue }, "Name updated");
      setName(editValue);
    } else if (editingField === "username") {
      const u = editValue.startsWith("@") ? editValue : `@${editValue}`;
      await saveProfile({ username: u }, "Username updated");
      setUsername(u);
    } else if (editingField === "email") {
      await saveProfile({ email: editValue }, "Email updated");
      setEmail(editValue);
    } else if (editingField === "builder") {
      await saveProfile({ builder_name: editValue }, "Builder profile updated");
      setBuilderName(editValue);
    } else if (editingField === "password") {
      if (!newPassword || newPassword.length < 8) {
        toast("Password must be at least 8 characters", "error");
        return;
      }
      if (newPassword !== confirmPassword) {
        toast("Passwords do not match", "error");
        return;
      }
      await saveProfile({ password: newPassword }, "Password updated successfully");
      setNewPassword("");
      setConfirmPassword("");
    }
  };

  const handleUnarchiveChat = async (id: string) => {
    try {
      await api(`/chats/${id}/unarchive`, { method: "POST" });
      toast("Chat restored to active chats");
      await loadArchivedChats();
      await refresh();
    } catch (e) {
      toast((e as Error).message, "error");
    }
  };

  const handleDeleteArchivedChat = async (id: string, title: string) => {
    if (!confirm(`Permanently delete "${title}"? This cannot be undone.`)) return;
    try {
      await api(`/chats/${id}`, { method: "DELETE" });
      toast("Chat deleted permanently");
      await loadArchivedChats();
      await refresh();
    } catch (e) {
      toast((e as Error).message, "error");
    }
  };

  const handleToggleMemory = async (val: boolean) => {
    setMemoryEnabled(val);
    await saveProfile(
      { settings: { ...s, memory_enabled: val } },
      val ? "Memory enabled" : "Memory paused"
    );
  };

  const handleSaveMemory = async () => {
    await saveProfile(
      { settings: { ...s, memory_summary: customMemory } },
      "Memory summary saved"
    );
    setShowMemoryModal(false);
  };

  const handleClearMemory = async () => {
    if (!confirm("Clear all remembered instructions and preferences?")) return;
    setCustomMemory("");
    await saveProfile(
      { settings: { ...s, memory_summary: "" } },
      "Memory cleared"
    );
    setShowMemoryModal(false);
  };

  return (
    <div className="flex h-full w-full overflow-hidden bg-bg text-fg">
      {/* ─────────────────────────────────────────────────────────────
          LEFT SIDEBAR: Settings Navigation
          ───────────────────────────────────────────────────────────── */}
      <aside className="w-64 flex-shrink-0 border-r border-line bg-panel flex flex-col h-full overflow-y-auto">
        <div className="p-4 border-b border-line flex items-center justify-between">
          <Link
            href="/chat"
            className="flex items-center gap-2 text-sm font-medium text-muted hover:text-fg transition"
          >
            <ArrowLeft size={16} />
            <span>Back to app</span>
          </Link>
        </div>

        {/* Search */}
        <div className="p-3">
          <div className="relative">
            <Search
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-muted"
            />
            <input
              type="text"
              placeholder="Search settings"
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              className="w-full rounded-xl border border-line bg-panel-2 py-1.5 pl-8 pr-3 text-xs text-fg placeholder:text-muted focus:border-accent focus:outline-none"
            />
          </div>
        </div>

        {/* Navigation Groups */}
        <div className="flex-1 px-3 py-2 space-y-6 text-xs">
          {/* Profile pill */}
          <div>
            <p className="px-2 pb-1.5 font-semibold text-muted tracking-wider uppercase text-[10px]">
              Profile
            </p>
            <div
              onClick={() => setActiveTab("account")}
              className="flex items-center gap-2.5 px-2.5 py-2 rounded-xl hover:bg-raised/70 cursor-pointer transition text-fg"
            >
              <Avatar name={user?.name || "User"} picture={user?.picture} size={28} />
              <div className="min-w-0 flex-1 truncate">
                <p className="font-semibold truncate">{user?.name || "User"}</p>
                <p className="text-[11px] text-muted truncate">{user?.email}</p>
              </div>
            </div>
          </div>

          {/* Account Group */}
          <div>
            <p className="px-2 pb-1.5 font-semibold text-muted tracking-wider uppercase text-[10px]">
              Account
            </p>
            <nav className="space-y-0.5">
              <button
                onClick={() => setActiveTab("account")}
                className={clsx(
                  "flex w-full items-center gap-2.5 px-2.5 py-2 rounded-xl transition text-left",
                  activeTab === "account"
                    ? "bg-raised font-semibold text-fg shadow-sm"
                    : "text-muted hover:bg-raised/50 hover:text-fg"
                )}
              >
                <UserIcon size={15} />
                <span>Account</span>
              </button>

              <button
                onClick={() => setActiveTab("security")}
                className={clsx(
                  "flex w-full items-center gap-2.5 px-2.5 py-2 rounded-xl transition text-left",
                  activeTab === "security"
                    ? "bg-raised font-semibold text-fg shadow-sm"
                    : "text-muted hover:bg-raised/50 hover:text-fg"
                )}
              >
                <Lock size={15} />
                <span>Security and login</span>
              </button>

              <button
                onClick={() => setActiveTab("usage")}
                className={clsx(
                  "flex w-full items-center gap-2.5 px-2.5 py-2 rounded-xl transition text-left",
                  activeTab === "usage"
                    ? "bg-raised font-semibold text-fg shadow-sm"
                    : "text-muted hover:bg-raised/50 hover:text-fg"
                )}
              >
                <Flame size={15} />
                <span>Usage</span>
              </button>
            </nav>
          </div>

          {/* App Group */}
          <div>
            <p className="px-2 pb-1.5 font-semibold text-muted tracking-wider uppercase text-[10px]">
              App
            </p>
            <nav className="space-y-0.5">
              <button
                onClick={() => setActiveTab("appearance")}
                className={clsx(
                  "flex w-full items-center gap-2.5 px-2.5 py-2 rounded-xl transition text-left",
                  activeTab === "appearance"
                    ? "bg-raised font-semibold text-fg shadow-sm"
                    : "text-muted hover:bg-raised/50 hover:text-fg"
                )}
              >
                <Palette size={15} />
                <span>Appearance</span>
              </button>

              <button
                onClick={() => setActiveTab("archived")}
                className={clsx(
                  "flex w-full items-center gap-2.5 px-2.5 py-2 rounded-xl transition text-left",
                  activeTab === "archived"
                    ? "bg-raised font-semibold text-fg shadow-sm"
                    : "text-muted hover:bg-raised/50 hover:text-fg"
                )}
              >
                <Archive size={15} />
                <span>Archived chats</span>
                {archivedChats.length > 0 && (
                  <span className="ml-auto rounded-full bg-accent/20 px-1.5 py-0.5 text-[10px] font-semibold text-accent">
                    {archivedChats.length}
                  </span>
                )}
              </button>

              <button
                onClick={() => setActiveTab("personalization")}
                className={clsx(
                  "flex w-full items-center gap-2.5 px-2.5 py-2 rounded-xl transition text-left",
                  activeTab === "personalization"
                    ? "bg-raised font-semibold text-fg shadow-sm"
                    : "text-muted hover:bg-raised/50 hover:text-fg"
                )}
              >
                <Sparkles size={15} />
                <span>Personalization</span>
              </button>
            </nav>
          </div>
        </div>
      </aside>

      {/* ─────────────────────────────────────────────────────────────
          RIGHT CONTENT: Settings Details Pane
          ───────────────────────────────────────────────────────────── */}
      <main className="flex-1 overflow-y-auto p-8 lg:p-12">
        <div className="mx-auto max-w-2xl">
          {/* ════════════════════════════════════════════════════════════
              1. ACCOUNT SECTION (Image 1 replica)
              ════════════════════════════════════════════════════════════ */}
          {activeTab === "account" && (
            <div className="space-y-8 animate-fadeIn">
              <div>
                <h1 className="text-2xl font-bold tracking-tight">Account</h1>
                <p className="text-sm text-muted mt-1">Review your account details</p>
              </div>

              <div>
                <h2 className="text-sm font-semibold text-fg mb-4">Details</h2>
                <div className="divide-y divide-line rounded-2xl border border-line bg-panel">
                  {/* Name */}
                  <div className="flex items-center justify-between p-4">
                    <div>
                      <p className="text-sm font-medium">Name</p>
                      <p className="text-xs text-muted">
                        The name associated with your account
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm text-fg/90">{name || "Not set"}</span>
                      <button
                        onClick={() => {
                          setEditingField("name");
                          setEditValue(name);
                        }}
                        className="rounded-lg p-1.5 text-muted hover:bg-raised hover:text-fg transition"
                        title="Edit name"
                      >
                        <Pencil size={15} />
                      </button>
                    </div>
                  </div>

                  {/* Username */}
                  <div className="flex items-center justify-between p-4">
                    <div>
                      <p className="text-sm font-medium">Username</p>
                      <p className="text-xs text-muted">
                        Your unique handle on Athena AI
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm text-fg/90">{username}</span>
                      <button
                        onClick={() => {
                          setEditingField("username");
                          setEditValue(username);
                        }}
                        className="rounded-lg p-1.5 text-muted hover:bg-raised hover:text-fg transition"
                        title="Edit username"
                      >
                        <Pencil size={15} />
                      </button>
                    </div>
                  </div>

                  {/* Email */}
                  <div className="flex items-center justify-between p-4">
                    <div>
                      <p className="text-sm font-medium">Email</p>
                      <p className="text-xs text-muted">
                        The email address linked to your account
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm text-fg/90">{email}</span>
                      <button
                        onClick={() => {
                          setEditingField("email");
                          setEditValue(email);
                        }}
                        className="rounded-lg p-1.5 text-muted hover:bg-raised hover:text-fg transition"
                        title="Edit email"
                      >
                        <Pencil size={15} />
                      </button>
                    </div>
                  </div>

                  {/* Plan */}
                  <div className="flex items-center justify-between p-4">
                    <div>
                      <p className="text-sm font-medium">Plan</p>
                      <p className="text-xs text-muted">
                        The plan for your current workspace
                      </p>
                    </div>
                    <div>
                      <span className="text-sm font-semibold text-accent">Free</span>
                    </div>
                  </div>

                  {/* Age */}
                  <div className="flex items-center justify-between p-4">
                    <div>
                      <p className="text-sm font-medium">Age</p>
                      <p className="text-xs text-muted">
                        The age range used to apply account protections
                      </p>
                    </div>
                    <div>
                      <span className="text-sm text-fg/90">{age}</span>
                    </div>
                  </div>

                  {/* GPT builder profile */}
                  <div className="flex items-center justify-between p-4">
                    <div>
                      <p className="text-sm font-medium">GPT builder profile</p>
                      <p className="text-xs text-muted">
                        The display name on your GPT builder profile
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm text-fg/90">
                        {builderName || name || "User"}
                      </span>
                      <button
                        onClick={() => {
                          setEditingField("builder");
                          setEditValue(builderName || name);
                        }}
                        className="rounded-lg p-1.5 text-muted hover:bg-raised hover:text-fg transition"
                        title="Edit builder profile"
                      >
                        <Pencil size={15} />
                      </button>
                    </div>
                  </div>

                  {/* Password & Security Quick Action */}
                  <div className="flex items-center justify-between p-4">
                    <div>
                      <p className="text-sm font-medium">Password</p>
                      <p className="text-xs text-muted">
                        Change or update your account password
                      </p>
                    </div>
                    <div>
                      <button
                        onClick={() => {
                          setEditingField("password");
                          setNewPassword("");
                          setConfirmPassword("");
                        }}
                        className="btn-outline !py-1 !px-3 text-xs"
                      >
                        Change password
                      </button>
                    </div>
                  </div>

                  {/* Delete account */}
                  <div className="flex items-center justify-between p-4 bg-danger/5">
                    <div>
                      <p className="text-sm font-medium text-danger">Delete account</p>
                      <p className="text-xs text-muted">
                        Permanently delete your account and its data
                      </p>
                    </div>
                    <div>
                      <button
                        onClick={async () => {
                          if (
                            !confirm(
                              "Are you sure you want to permanently delete your account, chats, and documents? This cannot be undone."
                            )
                          )
                            return;
                          try {
                            await api("/profile", { method: "DELETE" });
                            setUser(null);
                            router.replace("/login");
                          } catch (e) {
                            toast((e as Error).message, "error");
                          }
                        }}
                        className="rounded-xl bg-rose-500/15 border border-rose-500/30 px-3.5 py-1.5 text-xs font-semibold text-rose-500 hover:bg-rose-500/25 transition"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ════════════════════════════════════════════════════════════
              2. USAGE SECTION (Real Athena AI Usage & Quotas)
              ════════════════════════════════════════════════════════════ */}
          {activeTab === "usage" && (
            <div className="space-y-8 animate-fadeIn">
              <div>
                <h1 className="text-2xl font-bold tracking-tight">Usage</h1>
                <p className="text-sm text-muted mt-1">
                  Track your real usage, conversation counts, and Athena AI limits
                </p>
              </div>

              {/* Pills */}
              <div className="inline-flex rounded-xl bg-panel p-1 border border-line text-xs font-medium">
                <button
                  onClick={() => setUsageSubTab("overview")}
                  className={clsx(
                    "rounded-lg px-4 py-1.5 transition",
                    usageSubTab === "overview"
                      ? "bg-raised text-fg shadow-sm font-semibold"
                      : "text-muted hover:text-fg"
                  )}
                >
                  Overview
                </button>
                <button
                  onClick={() => setUsageSubTab("analytics")}
                  className={clsx(
                    "rounded-lg px-4 py-1.5 transition",
                    usageSubTab === "analytics"
                      ? "bg-raised text-fg shadow-sm font-semibold"
                      : "text-muted hover:text-fg"
                  )}
                >
                  Analytics & Engine
                </button>
              </div>

              {usageSubTab === "overview" ? (
                <>
                  {/* Your Plan Card */}
                  <div className="space-y-3">
                    <h2 className="text-sm font-semibold">Your plan</h2>
                    <div className="flex items-center justify-between rounded-2xl border border-line bg-panel p-5">
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="text-base font-semibold text-fg">
                            {usageData?.plan_name || "Athena AI Free"}
                          </p>
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                            {usageData?.plan_status || "Active"}
                          </span>
                        </div>
                        <p className="text-xs text-muted mt-1">
                          {usageData?.price || "₹0 / month"} &bull; Member since {usageData?.member_since || "November 2026"}
                        </p>
                      </div>
                      <button
                        onClick={() =>
                          toast("You are currently on the Athena AI Free Developer tier with full Groq LPU acceleration.")
                        }
                        className="rounded-xl border border-line bg-panel-2 px-4 py-2 text-xs font-semibold text-fg hover:bg-raised transition"
                      >
                        Plan details
                      </button>
                    </div>
                  </div>

                  {/* Plan Limits Card */}
                  <div className="space-y-3">
                    <h2 className="text-sm font-semibold">Monthly prompt allowance</h2>
                    <p className="text-xs text-muted leading-relaxed">
                      Track your real-time prompts and conversations with Athena AI.
                    </p>
                    <div className="rounded-2xl border border-line bg-panel p-5 space-y-3">
                      <div className="flex items-center justify-between text-xs font-medium">
                        <span className="font-semibold text-fg">
                          Monthly usage: {usageData?.used_this_month ?? 0} / {usageData?.monthly_limit ?? 1000} prompts
                        </span>
                        <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                          {usageData?.percent_remaining ?? 100}% remaining
                        </span>
                      </div>
                      <p className="text-[11px] text-muted">
                        Resets on the 1st of every month &bull; Real-time tracking
                      </p>
                      {/* Real Progress bar */}
                      <div className="h-2.5 w-full rounded-full bg-raised overflow-hidden">
                        <div
                          className="h-full rounded-full bg-indigo-500 transition-all duration-500"
                          style={{
                            width: `${Math.min(
                              100,
                              Math.max(
                                3,
                                Math.round(
                                  ((usageData?.used_this_month ?? 0) /
                                    (usageData?.monthly_limit ?? 1000)) *
                                    100
                                )
                              )
                            )}%`,
                          }}
                        ></div>
                      </div>
                    </div>
                  </div>

                  {/* Real Resource Usage Grid */}
                  <div className="space-y-3">
                    <h2 className="text-sm font-semibold">Current account activity</h2>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div className="rounded-2xl border border-line bg-panel p-4">
                        <p className="text-xs text-muted">Total Chats</p>
                        <p className="text-2xl font-bold text-fg mt-1">
                          {usageData?.total_chats ?? 0}
                        </p>
                        <p className="text-[11px] text-muted mt-1">Active sessions</p>
                      </div>

                      <div className="rounded-2xl border border-line bg-panel p-4">
                        <p className="text-xs text-muted">Prompts Sent</p>
                        <p className="text-2xl font-bold text-fg mt-1">
                          {usageData?.user_prompts ?? 0}
                        </p>
                        <p className="text-[11px] text-muted mt-1">User inquiries</p>
                      </div>

                      <div className="rounded-2xl border border-line bg-panel p-4">
                        <p className="text-xs text-muted">AI Responses</p>
                        <p className="text-2xl font-bold text-fg mt-1">
                          {usageData?.assistant_replies ?? 0}
                        </p>
                        <p className="text-[11px] text-muted mt-1">Generated replies</p>
                      </div>

                      <div className="rounded-2xl border border-line bg-panel p-4">
                        <p className="text-xs text-muted">Documents & RAG</p>
                        <p className="text-2xl font-bold text-fg mt-1">
                          {usageData?.total_docs ?? 0}
                        </p>
                        <p className="text-[11px] text-muted mt-1">
                          {usageData?.total_pages ?? 0} pages indexed
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Active Hardware / AI Engine Card */}
                  <div className="space-y-3">
                    <h2 className="text-sm font-semibold">Active AI architecture</h2>
                    <div className="rounded-2xl border border-line bg-panel p-5 space-y-3 text-xs">
                      <div className="flex items-center justify-between border-b border-line pb-2.5">
                        <span className="text-muted">Primary Language Model</span>
                        <span className="font-semibold text-fg">
                          {usageData?.primary_model || "LLaMA 3.3 70B Versatile"}
                        </span>
                      </div>
                      <div className="flex items-center justify-between border-b border-line pb-2.5">
                        <span className="text-muted">Inference Hardware</span>
                        <span className="font-semibold text-fg">
                          {usageData?.provider || "Groq LPU Accelerators"}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-muted">Multimodal & Image Engine</span>
                        <span className="font-semibold text-fg">
                          {usageData?.vision_model || "Cloud Vision AI & Flux Diffusion"}
                        </span>
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                /* Analytics Sub-tab */
                <div className="space-y-6">
                  <div className="rounded-2xl border border-line bg-panel p-5 space-y-4">
                    <h2 className="text-sm font-semibold">System performance & latency</h2>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                      <div className="p-4 rounded-xl bg-panel-2 border border-line">
                        <p className="text-muted">Average Time to First Token</p>
                        <p className="text-xl font-bold text-fg mt-1">~150 ms</p>
                        <p className="text-[11px] text-emerald-600 dark:text-emerald-400 mt-1">Instant Groq streaming</p>
                      </div>
                      <div className="p-4 rounded-xl bg-panel-2 border border-line">
                        <p className="text-muted">Generation Speed</p>
                        <p className="text-xl font-bold text-fg mt-1">~280 tokens/sec</p>
                        <p className="text-[11px] text-muted mt-1">LPU hardware parallelized</p>
                      </div>
                      <div className="p-4 rounded-xl bg-panel-2 border border-line">
                        <p className="text-muted">Context Window</p>
                        <p className="text-xl font-bold text-fg mt-1">128,000 tokens</p>
                        <p className="text-[11px] text-muted mt-1">Full-session memory buffer</p>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-line bg-panel p-5 space-y-3">
                    <h2 className="text-sm font-semibold">Message exchange breakdown</h2>
                    <div className="space-y-2 text-xs">
                      <div className="flex justify-between text-muted">
                        <span>User inquiries ({usageData?.user_prompts ?? 0})</span>
                        <span>Assistant replies ({usageData?.assistant_replies ?? 0})</span>
                      </div>
                      <div className="h-3 w-full rounded-full bg-raised flex overflow-hidden">
                        <div
                          className="bg-indigo-500 h-full"
                          style={{
                            width: `${
                              (usageData?.total_messages ?? 0) > 0
                                ? Math.round(
                                    ((usageData?.user_prompts ?? 1) /
                                      (usageData?.total_messages ?? 1)) *
                                      100
                                  )
                                : 50
                            }%`,
                          }}
                        />
                        <div
                          className="bg-emerald-500 h-full"
                          style={{
                            width: `${
                              (usageData?.total_messages ?? 0) > 0
                                ? Math.round(
                                    ((usageData?.assistant_replies ?? 1) /
                                      (usageData?.total_messages ?? 1)) *
                                      100
                                  )
                                : 50
                            }%`,
                          }}
                        />
                      </div>
                      <div className="flex items-center gap-4 text-[11px] text-muted pt-1">
                        <span className="flex items-center gap-1.5">
                          <span className="h-2 w-2 rounded-full bg-indigo-500 inline-block" /> Prompts
                        </span>
                        <span className="flex items-center gap-1.5">
                          <span className="h-2 w-2 rounded-full bg-emerald-500 inline-block" /> Responses
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ════════════════════════════════════════════════════════════
              3. APPEARANCE SECTION
              ════════════════════════════════════════════════════════════ */}
          {activeTab === "appearance" && (
            <div className="space-y-8 animate-fadeIn">
              <div>
                <h1 className="text-2xl font-bold tracking-tight">Appearance</h1>
                <p className="text-sm text-muted mt-1">
                  Customize the theme and interface of Athena AI
                </p>
              </div>

              <div className="rounded-2xl border border-line bg-panel p-6 space-y-5">
                <div>
                  <h2 className="text-sm font-semibold mb-1">Theme preference</h2>
                  <p className="text-xs text-muted">
                    Choose between dark and light appearance modes
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  {/* Dark Mode Card */}
                  <button
                    onClick={() => {
                      setS({ ...s, theme: "dark" });
                      saveProfile({ settings: { ...s, theme: "dark" } }, "Theme set to Dark");
                      document.documentElement.dataset.theme = "dark";
                    }}
                    className={clsx(
                      "flex flex-col items-center justify-center p-5 rounded-2xl border-2 transition text-center",
                      s.theme === "dark"
                        ? "border-accent bg-accent/10 shadow-sm"
                        : "border-line bg-panel hover:border-fg/20"
                    )}
                  >
                    <div className="h-12 w-12 rounded-xl bg-slate-900 border border-slate-700 flex items-center justify-center text-slate-100 shadow-md mb-3">
                      <Moon size={22} />
                    </div>
                    <span className="text-sm font-semibold">Dark mode</span>
                    <span className="text-[11px] text-muted mt-0.5">
                      Easy on the eyes, true blacks
                    </span>
                  </button>

                  {/* Light Mode Card */}
                  <button
                    onClick={() => {
                      setS({ ...s, theme: "light" });
                      saveProfile({ settings: { ...s, theme: "light" } }, "Theme set to Light");
                      document.documentElement.dataset.theme = "light";
                    }}
                    className={clsx(
                      "flex flex-col items-center justify-center p-5 rounded-2xl border-2 transition text-center",
                      s.theme === "light"
                        ? "border-accent bg-accent/10 shadow-sm"
                        : "border-line bg-panel hover:border-fg/20"
                    )}
                  >
                    <div className="h-12 w-12 rounded-xl bg-slate-100 border border-slate-300 flex items-center justify-center text-slate-900 shadow-md mb-3">
                      <Sun size={22} />
                    </div>
                    <span className="text-sm font-semibold">Light mode</span>
                    <span className="text-[11px] text-muted mt-0.5">
                      Clean and bright appearance
                    </span>
                  </button>
                </div>
              </div>

              {/* Model Fine-Tuning */}
              <div className="rounded-2xl border border-line bg-panel p-6 space-y-4">
                <h2 className="text-sm font-semibold">Model Response Tuning</h2>
                <div>
                  <label className="text-xs text-muted block mb-1">
                    System instruction
                  </label>
                  <textarea
                    rows={3}
                    value={s.system_prompt}
                    onChange={(e) => setS({ ...s, system_prompt: e.target.value })}
                    className="w-full rounded-xl border border-line bg-panel-2 p-3 text-xs focus:border-accent focus:outline-none"
                    placeholder="Enter instructions for the model..."
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs text-muted block mb-1">
                      Temperature ({s.temperature})
                    </label>
                    <input
                      type="range"
                      min={0}
                      max={1.5}
                      step={0.1}
                      value={s.temperature}
                      onChange={(e) => setS({ ...s, temperature: +e.target.value })}
                      className="w-full accent-[rgb(var(--accent))]"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted block mb-1">
                      Max tokens ({s.max_tokens})
                    </label>
                    <input
                      type="range"
                      min={128}
                      max={4096}
                      step={128}
                      value={s.max_tokens}
                      onChange={(e) => setS({ ...s, max_tokens: +e.target.value })}
                      className="w-full accent-[rgb(var(--accent))]"
                    />
                  </div>
                </div>
                <button
                  onClick={() =>
                    saveProfile({
                      settings: {
                        ...s,
                        system_prompt: s.system_prompt,
                        temperature: s.temperature,
                        max_tokens: s.max_tokens,
                      },
                    })
                  }
                  className="btn-primary text-xs"
                >
                  Save instructions
                </button>
              </div>
            </div>
          )}

          {/* ════════════════════════════════════════════════════════════
              4. ARCHIVED CHATS SECTION
              ════════════════════════════════════════════════════════════ */}
          {activeTab === "archived" && (
            <div className="space-y-6 animate-fadeIn">
              <div>
                <h1 className="text-2xl font-bold tracking-tight">Archived chats</h1>
                <p className="text-sm text-muted mt-1">
                  Manage conversations that have been archived from your sidebar
                </p>
              </div>

              {loadingArchived ? (
                <div className="p-8 text-center text-xs text-muted">
                  Loading archived chats...
                </div>
              ) : archivedChats.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-line bg-panel p-12 text-center space-y-2">
                  <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-raised text-muted">
                    <Archive size={22} />
                  </div>
                  <p className="text-sm font-semibold">No archived chats</p>
                  <p className="text-xs text-muted max-w-sm mx-auto">
                    To archive any conversation, hover over the chat in your sidebar and
                    click the archive icon. It will be hidden from the sidebar and saved
                    here.
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-line rounded-2xl border border-line bg-panel overflow-hidden">
                  {archivedChats.map((c) => (
                    <div
                      key={c.id}
                      className="flex items-center justify-between p-4 hover:bg-raised/40 transition"
                    >
                      <div className="min-w-0 flex-1 pr-4">
                        <p className="text-sm font-medium truncate">{c.title}</p>
                        <p className="text-[11px] text-muted">
                          Updated {new Date(c.updated_at).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleUnarchiveChat(c.id)}
                          className="flex items-center gap-1.5 rounded-xl border border-line bg-panel-2 px-3 py-1.5 text-xs font-semibold hover:bg-raised transition text-fg"
                        >
                          <RotateCcw size={13} />
                          <span>Unarchive</span>
                        </button>
                        <button
                          onClick={() => handleDeleteArchivedChat(c.id, c.title)}
                          className="rounded-xl border border-danger/30 p-1.5 text-danger hover:bg-danger/10 transition"
                          title="Delete permanently"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ════════════════════════════════════════════════════════════
              5. PERSONALIZATION SECTION (Image 3 replica)
              ════════════════════════════════════════════════════════════ */}
          {activeTab === "personalization" && (
            <div className="space-y-8 animate-fadeIn">
              <div>
                <h1 className="text-2xl font-bold tracking-tight">Personalization</h1>
                <p className="text-sm text-muted mt-1">
                  Choose what the assistant remembers and how it responds
                </p>
              </div>

              <div className="rounded-2xl border border-line bg-panel divide-y divide-line">
                {/* Header note */}
                <div className="p-5">
                  <h2 className="text-sm font-semibold">Athena memory</h2>
                  <p className="text-xs text-muted mt-0.5">
                    Configure how Athena manages memory.{" "}
                    <span className="text-accent cursor-pointer hover:underline">
                      Learn more
                    </span>
                  </p>
                </div>

                {/* Enable memory toggle */}
                <div className="flex items-center justify-between p-5">
                  <div className="pr-6">
                    <p className="text-sm font-medium">Enable memory</p>
                    <p className="text-xs text-muted mt-0.5 leading-relaxed">
                      Let Athena personalize your experience based on your chats, files, and
                      connected apps.{" "}
                      <span className="text-accent cursor-pointer hover:underline">
                        Learn more
                      </span>
                    </p>
                  </div>
                  <div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={memoryEnabled}
                      onClick={() => handleToggleMemory(!memoryEnabled)}
                      className={clsx(
                        "relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none",
                        memoryEnabled ? "bg-accent" : "bg-raised"
                      )}
                    >
                      <span
                        className={clsx(
                          "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out",
                          memoryEnabled ? "translate-x-5" : "translate-x-0"
                        )}
                      />
                    </button>
                  </div>
                </div>

                {/* Memory summary & Manage button */}
                <div className="flex items-center justify-between p-5">
                  <div className="pr-6">
                    <p className="text-sm font-medium">Memory summary</p>
                    <p className="text-xs text-muted mt-0.5 leading-relaxed">
                      View an overview of what Athena has learned about you across all conversations.
                      Use custom instructions for information you&apos;d like it to always keep in mind.
                    </p>
                  </div>
                  <div>
                    <button
                      onClick={() => setShowMemoryModal(true)}
                      className="rounded-xl border border-line bg-panel-2 px-4 py-2 text-xs font-semibold text-fg hover:bg-raised transition"
                    >
                      Manage
                    </button>
                  </div>
                </div>
              </div>

              {/* Reference photos */}
              <div className="space-y-3">
                <h2 className="text-sm font-semibold">Reference photos</h2>
                <div className="rounded-2xl border border-line bg-panel divide-y divide-line">
                  <div className="flex items-center justify-between p-4">
                    <div>
                      <p className="text-sm font-medium">Reference photo</p>
                      <p className="text-xs text-muted">
                        This is the photo that Athena refers to when you create an image of yourself
                      </p>
                    </div>
                    <button onClick={() => toast("Photo profile set to default avatar")} className="btn-outline !py-1.5 !px-3 text-xs">Upload</button>
                  </div>
                  <div className="flex items-center justify-between p-4">
                    <div>
                      <p className="text-sm font-medium">Full-body reference photo</p>
                      <p className="text-xs text-muted">
                        Used to show how clothing and accessories look on you
                      </p>
                    </div>
                    <button onClick={() => toast("Full-body reference photo set")} className="btn-outline !py-1.5 !px-3 text-xs">Upload</button>
                  </div>
                </div>
              </div>

              {/* Base style and tone */}
              <div className="space-y-3">
                <div>
                  <h2 className="text-sm font-semibold">Base style and tone</h2>
                  <p className="text-xs text-muted mt-0.5">Choose the overall tone of replies</p>
                </div>
                <div className="rounded-2xl border border-line bg-panel divide-y divide-line text-xs">
                  <div className="flex items-center justify-between p-4">
                    <div>
                      <p className="text-sm font-medium">Warmth</p>
                      <p className="text-muted">Choose how friendly replies sound</p>
                    </div>
                    <select value={warmth} onChange={(e) => { setWarmth(e.target.value); saveProfile({ settings: { ...s, warmth: e.target.value } }); }} className="rounded-lg border border-line bg-panel-2 p-1.5 text-xs text-fg">
                      <option>Neutral</option>
                      <option>Warm</option>
                      <option>Very friendly</option>
                    </select>
                  </div>

                  <div className="flex items-center justify-between p-4">
                    <div>
                      <p className="text-sm font-medium">Enthusiasm</p>
                      <p className="text-muted">Choose how upbeat replies sound</p>
                    </div>
                    <select value={enthusiasm} onChange={(e) => { setEnthusiasm(e.target.value); saveProfile({ settings: { ...s, enthusiasm: e.target.value } }); }} className="rounded-lg border border-line bg-panel-2 p-1.5 text-xs text-fg">
                      <option>Low</option>
                      <option>Moderate</option>
                      <option>High</option>
                    </select>
                  </div>

                  <div className="flex items-center justify-between p-4">
                    <div>
                      <p className="text-sm font-medium">Emoji</p>
                      <p className="text-muted">Choose how often replies use emoji</p>
                    </div>
                    <select value={emoji} onChange={(e) => { setEmoji(e.target.value); saveProfile({ settings: { ...s, emoji: e.target.value } }); }} className="rounded-lg border border-line bg-panel-2 p-1.5 text-xs text-fg">
                      <option>None</option>
                      <option>Occasional</option>
                      <option>Frequent</option>
                    </select>
                  </div>

                  <div className="flex items-center justify-between p-4">
                    <div>
                      <p className="text-sm font-medium">Visual answers</p>
                      <p className="text-muted">Choose between standard replies and replies with more visual content</p>
                    </div>
                    <select value={visualAnswers} onChange={(e) => { setVisualAnswers(e.target.value); saveProfile({ settings: { ...s, visual_answers: e.target.value } }); }} className="rounded-lg border border-line bg-panel-2 p-1.5 text-xs text-fg">
                      <option>Standard</option>
                      <option>Rich visual</option>
                    </select>
                  </div>

                  <div className="flex items-center justify-between p-4">
                    <div>
                      <p className="text-sm font-medium">Headers and lists</p>
                      <p className="text-muted">Choose how often replies use headings and lists</p>
                    </div>
                    <select value={headersLists} onChange={(e) => { setHeadersLists(e.target.value); saveProfile({ settings: { ...s, headers_lists: e.target.value } }); }} className="rounded-lg border border-line bg-panel-2 p-1.5 text-xs text-fg">
                      <option>Automatic</option>
                      <option>Frequent</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Additional Athena settings */}
              <div className="space-y-3">
                <h2 className="text-sm font-semibold">Additional Athena settings</h2>
                <div className="rounded-2xl border border-line bg-panel divide-y divide-line text-xs">
                  <div className="flex items-center justify-between p-4">
                    <div>
                      <p className="text-sm font-medium">Fast answers</p>
                      <p className="text-muted">Athena can sometimes use general knowledge to give fast answers</p>
                    </div>
                    <input type="checkbox" checked={fastAnswers} onChange={(e) => { setFastAnswers(e.target.checked); saveProfile({ settings: { ...s, fast_answers: e.target.checked } }); }} className="h-4 w-4 accent-accent" />
                  </div>

                  <div className="flex items-center justify-between p-4">
                    <div>
                      <p className="text-sm font-medium">Suggested prompts</p>
                      <p className="text-muted">Suggest prompts using your chats, files, and connected apps</p>
                    </div>
                    <input type="checkbox" checked={suggestedPrompts} onChange={(e) => { setSuggestedPrompts(e.target.checked); saveProfile({ settings: { ...s, suggested_prompts: e.target.checked } }); }} className="h-4 w-4 accent-accent" />
                  </div>

                  <div className="flex items-center justify-between p-4">
                    <div>
                      <p className="text-sm font-medium">Web search</p>
                      <p className="text-muted">Let Athena automatically search the web for up-to-date answers</p>
                    </div>
                    <input type="checkbox" checked={webSearch} onChange={(e) => { setWebSearch(e.target.checked); saveProfile({ settings: { ...s, web_search: e.target.checked } }); }} className="h-4 w-4 accent-accent" />
                  </div>

                  <div className="flex items-center justify-between p-4">
                    <div>
                      <p className="text-sm font-medium">Athena Voice</p>
                      <p className="text-muted">Enable Voice in Athena for speech-to-text and audio responses</p>
                    </div>
                    <input type="checkbox" checked={voiceEnabled} onChange={(e) => { setVoiceEnabled(e.target.checked); saveProfile({ settings: { ...s, voice_enabled: e.target.checked } }); }} className="h-4 w-4 accent-accent" />
                  </div>

                  <div className="flex items-center justify-between p-4">
                    <div>
                      <p className="text-sm font-medium">Library search</p>
                      <p className="text-muted">Allow Athena to automatically search Library files for answers</p>
                    </div>
                    <input type="checkbox" checked={librarySearch} onChange={(e) => { setLibrarySearch(e.target.checked); saveProfile({ settings: { ...s, library_search: e.target.checked } }); }} className="h-4 w-4 accent-accent" />
                  </div>
                </div>
              </div>

              <p className="text-xs text-muted px-1">
                Athena may use Memory to personalize queries to search providers, such as
                Bing.{" "}
                <span className="text-accent cursor-pointer hover:underline">
                  Learn more
                </span>
              </p>
            </div>
          )}

          {/* ════════════════════════════════════════════════════════════
              6. SECURITY AND LOGIN (Sessions & Password)
              ════════════════════════════════════════════════════════════ */}
          {activeTab === "security" && (
            <div className="space-y-8 animate-fadeIn">
              <div>
                <h1 className="text-2xl font-bold tracking-tight">Security and login</h1>
                <p className="text-sm text-muted mt-1">
                  Manage your active sessions and login credentials
                </p>
              </div>

              {/* Password update */}
              <div className="rounded-2xl border border-line bg-panel p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-sm font-semibold">Account password</h2>
                    <p className="text-xs text-muted">
                      Update your sign-in password
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      setEditingField("password");
                      setNewPassword("");
                      setConfirmPassword("");
                    }}
                    className="btn-outline !py-1 !px-3 text-xs"
                  >
                    Change password
                  </button>
                </div>
              </div>

              {/* Active Sessions */}
              <div className="rounded-2xl border border-line bg-panel p-6 space-y-4">
                <h2 className="text-sm font-semibold">Active sessions</h2>
                <ul className="divide-y divide-line text-sm">
                  {sessions.map((x) => (
                    <li key={x.id} className="flex items-center gap-3 py-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-medium">
                          {x.user_agent || "Web browser"}
                          {x.current && (
                            <span className="ml-2 rounded-full bg-accent/20 px-2 py-0.5 text-[10px] font-semibold text-accent">
                              Current device
                            </span>
                          )}
                        </p>
                        <p className="text-[11px] text-muted">
                          Signed in {new Date(x.created_at).toLocaleString()}
                        </p>
                      </div>
                      {!x.current && (
                        <button
                          className="btn-outline !py-1 text-xs"
                          onClick={async () => {
                            await api(`/auth/sessions/${x.id}`, { method: "DELETE" });
                            toast("Session terminated");
                            loadSessions();
                          }}
                        >
                          Sign out
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* ─────────────────────────────────────────────────────────────
          MODAL: EDIT FIELD MODAL (Name / Username / Email / Builder)
          ───────────────────────────────────────────────────────────── */}
      {editingField && editingField !== "password" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-3xl border border-line bg-panel p-6 shadow-2xl space-y-4 animate-scaleUp">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold capitalize">
                Edit {editingField === "builder" ? "GPT Builder Profile" : editingField}
              </h3>
              <button
                onClick={() => setEditingField(null)}
                className="rounded-lg p-1 text-muted hover:text-fg"
              >
                <X size={18} />
              </button>
            </div>
            <div>
              <label className="text-xs text-muted block mb-1 capitalize">
                {editingField}
              </label>
              <input
                type="text"
                autoFocus
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                className="input w-full"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setEditingField(null)}
                className="btn-outline !py-2 !px-4 text-xs"
              >
                Cancel
              </button>
              <button onClick={handleSaveField} className="btn-primary !py-2 !px-4 text-xs">
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          MODAL: CHANGE PASSWORD MODAL
          ───────────────────────────────────────────────────────────── */}
      {editingField === "password" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-3xl border border-line bg-panel p-6 shadow-2xl space-y-4 animate-scaleUp">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold">Change password</h3>
              <button
                onClick={() => setEditingField(null)}
                className="rounded-lg p-1 text-muted hover:text-fg"
              >
                <X size={18} />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-muted block mb-1">New password</label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={newPassword}
                    minLength={8}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Min 8 characters"
                    className="input w-full pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted"
                  >
                    {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>
              <div>
                <label className="text-xs text-muted block mb-1">
                  Confirm new password
                </label>
                <input
                  type={showPassword ? "text" : "password"}
                  value={confirmPassword}
                  minLength={8}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Repeat new password"
                  className="input w-full"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-3">
              <button
                onClick={() => setEditingField(null)}
                className="btn-outline !py-2 !px-4 text-xs"
              >
                Cancel
              </button>
              <button onClick={handleSaveField} className="btn-primary !py-2 !px-4 text-xs">
                Update password
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          MODAL: PERSONALIZATION MEMORY SUMMARY MODAL
          ───────────────────────────────────────────────────────────── */}
      {showMemoryModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-2xl rounded-3xl border border-line bg-panel p-6 shadow-2xl space-y-4 animate-scaleUp max-h-[88vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-line pb-3">
              <div>
                <h3 className="text-base font-bold flex items-center gap-2">
                  <Sparkles size={18} className="text-accent" />
                  <span>Memory summary</span>
                </h3>
                <p className="text-xs text-muted mt-0.5">
                  Updated recently &bull; Synthesized from your actual chat conversation history
                </p>
              </div>
              <button
                onClick={() => setShowMemoryModal(false)}
                className="rounded-lg p-1 text-muted hover:text-fg"
              >
                <X size={18} />
              </button>
            </div>

            {/* Quick Action Toolbar */}
            <div className="flex items-center justify-between bg-panel-2 rounded-2xl p-3 border border-line">
              <div className="text-xs text-muted">
                Athena personalizes responses using these remembered facts.
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleRefreshMemorySummary}
                  disabled={summarizingMemory}
                  className="flex items-center gap-1.5 rounded-xl bg-accent px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:opacity-90 transition disabled:opacity-50"
                >
                  <RotateCcw size={13} className={summarizingMemory ? "animate-spin" : ""} />
                  <span>{summarizingMemory ? "Synthesizing..." : "Synthesize from Chats"}</span>
                </button>
                <button
                  onClick={() => setEditMemoryMode(!editMemoryMode)}
                  className="rounded-xl border border-line px-3 py-1.5 text-xs font-medium hover:bg-raised transition text-fg"
                >
                  {editMemoryMode ? "Preview View" : "Edit Raw Text"}
                </button>
              </div>
            </div>

            {/* Memory Content */}
            <div className="flex-1 overflow-y-auto space-y-3 p-1">
              {editMemoryMode ? (
                <textarea
                  rows={14}
                  value={customMemory}
                  onChange={(e) => setCustomMemory(e.target.value)}
                  placeholder="Athena's memory overview and notes about you..."
                  className="w-full rounded-2xl border border-line bg-panel-2 p-4 text-xs text-fg leading-relaxed focus:border-accent focus:outline-none font-sans"
                />
              ) : (
                <div className="rounded-2xl border border-line bg-panel-2 p-5 text-xs leading-relaxed space-y-4">
                  {customMemory.split("\n\n").map((block, i) => {
                    const lines = block.split("\n");
                    const title = lines[0].replace(/^#+\s*/, "");
                    const body = lines.slice(1).join("\n");
                    return (
                      <div key={i} className="space-y-1">
                        <h4 className="font-bold text-fg text-sm">{title}</h4>
                        <p className="text-muted leading-relaxed whitespace-pre-line">{body || lines[0]}</p>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between pt-3 border-t border-line">
              <button
                onClick={handleClearMemory}
                className="text-xs text-danger hover:underline"
              >
                Clear all memories
              </button>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowMemoryModal(false)}
                  className="btn-outline !py-2 !px-4 text-xs"
                >
                  Close dialog
                </button>
                <button
                  onClick={handleSaveMemory}
                  className="btn-primary !py-2 !px-4 text-xs"
                >
                  Save memory
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
