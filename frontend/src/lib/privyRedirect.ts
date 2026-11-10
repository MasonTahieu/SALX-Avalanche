// Google sign-in leaves the site and comes back with these query parameters.
// Privy can only finish that sign-in if it is running when the page loads.
const OAUTH_RETURN_PARAMS = ['privy_oauth_code', 'privy_oauth_state', 'privy_oauth_provider'];

export const isPrivyOAuthReturn = (search: string) => {
  const params = new URLSearchParams(search);
  return OAUTH_RETURN_PARAMS.every(name => Boolean(params.get(name)));
};
