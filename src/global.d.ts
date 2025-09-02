export {};

/* eslint-disable no-var */
declare global {
  var tempTokenStore:
    | Map<string, { cookie: string; expires: number }>
    | undefined;
}
