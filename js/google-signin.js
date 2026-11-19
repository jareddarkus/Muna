// "Sign in with Google" through Google's own button (Google Identity Services). The account chooser then says "Muna"
// instead of showing the Supabase address; Google hands back an ID token and Supabase signs the person in with it.
export const GOOGLE_CLIENT_ID = '983294835429-2vv78r66m936ar0qtskmh6icbksusv3b.apps.googleusercontent.com';

let loading;
function loadGsi() {
  loading ??= new Promise((resolve, reject) => {
    if (window.google?.accounts?.id) { resolve(); return; }
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client'; s.async = true;
    s.onload = () => resolve(); s.onerror = () => { loading = null; reject(new Error('Google script blocked')); };
    document.head.append(s);
    setTimeout(() => { if (!window.google?.accounts?.id) { loading = null; reject(new Error('Google script timed out')); } }, 8000);
  });
  return loading;
}
const sha256hex = async (text) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))].map((b) => b.toString(16).padStart(2, '0')).join('');

/** Draws Google's button inside `host`. Rejects when Google's script can't load (so the caller can show the classic button). */
export async function renderGoogleButton(host, signIn, onError) {
  await loadGsi();
  const raw = crypto.randomUUID(), hashed = await sha256hex(raw);
  window.google.accounts.id.initialize({
    client_id: GOOGLE_CLIENT_ID, nonce: hashed, ux_mode: 'popup', auto_select: false, itp_support: true, use_fedcm_for_prompt: false,
    callback: async (resp) => { try { await signIn(resp.credential, raw); } catch (e) { onError?.(e); } },
  });
  window.google.accounts.id.renderButton(host, { type: 'standard', theme: 'outline', size: 'large', text: 'continue_with', shape: 'pill', logo_alignment: 'center', width: Math.min(340, window.innerWidth - 50) });
}
