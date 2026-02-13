export const getLoginUrl = () => {
  const url = new URL("/login", window.location.origin);
  return url.toString();
};
