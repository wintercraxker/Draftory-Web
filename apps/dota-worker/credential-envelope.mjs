import fs from "node:fs";
import path from "node:path";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";

function privatePath(file) {
  if (!path.isAbsolute(file) || fs.lstatSync(file).isSymbolicLink())
    throw Error("UNSAFE_KEYRING");
  for (let parent = path.dirname(file); ; parent = path.dirname(parent)) {
    if (fs.lstatSync(parent).isSymbolicLink()) throw Error("UNSAFE_KEYRING");
    if (parent === path.dirname(parent)) break;
  }
  if (process.platform !== "win32" && (fs.statSync(file).mode & 0o077) !== 0)
    throw Error("KEYRING_PERMISSIONS_REQUIRED");
  if (process.platform === "win32")
    execFileSync(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        "$ErrorActionPreference='Stop'; $sid=[System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value; $acl=Get-Acl -LiteralPath $env:DRAFTORY_KEY_FILE_TO_CHECK; foreach ($rule in $acl.Access) { if ($rule.AccessControlType -eq 'Allow') { $identity=$rule.IdentityReference.Translate([System.Security.Principal.SecurityIdentifier]).Value; if ($identity -ne $sid -and $identity -ne 'S-1-5-18') { exit 1 } } }",
      ],
      {
        env: { ...process.env, DRAFTORY_KEY_FILE_TO_CHECK: file },
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
        timeout: 5000,
      },
    );
}
export function lobbyKeyring(
  env = process.env,
  reference = env.DOTA_BOT_SECRET_REF,
) {
  const file = env.DOTA_LOBBY_KEYRING_FILE,
    environment = env.DRAFTORY_SECRET_ENVIRONMENT;
  if (
    (!file && !env.DRAFTORY_SECRET_KEYS && !env.DRAFTORY_LOBBY_KEYRINGS) ||
    !environment ||
    !/^[a-zA-Z0-9_-]{3,32}$/.test(environment)
  )
    throw Error("LOBBY_KEYRING_REQUIRED");
  let ring;
  if (env.DRAFTORY_LOBBY_KEYRINGS) {
    const rings = JSON.parse(env.DRAFTORY_LOBBY_KEYRINGS);
    ring = rings[reference];
    if (!ring) throw Error("LOBBY_KEYRING_REQUIRED");
  } else if (env.DRAFTORY_SECRET_KEYS) {
    ring = {
      version: 1,
      environment,
      purpose: "lobby",
      activeKeyId: env.DRAFTORY_SECRET_ACTIVE_KEY,
      keys: JSON.parse(env.DRAFTORY_SECRET_KEYS),
    };
  } else {
    privatePath(file);
    ring = JSON.parse(fs.readFileSync(file, "utf8"));
  }
  if (
    ring.version !== 1 ||
    ring.environment !== environment ||
    ring.purpose !== "lobby" ||
    !/^[a-zA-Z0-9_-]{1,64}$/.test(ring.activeKeyId ?? "") ||
    !ring.keys?.[ring.activeKeyId]
  )
    throw Error("LOBBY_KEYRING_INVALID");
  for (const [id, key] of Object.entries(ring.keys))
    if (
      !/^[a-zA-Z0-9_-]{1,64}$/.test(id) ||
      typeof key !== "string" ||
      Buffer.from(key, "base64").length !== 32
    )
      throw Error("LOBBY_KEYRING_INVALID");
  return ring;
}
const aad = (binding, environment, keyId) =>
  Buffer.from(
    JSON.stringify([
      "Draftory.LobbyCredentials.v1",
      environment,
      keyId,
      binding.id,
      binding.correlationId,
      binding.lobbyId,
      binding.publicName,
    ]),
  );
export function encryptLobbyCredentials(
  binding,
  credentials,
  env = process.env,
) {
  if (
    !binding.lobbyId ||
    credentials.lobbyId !== binding.lobbyId ||
    credentials.name !== binding.publicName ||
    !/^Sala Draftory [1-9][0-9]{5}$/.test(credentials.name) ||
    !/^[A-Za-z0-9]{12}$/.test(credentials.password)
  )
    throw Error("LOBBY_CREDENTIAL_BINDING_REJECTED");
  const ring = lobbyKeyring(env),
    key = Buffer.from(ring.keys[ring.activeKeyId], "base64"),
    nonce = randomBytes(12);
  const plain = Buffer.from(JSON.stringify(credentials));
  try {
    const cipher = createCipheriv("aes-256-gcm", key, nonce);
    cipher.setAAD(aad(binding, ring.environment, ring.activeKeyId));
    const encrypted = Buffer.concat([cipher.update(plain), cipher.final()]);
    return {
      version: 1,
      purpose: "lobby",
      environment: ring.environment,
      keyId: ring.activeKeyId,
      nonce: nonce.toString("base64"),
      tag: cipher.getAuthTag().toString("base64"),
      ciphertext: encrypted.toString("base64"),
    };
  } finally {
    key.fill(0);
    plain.fill(0);
  }
}
export function decryptLobbyCredentials(binding, envelope, env = process.env) {
  const ring = lobbyKeyring(env, binding.secretRef);
  if (
    !envelope ||
    envelope.version !== 1 ||
    envelope.purpose !== "lobby" ||
    envelope.environment !== ring.environment ||
    !ring.keys[envelope.keyId]
  )
    throw Error("LOBBY_CREDENTIAL_ENVELOPE_REJECTED");
  const key = Buffer.from(ring.keys[envelope.keyId], "base64"),
    nonce = Buffer.from(envelope.nonce, "base64"),
    tag = Buffer.from(envelope.tag, "base64");
  if (
    nonce.length !== 12 ||
    tag.length !== 16 ||
    typeof envelope.ciphertext !== "string" ||
    envelope.ciphertext.length > 4096
  ) {
    key.fill(0);
    throw Error("LOBBY_CREDENTIAL_ENVELOPE_REJECTED");
  }
  let plain;
  try {
    const cipher = createDecipheriv("aes-256-gcm", key, nonce);
    cipher.setAAD(aad(binding, ring.environment, envelope.keyId));
    cipher.setAuthTag(tag);
    plain = Buffer.concat([
      cipher.update(Buffer.from(envelope.ciphertext, "base64")),
      cipher.final(),
    ]);
    const v = JSON.parse(plain.toString());
    if (
      v.name !== binding.publicName ||
      v.lobbyId !== binding.lobbyId ||
      !/^[A-Za-z0-9]{12}$/.test(v.password)
    )
      throw Error("LOBBY_CREDENTIAL_BINDING_REJECTED");
    return v;
  } finally {
    key.fill(0);
    plain?.fill(0);
  }
}
