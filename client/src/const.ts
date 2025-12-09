export const getLoginUrl = () => {
  const oauthPortalUrl = import.meta.env.VITE_OAUTH_PORTAL_URL;
  
  // Se a variável não está configurada, não tente construir a URL
  if (!oauthPortalUrl || oauthPortalUrl === 'undefined') {
    console.warn('VITE_OAUTH_PORTAL_URL not configured');
    return null;
  }
  
  const redirectUri = `${window.location.origin}/api/oauth/callback`;
  const state = btoa(redirectUri);
  const url = new URL(`${oauthPortalUrl}/app-auth`);
  url.searchParams.set("appId", import.meta.env.VITE_APP_ID);
  url.searchParams.set("redirectUri", redirectUri);
  url.searchParams.set("state", state);
  url.searchParams.set("type", "signIn");
  
  return url.toString();
};
