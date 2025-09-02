export {};

declare global {
  let tempTokenStore:
    | Map<string, { cookie: string; expires: number }>
    | undefined;
}
