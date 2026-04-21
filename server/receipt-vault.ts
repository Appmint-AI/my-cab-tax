import { ObjectStorageService, objectStorageClient } from "./replit_integrations/object_storage/objectStorage";
import { setObjectAclPolicy } from "./replit_integrations/object_storage/objectAcl";
import { randomUUID } from "crypto";

const objectStorage = new ObjectStorageService();

function parseObjectPath(path: string): { bucketName: string; objectName: string } {
  if (!path.startsWith("/")) {
    path = `/${path}`;
  }
  const pathParts = path.split("/");
  if (pathParts.length < 3) {
    throw new Error("Invalid path: must contain at least a bucket name");
  }
  return {
    bucketName: pathParts[1],
    objectName: pathParts.slice(2).join("/"),
  };
}

export async function uploadToVault(
  fileBuffer: Buffer,
  userId: string,
  mimeType: string,
  retention: "basic" | "pro"
): Promise<string> {
  const privateDir = objectStorage.getPrivateObjectDir();
  const ext = mimeType === "image/png" ? ".png" : mimeType === "image/webp" ? ".webp" : ".jpg";
  const objectId = randomUUID();
  const year = new Date().getFullYear().toString();
  const fullPath = `${privateDir}/receipts/${userId}/${year}/${objectId}${ext}`;

  const { bucketName, objectName } = parseObjectPath(fullPath);
  const bucket = objectStorageClient.bucket(bucketName);
  const file = bucket.file(objectName);

  const metadata: Record<string, string> = {
    userId,
    uploadedAt: new Date().toISOString(),
  };

  if (retention === "pro") {
    metadata.retention = "7-years";
  }

  await file.save(fileBuffer, {
    contentType: mimeType,
    metadata: { metadata },
  });

  await setObjectAclPolicy(file, {
    owner: userId,
    visibility: "private",
  });

  return `/objects/receipts/${userId}/${year}/${objectId}${ext}`;
}

export async function getReceiptSignedUrl(objectPath: string): Promise<string> {
  if (!objectPath.startsWith("/objects/")) {
    return objectPath;
  }

  const entityId = objectPath.slice("/objects/".length);
  let entityDir = objectStorage.getPrivateObjectDir();
  if (!entityDir.endsWith("/")) {
    entityDir = `${entityDir}/`;
  }
  const fullObjectPath = `${entityDir}${entityId}`;
  const { bucketName, objectName } = parseObjectPath(fullObjectPath);

  const REPLIT_SIDECAR_ENDPOINT = "http://127.0.0.1:1106";
  const request = {
    bucket_name: bucketName,
    object_name: objectName,
    method: "GET",
    expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
  };
  const response = await fetch(
    `${REPLIT_SIDECAR_ENDPOINT}/object-storage/signed-object-url`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    }
  );
  if (!response.ok) {
    throw new Error(`Failed to sign object URL: ${response.status}`);
  }
  const { signed_url } = await response.json();
  return signed_url;
}

export async function deleteFromVault(objectPath: string): Promise<void> {
  if (!objectPath.startsWith("/objects/")) {
    return;
  }

  const entityId = objectPath.slice("/objects/".length);
  let entityDir = objectStorage.getPrivateObjectDir();
  if (!entityDir.endsWith("/")) {
    entityDir = `${entityDir}/`;
  }
  const fullObjectPath = `${entityDir}${entityId}`;
  const { bucketName, objectName } = parseObjectPath(fullObjectPath);
  const bucket = objectStorageClient.bucket(bucketName);
  const file = bucket.file(objectName);

  try {
    await file.delete();
  } catch (err: any) {
    if (err?.code !== 404) {
      throw err;
    }
  }
}

export async function getReceiptBuffer(objectPath: string): Promise<Buffer> {
  if (!objectPath.startsWith("/objects/")) {
    throw new Error("Invalid object path");
  }

  const entityId = objectPath.slice("/objects/".length);
  let entityDir = objectStorage.getPrivateObjectDir();
  if (!entityDir.endsWith("/")) {
    entityDir = `${entityDir}/`;
  }
  const fullObjectPath = `${entityDir}${entityId}`;
  const { bucketName, objectName } = parseObjectPath(fullObjectPath);
  const bucket = objectStorageClient.bucket(bucketName);
  const file = bucket.file(objectName);
  const [buffer] = await file.download();
  return buffer;
}
