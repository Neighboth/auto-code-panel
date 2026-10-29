declare module "steam-totp" {
  export function generateAuthCode(sharedSecret: string, timeOffset?: number): string;
  export function getAuthCode(timeOffset?: number): Promise<string>;
  export function generateConfirmationKey(
    identitySecret: string,
    time: number | string,
    tag: string,
  ): string;
  export function getTimeOffset(params: { time: number; timeOffset?: number }): Promise<number>;
  export function time(timeOffset?: number): Promise<number>;
}
