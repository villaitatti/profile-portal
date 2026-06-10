import { getRuntimeConfig } from './runtime';

export const auth0Config = {
  get domain() {
    return getRuntimeConfig().auth0Domain;
  },
  get clientId() {
    return getRuntimeConfig().auth0ClientId;
  },
  get audience() {
    return getRuntimeConfig().auth0Audience;
  },
  get callbackUrl() {
    return getRuntimeConfig().auth0CallbackUrl;
  },
  get namespace() {
    return getRuntimeConfig().auth0Namespace;
  },
};
