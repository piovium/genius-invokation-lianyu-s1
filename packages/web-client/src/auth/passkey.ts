function decodeBase64Url(value: string): ArrayBuffer {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "="));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0)).buffer;
}

function encodeBase64Url(value: ArrayBuffer): string {
  const bytes = new Uint8Array(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function transports(response: AuthenticatorResponse) {
  return "getTransports" in response
    ? (response as AuthenticatorAttestationResponse).getTransports()
    : undefined;
}

export function isPasskeySupported() {
  return window.isSecureContext && "credentials" in navigator;
}

export async function createPasskey(
  options: PublicKeyCredentialCreationOptionsJSON,
) {
  const credential = (await navigator.credentials.create({
    publicKey: {
      ...options,
      challenge: decodeBase64Url(options.challenge),
      user: { ...options.user, id: decodeBase64Url(options.user.id) },
      excludeCredentials: options.excludeCredentials?.map((item) => ({
        ...item,
        id: decodeBase64Url(item.id),
      })),
    } as PublicKeyCredentialCreationOptions,
  })) as PublicKeyCredential | null;
  if (!credential) throw new Error("未创建 Passkey");
  const response = credential.response as AuthenticatorAttestationResponse;
  return {
    id: credential.id,
    rawId: encodeBase64Url(credential.rawId),
    type: credential.type,
    clientExtensionResults: credential.getClientExtensionResults(),
    response: {
      clientDataJSON: encodeBase64Url(response.clientDataJSON),
      attestationObject: encodeBase64Url(response.attestationObject),
      transports: transports(response),
    },
  };
}

export async function getPasskey(
  options: PublicKeyCredentialRequestOptionsJSON,
) {
  const credential = (await navigator.credentials.get({
    publicKey: {
      ...options,
      challenge: decodeBase64Url(options.challenge),
      allowCredentials: options.allowCredentials?.map((item) => ({
        ...item,
        id: decodeBase64Url(item.id),
      })),
    } as PublicKeyCredentialRequestOptions,
  })) as PublicKeyCredential | null;
  if (!credential) throw new Error("未选择 Passkey");
  const response = credential.response as AuthenticatorAssertionResponse;
  return {
    id: credential.id,
    rawId: encodeBase64Url(credential.rawId),
    type: credential.type,
    clientExtensionResults: credential.getClientExtensionResults(),
    response: {
      clientDataJSON: encodeBase64Url(response.clientDataJSON),
      authenticatorData: encodeBase64Url(response.authenticatorData),
      signature: encodeBase64Url(response.signature),
      userHandle: response.userHandle
        ? encodeBase64Url(response.userHandle)
        : undefined,
    },
  };
}
