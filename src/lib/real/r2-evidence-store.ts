import "server-only";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  HeadBucketCommand,
  ListObjectsV2Command,
} from "@aws-sdk/client-s3";
import type { PrivateEvidenceStore } from "./report-evidence";
import { AccountError } from "./errors";
let cached: R2EvidenceStore | undefined;
export function evidenceStoreConfigured() {
  return [
    "R2_ACCOUNT_ID",
    "R2_ACCESS_KEY_ID",
    "R2_SECRET_ACCESS_KEY",
    "R2_BUCKET_NAME",
    "R2_ENDPOINT",
  ].every((k) => Boolean(process.env[k]));
}
export function privateEvidenceStore() {
  if (!evidenceStoreConfigured())
    throw new AccountError(
      "El almacenamiento privado no está configurado.",
      503,
    );
  return (cached ??= new R2EvidenceStore());
}
export class R2EvidenceStore implements PrivateEvidenceStore {
  readonly bucket: string;
  readonly client: S3Client;
  constructor() {
    const endpoint = new URL(process.env.R2_ENDPOINT ?? "");
    if (
      endpoint.protocol !== "https:" ||
      endpoint.hostname !==
        `${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com` ||
      endpoint.username ||
      endpoint.password ||
      endpoint.port ||
      endpoint.pathname !== "/" ||
      endpoint.search ||
      endpoint.hash ||
      process.env.R2_BUCKET_NAME !== "draftory-report-evidence"
    )
      throw new AccountError(
        "Configuración de almacenamiento privado no válida.",
        503,
      );
    this.bucket = process.env.R2_BUCKET_NAME;
    this.client = new S3Client({
      endpoint: endpoint.origin,
      region: "auto",
      forcePathStyle: true,
      maxAttempts: 2,
      requestChecksumCalculation: "WHEN_REQUIRED",
      responseChecksumValidation: "WHEN_REQUIRED",
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID!,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
      },
    });
  }
  async check() {
    await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }), {
      abortSignal: AbortSignal.timeout(10000),
    });
  }
  async stage(key: string, bytes: Uint8Array, expiresAt: Date) {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: bytes,
        ContentType: "image/webp",
        CacheControl: "no-store",
        Metadata: { "staged-until": expiresAt.toISOString() },
      }),
      { abortSignal: AbortSignal.timeout(15000) },
    );
  }
  async commit(keys: string[]) {
    for (const key of keys)
      await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: key }),
        { abortSignal: AbortSignal.timeout(10000) },
      );
  }
  async remove(keys: string[]) {
    for (const key of keys)
      await this.client.send(
        new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
        { abortSignal: AbortSignal.timeout(10000) },
      );
  }
  async read(key: string) {
    const result = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      { abortSignal: AbortSignal.timeout(10000) },
    );
    if (!result.Body || Number(result.ContentLength) > 5 * 1024 * 1024)
      throw new AccountError("Evidencia no disponible.", 404);
    return result.Body.transformToByteArray();
  }
  async list(cursor?: string) {
    return this.client.send(
      new ListObjectsV2Command({
        Bucket: this.bucket,
        Prefix: "report-evidence/",
        MaxKeys: 100,
        ContinuationToken: cursor,
      }),
      { abortSignal: AbortSignal.timeout(10000) },
    );
  }
}
