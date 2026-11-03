const SUPABASE_URL = "https://eaprzpvdzcecammzsizo.supabase.co";
const SUPABASE_KEY = "sb_publishable_tHM3CfNnRMTLdFVokQJaAg_XFRdpaIb";

interface Session {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  user: { id: string; email?: string };
}

interface Profile {
  role: string;
  status: string;
  access_until?: string;
}

export interface AccessState {
  allowed: boolean;
  signedIn: boolean;
  email?: string;
  userId?: string;
  reason?: string;
}

let refreshPromise: Promise<Session> | undefined;

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${SUPABASE_URL}${path}`, {
    ...options,
    headers: {
      apikey: SUPABASE_KEY,
      "Content-Type": "application/json",
      ...options.headers,
    },
    cache: "no-store",
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      data.msg ||
        data.error_description ||
        data.message ||
        data.error ||
        `Supabase request failed (${response.status})`,
    );
  }
  return data as T;
}

export async function signIn(email: string, password: string): Promise<void> {
  const { authSession: previousSession } = (await chrome.storage.local.get("authSession")) as {
    authSession?: Session;
  };
  const data = await request<{
    access_token?: string;
    refresh_token?: string;
    expires_at?: number;
    expires_in?: number;
    user?: { id: string; email?: string };
  }>("/auth/v1/token?grant_type=password", {
    method: "POST",
    body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
  });
  if (!data.access_token || !data.refresh_token || !data.user?.id) {
    throw new Error("Incomplete login response.");
  }
  const session: Session = {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: data.expires_at || Math.floor(Date.now() / 1000) + (data.expires_in || 0),
    user: { id: data.user.id, email: data.user.email },
  };
  if (previousSession?.user?.id && previousSession.user.id !== session.user.id) {
    await chrome.storage.local.remove([
      "geminiApiKey",
      "solutionNotes",
      "userScript",
      "solverStatus",
      "lastError",
      "codechumGeminiConsentUserId",
    ]);
  }
  await chrome.storage.local.set({ authSession: session });
}

async function getSession(): Promise<Session | undefined> {
  let { authSession: session } = (await chrome.storage.local.get("authSession")) as {
    authSession?: Session;
  };
  if (!session?.refresh_token || !session.user?.id) return undefined;
  if (!session.access_token || session.expires_at <= Math.floor(Date.now() / 1000) + 30) {
    if (!refreshPromise) {
      const previous = session;
      refreshPromise = request<{
        access_token: string;
        refresh_token: string;
        expires_at?: number;
        expires_in?: number;
        user?: { id: string; email?: string };
      }>("/auth/v1/token?grant_type=refresh_token", {
        method: "POST",
        body: JSON.stringify({ refresh_token: previous.refresh_token }),
      }).then(async (data) => {
        const updated: Session = {
          access_token: data.access_token,
          refresh_token: data.refresh_token,
          expires_at: data.expires_at || Math.floor(Date.now() / 1000) + (data.expires_in || 0),
          user: {
            id: data.user?.id || previous.user.id,
            email: data.user?.email || previous.user.email,
          },
        };
        await chrome.storage.local.set({ authSession: updated });
        return updated;
      });
    }
    try {
      session = await refreshPromise;
    } catch {
      await chrome.storage.local.remove("authSession");
      return undefined;
    } finally {
      refreshPromise = undefined;
    }
  }
  return session;
}

export async function getAccess(): Promise<AccessState> {
  const session = await getSession();
  if (!session) {
    return { allowed: false, signedIn: false, reason: "Sign in to use CodeChum." };
  }
  try {
    const rows = await request<Profile[]>(
      `/rest/v1/app_users?select=user_id,email,full_name,role,status,access_until&user_id=eq.${encodeURIComponent(session.user.id)}`,
      { headers: { Authorization: `Bearer ${session.access_token}` } },
    );
    const profile = rows[0];
    const basic = {
      allowed: false,
      signedIn: true,
      email: session.user.email,
      userId: session.user.id,
    };
    if (!profile) return { ...basic, reason: "This account has no extension access." };
    if (profile.status !== "active") return { ...basic, reason: "Access is disabled." };
    if (
      profile.role !== "admin" &&
      (!profile.access_until || Date.parse(profile.access_until) <= Date.now())
    ) {
      return { ...basic, reason: "Subscription access has expired." };
    }
    return {
      allowed: true,
      signedIn: true,
      email: session.user.email,
      userId: session.user.id,
    };
  } catch (error) {
    return {
      allowed: false,
      signedIn: true,
      email: session.user.email,
      userId: session.user.id,
      reason: error instanceof Error ? error.message : "Could not verify access.",
    };
  }
}

export async function signOut(): Promise<void> {
  const { authSession: session } = (await chrome.storage.local.get("authSession")) as {
    authSession?: Session;
  };
  await chrome.storage.local.remove([
    "authSession",
    "geminiApiKey",
    "solutionNotes",
    "userScript",
    "solverStatus",
    "lastError",
    "codechumGeminiConsentUserId",
  ]);
  if (session?.access_token) {
    try {
      await request("/auth/v1/logout", {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
    } catch {
      // Local sign-out must still complete when the network is unavailable.
    }
  }
}

export async function updatePassword(currentPassword: string, newPassword: string): Promise<void> {
  if (newPassword.length < 12) throw new Error("Use at least 12 characters for the new password.");
  const session = await getSession();
  if (!session) throw new Error("Sign in again before changing your password.");
  await request("/auth/v1/user", {
    method: "PUT",
    headers: { Authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify({ current_password: currentPassword, password: newPassword }),
  });
}
