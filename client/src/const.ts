export const getLoginUrl = () => {
  const redirectUri = `${window.location.origin}/api/github/callback`;
  const state = btoa(redirectUri);
  
  // Usar a rota local do servidor
  const url = new URL(`${window.location.origin}/api/github/login`);
  url.searchParams.set("state", state);
  
  return url.toString();
};
