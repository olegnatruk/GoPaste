/* eslint-disable-next-line @typescript-eslint/ban-ts-comment */
// @ts-nocheck — ported from the standalone extension's authenticated worker.
// Shared by the popup and service worker. The publishable key is safe to ship;
// authorization is enforced by Supabase RLS and checked again on every run.
export const ExtensionAuth = (() => {
  const URL = "https://eaprzpvdzcecammzsizo.supabase.co";
  const KEY = "sb_publishable_tHM3CfNnRMTLdFVokQJaAg_XFRdpaIb";
  let refreshPromise = null;

  async function request(path, options = {}) {
    const response = await fetch(URL + path, {
      ...options,
      headers: { apikey: KEY, "Content-Type": "application/json", ...(options.headers || {}) },
      cache: "no-store",
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok)
      throw new Error(
        data.msg ||
          data.error_description ||
          data.message ||
          data.error ||
          `Supabase request failed (${response.status})`,
      );
    return data;
  }

  async function signIn(email, password) {
    const { authSession: previousSession } = await chrome.storage.local.get("authSession");
    const data = await request("/auth/v1/token?grant_type=password", {
      method: "POST",
      body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
    });
    if (!data.access_token || !data.refresh_token || !data.user?.id)
      throw new Error("Incomplete login response");
    const session = {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: data.expires_at || Math.floor(Date.now() / 1000) + data.expires_in,
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
    return session;
  }

  async function refresh(session) {
    if (refreshPromise) return refreshPromise;
    refreshPromise = (async () => {
      const data = await request("/auth/v1/token?grant_type=refresh_token", {
        method: "POST",
        body: JSON.stringify({ refresh_token: session.refresh_token }),
      });
      const updated = {
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        expires_at: data.expires_at || Math.floor(Date.now() / 1000) + data.expires_in,
        user: {
          id: data.user?.id || session.user.id,
          email: data.user?.email || session.user.email,
        },
      };
      await chrome.storage.local.set({ authSession: updated });
      return updated;
    })();
    try {
      return await refreshPromise;
    } finally {
      refreshPromise = null;
    }
  }

  async function getSession() {
    let { authSession: session } = await chrome.storage.local.get("authSession");
    if (!session?.refresh_token || !session?.user?.id) return null;
    if (!session.access_token || (session.expires_at || 0) <= Math.floor(Date.now() / 1000) + 30) {
      try {
        session = await refresh(session);
      } catch {
        await chrome.storage.local.remove("authSession");
        return null;
      }
    }
    return session;
  }

  async function getAccess() {
    const session = await getSession();
    if (!session) return { allowed: false, signedIn: false, reason: "Sign in to use CodeChum." };
    try {
      const rows = await request(
        `/rest/v1/app_users?select=user_id,email,full_name,role,status,access_until&user_id=eq.${encodeURIComponent(session.user.id)}`,
        {
          headers: { Authorization: `Bearer ${session.access_token}` },
        },
      );
      const profile = rows[0];
      if (!profile)
        return {
          allowed: false,
          signedIn: true,
          email: session.user.email,
          reason: "This account has no extension access.",
        };
      if (profile.status !== "active")
        return {
          allowed: false,
          signedIn: true,
          email: session.user.email,
          reason: "Access is disabled.",
        };
      if (
        profile.role !== "admin" &&
        (!profile.access_until || Date.parse(profile.access_until) <= Date.now())
      ) {
        return {
          allowed: false,
          signedIn: true,
          email: session.user.email,
          reason: "Subscription access has expired.",
        };
      }
      return { allowed: true, signedIn: true, email: session.user.email, profile };
    } catch (error) {
      return {
        allowed: false,
        signedIn: true,
        email: session.user.email,
        reason: error.message || "Could not verify access.",
      };
    }
  }

  async function signOut() {
    const { authSession: session } = await chrome.storage.local.get("authSession");
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
        /* Local sign-out is still complete. */
      }
    }
  }

  async function updatePassword(currentPassword, newPassword) {
    if (newPassword.length < 12)
      throw new Error("Use at least 12 characters for the new password.");
    const session = await getSession();
    if (!session) throw new Error("Sign in again before changing your password.");
    await request("/auth/v1/user", {
      method: "PUT",
      headers: { Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ current_password: currentPassword, password: newPassword }),
    });
  }

  return { signIn, signOut, getSession, getAccess, updatePassword };
})();
